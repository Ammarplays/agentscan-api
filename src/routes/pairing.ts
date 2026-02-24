import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { requireSession } from '../plugins/session-auth.js';

function generatePairingToken(): string {
  return 'pair_' + crypto.randomBytes(16).toString('hex');
}

function generateShortCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  let code = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 4; i++) code += chars[bytes[i] % chars.length];
  code += '-';
  for (let i = 4; i < 8; i++) code += chars[bytes[i] % chars.length];
  return code;
}

export async function pairingRoutes(fastify: FastifyInstance) {
  // POST /api/v1/dashboard/pairing/generate — requires session
  fastify.post('/api/v1/dashboard/pairing/generate', { preHandler: [requireSession] }, async (request, reply) => {
    const userId = request.user!.userId;
    const { api_key_id } = request.body as { api_key_id?: string };

    // Find the API key to use
    let apiKey;
    if (api_key_id) {
      [apiKey] = await db.select().from(schema.apiKeys).where(and(eq(schema.apiKeys.id, api_key_id), eq(schema.apiKeys.userId, userId), eq(schema.apiKeys.isActive, true))).limit(1);
    } else {
      [apiKey] = await db.select().from(schema.apiKeys).where(and(eq(schema.apiKeys.userId, userId), eq(schema.apiKeys.isActive, true))).limit(1);
    }

    if (!apiKey) {
      return reply.status(400).send({ error: 'No active API key found. Create one first.', code: 'NO_API_KEY', status: 400 });
    }

    const token = generatePairingToken();
    const shortCode = generateShortCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const [session] = await db.insert(schema.pairingSessions).values({
      userId,
      apiKeyId: apiKey.id,
      token,
      shortCode,
      expiresAt,
    }).returning();

    // We need the raw API key for QR data — but we only store the hash.
    // The QR data includes the pairing token; the device uses that to pair and gets the API key prefix info.
    // Actually, we can't recover the raw key. The QR contains the pairing token; the device calls pair-with-token and gets the server_url.
    // For the QR flow, the device pairs with the token and the server returns a NEW api key or the key prefix.
    // Let's just include the pairing token and server URL in QR data.
    const qrData = JSON.stringify({
      server_url: config.baseUrl,
      pairing_token: token,
    });

    return {
      token,
      short_code: shortCode,
      qr_data: qrData,
      expires_at: expiresAt.toISOString(),
    };
  });

  // POST /api/v1/devices/pair-with-token — NO session auth, uses pairing token
  fastify.post('/api/v1/devices/pair-with-token', async (request, reply) => {
    const { pairing_token, device_name, platform, device_token } = request.body as {
      pairing_token: string; device_name: string; platform: string; device_token: string;
    };

    if (!pairing_token || !device_name || !platform || !device_token) {
      return reply.status(400).send({ error: 'Missing required fields: pairing_token, device_name, platform, device_token', code: 'VALIDATION_ERROR', status: 400 });
    }

    const [session] = await db.select().from(schema.pairingSessions).where(eq(schema.pairingSessions.token, pairing_token)).limit(1);

    if (!session) {
      return reply.status(404).send({ error: 'Invalid pairing token', code: 'INVALID_TOKEN', status: 404 });
    }
    if (session.used) {
      return reply.status(410).send({ error: 'Pairing token already used', code: 'TOKEN_USED', status: 410 });
    }
    if (new Date() > session.expiresAt) {
      return reply.status(410).send({ error: 'Pairing token expired', code: 'TOKEN_EXPIRED', status: 410 });
    }

    // Create device
    const [device] = await db.insert(schema.devices).values({
      apiKeyId: session.apiKeyId,
      deviceToken: device_token,
      deviceName: device_name,
      platform,
    }).returning();

    // Mark session as used
    await db.update(schema.pairingSessions).set({ used: true, deviceId: device.id }).where(eq(schema.pairingSessions.id, session.id));

    // Get the API key prefix for the device
    const [apiKey] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, session.apiKeyId)).limit(1);

    return {
      device_id: device.id,
      api_key_prefix: apiKey?.keyPrefix || null,
      server_url: config.baseUrl,
      message: 'Device paired successfully. Use your API key to authenticate requests.',
    };
  });

  // POST /api/v1/devices/pair-with-code — same as pair-with-token but uses short code
  fastify.post('/api/v1/devices/pair-with-code', async (request, reply) => {
    const { code, device_name, platform, device_token } = request.body as {
      code: string; device_name: string; platform: string; device_token: string;
    };

    if (!code || !device_name || !platform || !device_token) {
      return reply.status(400).send({ error: 'Missing required fields: code, device_name, platform, device_token', code: 'VALIDATION_ERROR', status: 400 });
    }

    const [session] = await db.select().from(schema.pairingSessions).where(eq(schema.pairingSessions.shortCode, code.toUpperCase())).limit(1);

    if (!session) {
      return reply.status(404).send({ error: 'Invalid pairing code', code: 'INVALID_CODE', status: 404 });
    }
    if (session.used) {
      return reply.status(410).send({ error: 'Pairing code already used', code: 'CODE_USED', status: 410 });
    }
    if (new Date() > session.expiresAt) {
      return reply.status(410).send({ error: 'Pairing code expired', code: 'CODE_EXPIRED', status: 410 });
    }

    const [device] = await db.insert(schema.devices).values({
      apiKeyId: session.apiKeyId,
      deviceToken: device_token,
      deviceName: device_name,
      platform,
    }).returning();

    await db.update(schema.pairingSessions).set({ used: true, deviceId: device.id }).where(eq(schema.pairingSessions.id, session.id));

    const [apiKey] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, session.apiKeyId)).limit(1);

    return {
      device_id: device.id,
      api_key_prefix: apiKey?.keyPrefix || null,
      server_url: config.baseUrl,
      message: 'Device paired successfully. Use your API key to authenticate requests.',
    };
  });
}
