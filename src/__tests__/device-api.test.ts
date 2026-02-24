import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getApp, closeApp, cleanDb, ensureTables, createTestKey, createTestDevice, createTestRequest, authHeader, deviceHeaders } from './helpers.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

beforeAll(async () => { await ensureTables(); await getApp(); });
afterAll(async () => {
  await closeApp();
  // Clean up test storage
  await fs.rm('./test-storage', { recursive: true, force: true }).catch(() => {});
});
beforeEach(async () => { await cleanDb(); });

// Minimal valid PDF buffer
const FAKE_PDF = Buffer.from('%PDF-1.4 fake pdf content for testing');

function buildMultipart(fields: Record<string, string>, file: { name: string; filename: string; data: Buffer }) {
  const boundary = '----TestBoundary' + crypto.randomBytes(8).toString('hex');
  const parts: Buffer[] = [];

  // Add fields first
  for (const [key, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
    ));
  }

  // Add file
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: application/pdf\r\n\r\n`
  ));
  parts.push(file.data);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe('Device API', () => {
  it('GET /api/v1/device/requests returns pending requests for device', async () => {
    const { rawKey, key } = await createTestKey();
    const device = await createTestDevice(key.id);
    await createTestRequest(key.id, { message: 'For device', deviceId: device.id });
    await createTestRequest(key.id, { message: 'For any device' }); // no deviceId = available to all

    const app = await getApp();
    const res = await app.inject({
      method: 'GET', url: '/api/v1/device/requests',
      headers: deviceHeaders(rawKey, device.id),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(2);
  });

  it('POST /api/v1/device/requests/:id/accept sets status to scanning', async () => {
    const { rawKey, key } = await createTestKey();
    const device = await createTestDevice(key.id);
    const req = await createTestRequest(key.id);
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/device/requests/${req.id}/accept`,
      headers: deviceHeaders(rawKey, device.id),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('scanning');
  });

  it('POST /api/v1/device/requests/:id/reject resets request', async () => {
    const { rawKey, key } = await createTestKey();
    const device = await createTestDevice(key.id);
    const req = await createTestRequest(key.id); // no deviceId -> shared
    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/device/requests/${req.id}/reject`,
      headers: deviceHeaders(rawKey, device.id),
    });
    expect(res.statusCode).toBe(200);
    // Shared request (no deviceId) stays pending
    expect(res.json().status).toBe('pending');
  });

  it('POST /api/v1/device/requests/:id/complete with multipart PDF works', async () => {
    const { rawKey, key } = await createTestKey();
    const device = await createTestDevice(key.id);
    const req = await createTestRequest(key.id, { status: 'scanning' });
    // Set deviceId on the request to match
    await db.update(schema.scanRequests).set({ deviceId: device.id }).where(eq(schema.scanRequests.id, req.id));

    const { body, contentType } = buildMultipart(
      { ocr_text: 'Hello world OCR text', page_count: '2' },
      { name: 'file', filename: 'scan.pdf', data: FAKE_PDF },
    );

    const app = await getApp();
    const res = await app.inject({
      method: 'POST', url: `/api/v1/device/requests/${req.id}/complete`,
      headers: { ...deviceHeaders(rawKey, device.id), 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('completed');
    expect(res.json().page_count).toBe(2);
  });

  it('after complete, GET /api/v1/requests/:id/pdf returns the PDF', async () => {
    const { rawKey, key } = await createTestKey();
    const device = await createTestDevice(key.id);
    const req = await createTestRequest(key.id, { status: 'scanning' });
    await db.update(schema.scanRequests).set({ deviceId: device.id }).where(eq(schema.scanRequests.id, req.id));

    const { body, contentType } = buildMultipart(
      { ocr_text: 'PDF text', page_count: '1' },
      { name: 'file', filename: 'scan.pdf', data: FAKE_PDF },
    );

    const app = await getApp();
    await app.inject({
      method: 'POST', url: `/api/v1/device/requests/${req.id}/complete`,
      headers: { ...deviceHeaders(rawKey, device.id), 'content-type': contentType },
      payload: body,
    });

    const pdfRes = await app.inject({
      method: 'GET', url: `/api/v1/requests/${req.id}/pdf`,
      headers: authHeader(rawKey),
    });
    expect(pdfRes.statusCode).toBe(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');
  });

  it('after complete, GET /api/v1/requests/:id/text returns OCR text', async () => {
    const { rawKey, key } = await createTestKey();
    const device = await createTestDevice(key.id);
    const req = await createTestRequest(key.id, { status: 'scanning' });
    await db.update(schema.scanRequests).set({ deviceId: device.id }).where(eq(schema.scanRequests.id, req.id));

    const { body, contentType } = buildMultipart(
      { ocr_text: 'Extracted OCR text here', page_count: '1' },
      { name: 'file', filename: 'scan.pdf', data: FAKE_PDF },
    );

    const app = await getApp();
    await app.inject({
      method: 'POST', url: `/api/v1/device/requests/${req.id}/complete`,
      headers: { ...deviceHeaders(rawKey, device.id), 'content-type': contentType },
      payload: body,
    });

    const textRes = await app.inject({
      method: 'GET', url: `/api/v1/requests/${req.id}/text`,
      headers: authHeader(rawKey),
    });
    expect(textRes.statusCode).toBe(200);
    expect(textRes.payload).toContain('Extracted OCR text here');
  });

  it('after complete, GET /api/v1/requests/:id/result returns full metadata', async () => {
    const { rawKey, key } = await createTestKey();
    const device = await createTestDevice(key.id);
    const req = await createTestRequest(key.id, { status: 'scanning' });
    await db.update(schema.scanRequests).set({ deviceId: device.id }).where(eq(schema.scanRequests.id, req.id));

    const { body, contentType } = buildMultipart(
      { ocr_text: 'Result text', page_count: '3' },
      { name: 'file', filename: 'scan.pdf', data: FAKE_PDF },
    );

    const app = await getApp();
    await app.inject({
      method: 'POST', url: `/api/v1/device/requests/${req.id}/complete`,
      headers: { ...deviceHeaders(rawKey, device.id), 'content-type': contentType },
      payload: body,
    });

    const resultRes = await app.inject({
      method: 'GET', url: `/api/v1/requests/${req.id}/result`,
      headers: authHeader(rawKey),
    });
    expect(resultRes.statusCode).toBe(200);
    const result = resultRes.json();
    expect(result.request_id).toBe(req.id);
    expect(result.page_count).toBe(3);
    expect(result.pdf_url).toContain(`/api/v1/requests/${req.id}/pdf`);
    expect(result.picked_up).toBe(true);
  });
});
