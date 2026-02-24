import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getApp, closeApp, cleanDb, ensureTables, createTestKey, createTestDevice, authHeader } from './helpers.js';

beforeAll(async () => { await ensureTables(); await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => { await cleanDb(); });

describe('Devices', () => {
  it('POST /api/v1/devices/pair registers a new device', async () => {
    const { rawKey } = await createTestKey();
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/devices/pair',
      headers: { ...authHeader(rawKey), 'content-type': 'application/json' },
      payload: { device_token: 'tok123', device_name: 'iPhone 15', platform: 'ios' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.device_name).toBe('iPhone 15');
    expect(body.platform).toBe('ios');
  });

  it('GET /api/v1/devices lists paired devices', async () => {
    const { rawKey, key } = await createTestKey();
    await createTestDevice(key.id, { name: 'Device A' });
    await createTestDevice(key.id, { name: 'Device B' });
    const app = await getApp();
    const res = await app.inject({
      method: 'GET', url: '/api/v1/devices',
      headers: authHeader(rawKey),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(2);
  });

  it('DELETE /api/v1/devices/:id unpairs a device', async () => {
    const { rawKey, key } = await createTestKey();
    const device = await createTestDevice(key.id);
    const app = await getApp();
    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/devices/${device.id}`,
      headers: authHeader(rawKey),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().unpaired).toBe(true);
  });

  it('pairing with missing fields returns 400', async () => {
    const { rawKey } = await createTestKey();
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/devices/pair',
      headers: { ...authHeader(rawKey), 'content-type': 'application/json' },
      payload: { device_name: 'iPhone' }, // missing device_token and platform
    });
    expect(res.statusCode).toBe(400);
  });
});
