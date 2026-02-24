import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../plugins/auth.js';
import { config } from '../config.js';
import { notifyDeviceOfRequest } from '../services/push.js';

function autoExpire(request: schema.ScanRequest): schema.ScanRequest {
  if (request.status === 'pending' && request.expiresAt < new Date()) {
    return { ...request, status: 'expired' };
  }
  return request;
}

export async function requestsRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v1/requests', {
    preHandler: [requireAuth],
    schema: {
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string', minLength: 1 },
          device_id: { type: 'string' },
          webhook_url: { type: 'string' },
          webhook_secret: { type: 'string' },
          expires_in: { type: 'number', minimum: 60, maximum: 86400, default: 3600 },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      message: string; device_id?: string; webhook_url?: string;
      webhook_secret?: string; expires_in?: number;
    };

    const expiresIn = body.expires_in ?? config.defaultExpiresIn;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // If device_id provided, verify it belongs to this API key
    if (body.device_id) {
      const [device] = await db.select().from(schema.devices)
        .where(and(eq(schema.devices.id, body.device_id), eq(schema.devices.apiKeyId, request.apiKey!.id)))
        .limit(1);
      if (!device) {
        return reply.status(404).send({ error: 'Device not found', code: 'DEVICE_NOT_FOUND', status: 404 });
      }
    }

    const [scanReq] = await db.insert(schema.scanRequests).values({
      apiKeyId: request.apiKey!.id,
      deviceId: body.device_id ?? null,
      message: body.message,
      webhookUrl: body.webhook_url ?? null,
      webhookSecret: body.webhook_secret ?? null,
      expiresAt,
    }).returning();

    // Send push notification to device(s)
    if (body.device_id) {
      const [device] = await db.select().from(schema.devices).where(eq(schema.devices.id, body.device_id)).limit(1);
      if (device) {
        notifyDeviceOfRequest(device.deviceToken, scanReq.id, body.message).catch(() => {});
      }
    } else {
      // Notify all paired devices for this API key
      const deviceList = await db.select().from(schema.devices).where(eq(schema.devices.apiKeyId, request.apiKey!.id));
      for (const device of deviceList) {
        notifyDeviceOfRequest(device.deviceToken, scanReq.id, body.message).catch(() => {});
      }
    }

    return reply.status(201).send({
      id: scanReq.id,
      status: scanReq.status,
      message: scanReq.message,
      created_at: scanReq.createdAt.toISOString(),
      expires_at: scanReq.expiresAt.toISOString(),
    });
  });

  fastify.get('/api/v1/requests', {
    preHandler: [requireAuth],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'scanning', 'completed', 'expired', 'cancelled'] },
        },
      },
    },
  }, async (request) => {
    const { status } = request.query as { status?: string };
    const conditions = [eq(schema.scanRequests.apiKeyId, request.apiKey!.id)];
    if (status) {
      conditions.push(eq(schema.scanRequests.status, status));
    }

    const requests = await db.select().from(schema.scanRequests).where(and(...conditions));
    return requests.map(autoExpire).map(r => ({
      id: r.id,
      device_id: r.deviceId,
      message: r.message,
      status: r.status,
      created_at: r.createdAt.toISOString(),
      expires_at: r.expiresAt.toISOString(),
      completed_at: r.completedAt?.toISOString() ?? null,
    }));
  });

  fastify.get<{ Params: { id: string } }>('/api/v1/requests/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params;
    const [scanReq] = await db.select().from(schema.scanRequests)
      .where(and(eq(schema.scanRequests.id, id), eq(schema.scanRequests.apiKeyId, request.apiKey!.id)))
      .limit(1);

    if (!scanReq) {
      return reply.status(404).send({ error: 'Request not found', code: 'NOT_FOUND', status: 404 });
    }

    const r = autoExpire(scanReq);
    // Persist expired status if changed
    if (r.status !== scanReq.status) {
      await db.update(schema.scanRequests).set({ status: r.status }).where(eq(schema.scanRequests.id, id));
    }

    return {
      id: r.id,
      device_id: r.deviceId,
      message: r.message,
      status: r.status,
      webhook_url: r.webhookUrl,
      created_at: r.createdAt.toISOString(),
      expires_at: r.expiresAt.toISOString(),
      completed_at: r.completedAt?.toISOString() ?? null,
    };
  });

  fastify.delete<{ Params: { id: string } }>('/api/v1/requests/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params;
    const [updated] = await db.update(schema.scanRequests)
      .set({ status: 'cancelled' })
      .where(and(
        eq(schema.scanRequests.id, id),
        eq(schema.scanRequests.apiKeyId, request.apiKey!.id),
      ))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'Request not found', code: 'NOT_FOUND', status: 404 });
    }
    return { id: updated.id, status: 'cancelled' };
  });
}
