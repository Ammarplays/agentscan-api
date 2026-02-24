import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../plugins/auth.js';
import { storage } from '../services/storage.js';
import { config } from '../config.js';

export async function resultsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string } }>('/api/v1/requests/:id/result', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params;

    // Verify request belongs to this API key
    const [scanReq] = await db.select().from(schema.scanRequests)
      .where(and(eq(schema.scanRequests.id, id), eq(schema.scanRequests.apiKeyId, request.apiKey!.id)))
      .limit(1);
    if (!scanReq) {
      return reply.status(404).send({ error: 'Request not found', code: 'NOT_FOUND', status: 404 });
    }

    const [result] = await db.select().from(schema.scanResults)
      .where(eq(schema.scanResults.requestId, id))
      .limit(1);
    if (!result) {
      return reply.status(404).send({ error: 'Result not yet available', code: 'NO_RESULT', status: 404 });
    }

    // Mark as picked up
    if (!result.pickedUp) {
      await db.update(schema.scanResults)
        .set({ pickedUp: true, pickedUpAt: new Date() })
        .where(eq(schema.scanResults.id, result.id));
    }

    return {
      id: result.id,
      request_id: result.requestId,
      pdf_url: `${config.baseUrl}/api/v1/requests/${id}/pdf`,
      text_url: `${config.baseUrl}/api/v1/requests/${id}/text`,
      pdf_size_bytes: result.pdfSizeBytes,
      page_count: result.pageCount,
      ocr_text_preview: result.ocrText.substring(0, 500),
      created_at: result.createdAt.toISOString(),
      picked_up: true,
      auto_delete_at: result.autoDeleteAt.toISOString(),
    };
  });

  fastify.get<{ Params: { id: string } }>('/api/v1/requests/:id/pdf', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params;

    const [scanReq] = await db.select().from(schema.scanRequests)
      .where(and(eq(schema.scanRequests.id, id), eq(schema.scanRequests.apiKeyId, request.apiKey!.id)))
      .limit(1);
    if (!scanReq) {
      return reply.status(404).send({ error: 'Request not found', code: 'NOT_FOUND', status: 404 });
    }

    const [result] = await db.select().from(schema.scanResults)
      .where(eq(schema.scanResults.requestId, id))
      .limit(1);
    if (!result) {
      return reply.status(404).send({ error: 'Result not yet available', code: 'NO_RESULT', status: 404 });
    }

    const fileExists = await storage.exists(result.pdfPath);
    if (!fileExists) {
      return reply.status(410).send({ error: 'PDF has been deleted', code: 'FILE_DELETED', status: 410 });
    }

    const data = await storage.read(result.pdfPath);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="scan-${id}.pdf"`)
      .header('Content-Length', data.length)
      .send(data);
  });

  fastify.get<{ Params: { id: string } }>('/api/v1/requests/:id/text', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params;

    const [scanReq] = await db.select().from(schema.scanRequests)
      .where(and(eq(schema.scanRequests.id, id), eq(schema.scanRequests.apiKeyId, request.apiKey!.id)))
      .limit(1);
    if (!scanReq) {
      return reply.status(404).send({ error: 'Request not found', code: 'NOT_FOUND', status: 404 });
    }

    const [result] = await db.select().from(schema.scanResults)
      .where(eq(schema.scanResults.requestId, id))
      .limit(1);
    if (!result) {
      return reply.status(404).send({ error: 'Result not yet available', code: 'NO_RESULT', status: 404 });
    }

    return reply.header('Content-Type', 'text/plain').send(result.ocrText);
  });
}
