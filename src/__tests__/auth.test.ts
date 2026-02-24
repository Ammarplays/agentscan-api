import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getApp, closeApp, cleanDb, ensureTables, createTestKey, authHeader } from './helpers.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

beforeAll(async () => { await ensureTables(); await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => { await cleanDb(); });

describe('Authentication', () => {
  it('returns 401 without Authorization header', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/keys' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with invalid API key', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET', url: '/api/v1/keys',
      headers: { Authorization: 'Bearer sk_live_invalidkey123' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('INVALID_KEY');
  });

  it('passes with valid API key', async () => {
    const { rawKey } = await createTestKey();
    const app = await getApp();
    const res = await app.inject({
      method: 'GET', url: '/api/v1/keys',
      headers: authHeader(rawKey),
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 for revoked API key', async () => {
    const { rawKey, key } = await createTestKey();
    await db.update(schema.apiKeys).set({ isActive: false }).where(eq(schema.apiKeys.id, key.id));

    const app = await getApp();
    const res = await app.inject({
      method: 'GET', url: '/api/v1/keys',
      headers: authHeader(rawKey),
    });
    expect(res.statusCode).toBe(401);
  });
});
