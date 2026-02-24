import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { hashApiKey } from '../utils/crypto.js';
import type { ApiKey } from '../db/schema.js';

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ApiKey;
    deviceId?: string;
  }
}

export async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('apiKey', undefined);
  fastify.decorateRequest('deviceId', undefined);
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED', status: 401 });
  }

  const rawKey = header.slice(7);
  const keyHash = hashApiKey(rawKey);

  const [apiKey] = await db
    .select()
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.keyHash, keyHash), eq(schema.apiKeys.isActive, true)))
    .limit(1);

  if (!apiKey) {
    return reply.status(401).send({ error: 'Invalid API key', code: 'INVALID_KEY', status: 401 });
  }

  // Update last_used_at (fire and forget)
  db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, apiKey.id)).then(() => {});

  request.apiKey = apiKey;
}

export async function requireDeviceAuth(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  if (reply.sent) return;

  const deviceId = request.headers['x-device-id'] as string | undefined;
  if (!deviceId) {
    return reply.status(400).send({ error: 'Missing X-Device-Id header', code: 'MISSING_DEVICE_ID', status: 400 });
  }

  const [device] = await db
    .select()
    .from(schema.devices)
    .where(and(eq(schema.devices.id, deviceId), eq(schema.devices.apiKeyId, request.apiKey!.id)))
    .limit(1);

  if (!device) {
    return reply.status(403).send({ error: 'Device not found or not paired with this API key', code: 'DEVICE_NOT_FOUND', status: 403 });
  }

  // Update last_seen_at
  db.update(schema.devices).set({ lastSeenAt: new Date() }).where(eq(schema.devices.id, deviceId)).then(() => {});

  request.deviceId = deviceId;
}
