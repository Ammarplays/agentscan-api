import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, closeApp, ensureTables } from './helpers.js';

beforeAll(async () => { await ensureTables(); await getApp(); });
afterAll(async () => { await closeApp(); });

describe('GET /health', () => {
  it('returns 200 with status ok and version', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ status: 'ok', version: '1.0.0' });
  });
});
