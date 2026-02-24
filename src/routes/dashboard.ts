import { FastifyInstance } from 'fastify';
import { eq, and, count, sql, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireSession } from '../plugins/session-auth.js';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../utils/crypto.js';

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireSession);

  // GET /api/v1/dashboard/stats
  fastify.get('/api/v1/dashboard/stats', async (request) => {
    const userId = request.user!.userId;

    const userKeys = db.select({ id: schema.apiKeys.id }).from(schema.apiKeys).where(and(eq(schema.apiKeys.userId, userId), eq(schema.apiKeys.isActive, true)));

    const [totalReqs] = await db.select({ count: count() }).from(schema.scanRequests).where(sql`${schema.scanRequests.apiKeyId} IN (${userKeys})`);
    const [completedReqs] = await db.select({ count: count() }).from(schema.scanRequests).where(and(sql`${schema.scanRequests.apiKeyId} IN (${userKeys})`, eq(schema.scanRequests.status, 'completed')));
    const [pendingReqs] = await db.select({ count: count() }).from(schema.scanRequests).where(and(sql`${schema.scanRequests.apiKeyId} IN (${userKeys})`, eq(schema.scanRequests.status, 'pending')));
    const [totalDevs] = await db.select({ count: count() }).from(schema.devices).where(sql`${schema.devices.apiKeyId} IN (${userKeys})`);
    const [totalKeys] = await db.select({ count: count() }).from(schema.apiKeys).where(and(eq(schema.apiKeys.userId, userId), eq(schema.apiKeys.isActive, true)));

    return {
      totalRequests: totalReqs.count,
      completedRequests: completedReqs.count,
      pendingRequests: pendingReqs.count,
      totalDevices: totalDevs.count,
      totalKeys: totalKeys.count,
    };
  });

  // GET /api/v1/dashboard/keys
  fastify.get('/api/v1/dashboard/keys', async (request) => {
    const keys = await db.select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.keyPrefix,
      createdAt: schema.apiKeys.createdAt,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      isActive: schema.apiKeys.isActive,
    }).from(schema.apiKeys).where(eq(schema.apiKeys.userId, request.user!.userId)).orderBy(desc(schema.apiKeys.createdAt));
    return { keys };
  });

  // POST /api/v1/dashboard/keys
  fastify.post('/api/v1/dashboard/keys', async (request) => {
    const { name } = request.body as { name?: string };
    const rawKey = generateApiKey();

    const [key] = await db.insert(schema.apiKeys).values({
      name: name || 'Untitled Key',
      keyHash: hashApiKey(rawKey),
      keyPrefix: getKeyPrefix(rawKey),
      ownerEmail: request.user!.email,
      userId: request.user!.userId,
    }).returning();

    return { id: key.id, name: key.name, key: rawKey, keyPrefix: key.keyPrefix, createdAt: key.createdAt };
  });

  // DELETE /api/v1/dashboard/keys/:id
  fastify.delete('/api/v1/dashboard/keys/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await db.update(schema.apiKeys).set({ isActive: false }).where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.userId, request.user!.userId))).returning();
    if (result.length === 0) {
      return reply.status(404).send({ error: 'Key not found', code: 'NOT_FOUND', status: 404 });
    }
    return { success: true };
  });

  // GET /api/v1/dashboard/devices
  fastify.get('/api/v1/dashboard/devices', async (request) => {
    const devices = await db.select({
      id: schema.devices.id,
      deviceName: schema.devices.deviceName,
      platform: schema.devices.platform,
      pairedAt: schema.devices.pairedAt,
      lastSeenAt: schema.devices.lastSeenAt,
      apiKeyId: schema.devices.apiKeyId,
    }).from(schema.devices)
      .innerJoin(schema.apiKeys, eq(schema.devices.apiKeyId, schema.apiKeys.id))
      .where(eq(schema.apiKeys.userId, request.user!.userId))
      .orderBy(desc(schema.devices.pairedAt));
    return { devices };
  });

  // DELETE /api/v1/dashboard/devices/:id
  fastify.delete('/api/v1/dashboard/devices/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    // Verify device belongs to user
    const [device] = await db.select({ id: schema.devices.id }).from(schema.devices)
      .innerJoin(schema.apiKeys, eq(schema.devices.apiKeyId, schema.apiKeys.id))
      .where(and(eq(schema.devices.id, id), eq(schema.apiKeys.userId, request.user!.userId)))
      .limit(1);
    if (!device) {
      return reply.status(404).send({ error: 'Device not found', code: 'NOT_FOUND', status: 404 });
    }
    await db.delete(schema.devices).where(eq(schema.devices.id, id));
    return { success: true };
  });

  // GET /api/v1/dashboard/requests
  fastify.get('/api/v1/dashboard/requests', async (request) => {
    const { page = '1', limit = '20' } = request.query as { page?: string; limit?: string };
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const userKeys = db.select({ id: schema.apiKeys.id }).from(schema.apiKeys).where(eq(schema.apiKeys.userId, request.user!.userId));

    const requests = await db.select().from(schema.scanRequests)
      .where(sql`${schema.scanRequests.apiKeyId} IN (${userKeys})`)
      .orderBy(desc(schema.scanRequests.createdAt))
      .limit(limitNum)
      .offset(offset);

    const [total] = await db.select({ count: count() }).from(schema.scanRequests).where(sql`${schema.scanRequests.apiKeyId} IN (${userKeys})`);

    return { requests, total: total.count, page: pageNum, limit: limitNum };
  });

  // GET /api/v1/dashboard/requests/:id
  fastify.get('/api/v1/dashboard/requests/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userKeys = db.select({ id: schema.apiKeys.id }).from(schema.apiKeys).where(eq(schema.apiKeys.userId, request.user!.userId));

    const [req] = await db.select().from(schema.scanRequests).where(and(eq(schema.scanRequests.id, id), sql`${schema.scanRequests.apiKeyId} IN (${userKeys})`)).limit(1);
    if (!req) {
      return reply.status(404).send({ error: 'Request not found', code: 'NOT_FOUND', status: 404 });
    }

    const [result] = await db.select().from(schema.scanResults).where(eq(schema.scanResults.requestId, id)).limit(1);

    return { request: req, result: result || null };
  });
}
