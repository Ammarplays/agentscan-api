import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../plugins/auth.js';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../utils/crypto.js';

export async function keysRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v1/keys', {
    preHandler: [requireAuth],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'owner_email'],
        properties: {
          name: { type: 'string', minLength: 1 },
          owner_email: { type: 'string', format: 'email' },
        },
      },
    },
  }, async (request, reply) => {
    const { name, owner_email } = request.body as { name: string; owner_email: string };
    const rawKey = generateApiKey();

    const [key] = await db.insert(schema.apiKeys).values({
      name,
      keyHash: hashApiKey(rawKey),
      keyPrefix: getKeyPrefix(rawKey),
      ownerEmail: owner_email,
    }).returning();

    return reply.status(201).send({
      id: key.id,
      name: key.name,
      key: rawKey, // Only returned once!
      key_prefix: key.keyPrefix,
      owner_email: key.ownerEmail,
      created_at: key.createdAt.toISOString(),
    });
  });

  fastify.get('/api/v1/keys', { preHandler: [requireAuth] }, async (request) => {
    const keys = await db.select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.keyPrefix,
      ownerEmail: schema.apiKeys.ownerEmail,
      createdAt: schema.apiKeys.createdAt,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      isActive: schema.apiKeys.isActive,
    }).from(schema.apiKeys);

    return keys.map(k => ({
      id: k.id,
      name: k.name,
      key_prefix: k.keyPrefix,
      owner_email: k.ownerEmail,
      created_at: k.createdAt.toISOString(),
      last_used_at: k.lastUsedAt?.toISOString() ?? null,
      is_active: k.isActive,
    }));
  });

  fastify.delete<{ Params: { id: string } }>('/api/v1/keys/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params;
    const [updated] = await db.update(schema.apiKeys).set({ isActive: false }).where(eq(schema.apiKeys.id, id)).returning();
    if (!updated) {
      return reply.status(404).send({ error: 'API key not found', code: 'NOT_FOUND', status: 404 });
    }
    return { id: updated.id, is_active: false };
  });
}
