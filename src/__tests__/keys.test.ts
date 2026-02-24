import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getApp, closeApp, cleanDb, ensureTables, createTestKey, authHeader } from './helpers.js';

beforeAll(async () => { await ensureTables(); await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => { await cleanDb(); });

describe('API Keys', () => {
  it('POST /api/v1/keys creates a new key and returns raw key once', async () => {
    const { rawKey } = await createTestKey('bootstrap');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/keys',
      headers: { ...authHeader(rawKey), 'content-type': 'application/json' },
      payload: { name: 'new-key', owner_email: 'new@example.com' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.key).toBeDefined();
    expect(body.key).toMatch(/^sk_live_/);
    expect(body.name).toBe('new-key');
    expect(body.key_prefix).toBeDefined();
  });

  it('GET /api/v1/keys lists keys with prefix only', async () => {
    const { rawKey } = await createTestKey('my-key');
    const app = await getApp();
    const res = await app.inject({
      method: 'GET', url: '/api/v1/keys',
      headers: authHeader(rawKey),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    // Should have key_prefix but NOT the full key
    const k = body[0];
    expect(k.key_prefix).toBeDefined();
    expect(k.key).toBeUndefined();
  });

  it('DELETE /api/v1/keys/:id revokes a key', async () => {
    const { rawKey: bootstrapKey } = await createTestKey('bootstrap');
    const { key: targetKey } = await createTestKey('to-revoke');
    const app = await getApp();
    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/keys/${targetKey.id}`,
      headers: authHeader(bootstrapKey),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().is_active).toBe(false);
  });

  it('revoked key no longer works for requests', async () => {
    const { rawKey, key } = await createTestKey('will-revoke');
    const { rawKey: adminKey } = await createTestKey('admin');
    const app = await getApp();

    // Revoke the key
    await app.inject({
      method: 'DELETE', url: `/api/v1/keys/${key.id}`,
      headers: authHeader(adminKey),
    });

    // Try to use revoked key
    const res = await app.inject({
      method: 'GET', url: '/api/v1/keys',
      headers: authHeader(rawKey),
    });
    expect(res.statusCode).toBe(401);
  });
});
