import { FastifyInstance } from 'fastify';
import { eq, and, or, isNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireDeviceAuth } from '../plugins/auth.js';
import { storage } from '../services/storage.js';
import { deliverWebhook } from '../services/webhook.js';
import { config } from '../config.js';
import crypto from 'node:crypto';

export async function deviceApiRoutes(fastify: FastifyInstance) {
  // Get pending requests for this device
  fastify.get('/api/v1/device/requests', { preHandler: [requireDeviceAuth] }, async (request) => {
    const requests = await db.select().from(schema.scanRequests)
      .where(and(
        eq(schema.scanRequests.apiKeyId, request.apiKey!.id),
        eq(schema.scanRequests.status, 'pending'),
        or(
          eq(schema.scanRequests.deviceId, request.deviceId!),
          isNull(schema.scanRequests.deviceId),
        ),
      ));

    const now = new Date();
    return requests
      .filter(r => r.expiresAt > now)
      .map(r => ({
        id: r.id,
        message: r.message,
        status: r.status,
        created_at: r.createdAt.toISOString(),
        expires_at: r.expiresAt.toISOString(),
      }));
  });

  // Accept a request (mark as scanning)
  fastify.post<{ Params: { id: string } }>('/api/v1/device/requests/:id/accept', { preHandler: [requireDeviceAuth] }, async (request, reply) => {
    const { id } = request.params;

    const [scanReq] = await db.select().from(schema.scanRequests)
      .where(and(
        eq(schema.scanRequests.id, id),
        eq(schema.scanRequests.apiKeyId, request.apiKey!.id),
        eq(schema.scanRequests.status, 'pending'),
      ))
      .limit(1);

    if (!scanReq) {
      return reply.status(404).send({ error: 'Request not found or not pending', code: 'NOT_FOUND', status: 404 });
    }

    if (scanReq.expiresAt < new Date()) {
      await db.update(schema.scanRequests).set({ status: 'expired' }).where(eq(schema.scanRequests.id, id));
      return reply.status(410).send({ error: 'Request has expired', code: 'EXPIRED', status: 410 });
    }

    const [updated] = await db.update(schema.scanRequests)
      .set({ status: 'scanning', deviceId: request.deviceId })
      .where(eq(schema.scanRequests.id, id))
      .returning();

    return { id: updated.id, status: 'scanning' };
  });

  // Complete a request (upload PDF + OCR text)
  fastify.post<{ Params: { id: string } }>('/api/v1/device/requests/:id/complete', { preHandler: [requireDeviceAuth] }, async (request, reply) => {
    const { id } = request.params;

    const [scanReq] = await db.select().from(schema.scanRequests)
      .where(and(
        eq(schema.scanRequests.id, id),
        eq(schema.scanRequests.apiKeyId, request.apiKey!.id),
        eq(schema.scanRequests.status, 'scanning'),
      ))
      .limit(1);

    if (!scanReq) {
      return reply.status(404).send({ error: 'Request not found or not in scanning state', code: 'NOT_FOUND', status: 404 });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded', code: 'NO_FILE', status: 400 });
    }

    const pdfBuffer = await data.toBuffer();
    const filename = `${id}-${crypto.randomUUID()}.pdf`;
    const pdfPath = await storage.save(filename, pdfBuffer);

    // Get OCR text and page count from form fields
    const fields = data.fields;
    const ocrTextField = fields['ocr_text'];
    const pageCountField = fields['page_count'];

    const ocrText = ocrTextField && 'value' in ocrTextField ? (ocrTextField as { value: string }).value : '';
    const pageCount = pageCountField && 'value' in pageCountField ? parseInt((pageCountField as { value: string }).value, 10) || 1 : 1;

    const now = new Date();
    const autoDeleteAt = new Date(now.getTime() + config.resultTtlMs);

    const [result] = await db.insert(schema.scanResults).values({
      requestId: id,
      pdfPath,
      pdfSizeBytes: pdfBuffer.length,
      ocrText,
      pageCount,
      autoDeleteAt,
    }).returning();

    await db.update(schema.scanRequests)
      .set({ status: 'completed', completedAt: now })
      .where(eq(schema.scanRequests.id, id));

    // Deliver webhook (fire and forget)
    const [updatedReq] = await db.select().from(schema.scanRequests).where(eq(schema.scanRequests.id, id)).limit(1);
    if (updatedReq) {
      deliverWebhook(updatedReq, result).catch(() => {});
    }

    return reply.status(201).send({
      id: result.id,
      request_id: id,
      status: 'completed',
      pdf_size_bytes: result.pdfSizeBytes,
      page_count: result.pageCount,
      created_at: result.createdAt.toISOString(),
    });
  });

  // Reject a request
  fastify.post<{ Params: { id: string } }>('/api/v1/device/requests/:id/reject', { preHandler: [requireDeviceAuth] }, async (request, reply) => {
    const { id } = request.params;

    const [scanReq] = await db.select().from(schema.scanRequests)
      .where(and(
        eq(schema.scanRequests.id, id),
        eq(schema.scanRequests.apiKeyId, request.apiKey!.id),
        or(
          eq(schema.scanRequests.status, 'pending'),
          eq(schema.scanRequests.status, 'scanning'),
        ),
      ))
      .limit(1);

    if (!scanReq) {
      return reply.status(404).send({ error: 'Request not found', code: 'NOT_FOUND', status: 404 });
    }

    // Reset to pending so another device can pick it up, or cancel if targeted
    const newStatus = scanReq.deviceId ? 'cancelled' : 'pending';
    await db.update(schema.scanRequests)
      .set({ status: newStatus, deviceId: null })
      .where(eq(schema.scanRequests.id, id));

    return { id, status: newStatus };
  });
}
