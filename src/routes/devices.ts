import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../plugins/auth.js';

export async function devicesRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v1/devices/pair', {
    preHandler: [requireAuth],
    schema: {
      body: {
        type: 'object',
        required: ['device_token', 'device_name', 'platform'],
        properties: {
          device_token: { type: 'string', minLength: 1 },
          device_name: { type: 'string', minLength: 1 },
          platform: { type: 'string', enum: ['ios', 'android'] },
        },
      },
    },
  }, async (request, reply) => {
    const { device_token, device_name, platform } = request.body as {
      device_token: string; device_name: string; platform: string;
    };

    const [device] = await db.insert(schema.devices).values({
      apiKeyId: request.apiKey!.id,
      deviceToken: device_token,
      deviceName: device_name,
      platform,
    }).returning();

    return reply.status(201).send({
      id: device.id,
      device_name: device.deviceName,
      platform: device.platform,
      paired_at: device.pairedAt.toISOString(),
    });
  });

  fastify.get('/api/v1/devices', { preHandler: [requireAuth] }, async (request) => {
    const deviceList = await db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.apiKeyId, request.apiKey!.id));

    return deviceList.map(d => ({
      id: d.id,
      device_name: d.deviceName,
      platform: d.platform,
      paired_at: d.pairedAt.toISOString(),
      last_seen_at: d.lastSeenAt.toISOString(),
    }));
  });

  fastify.delete<{ Params: { id: string } }>('/api/v1/devices/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params;
    const [deleted] = await db
      .delete(schema.devices)
      .where(and(eq(schema.devices.id, id), eq(schema.devices.apiKeyId, request.apiKey!.id)))
      .returning();

    if (!deleted) {
      return reply.status(404).send({ error: 'Device not found', code: 'NOT_FOUND', status: 404 });
    }
    return { id: deleted.id, unpaired: true };
  });
}
