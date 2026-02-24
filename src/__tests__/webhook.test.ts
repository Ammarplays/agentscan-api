import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getApp, closeApp, cleanDb, ensureTables, createTestKey, createTestDevice, createTestRequest, deviceHeaders, authHeader } from './helpers.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const FAKE_PDF = Buffer.from('%PDF-1.4 fake pdf for webhook test');

function buildMultipart(fields: Record<string, string>, file: { name: string; filename: string; data: Buffer }) {
  const boundary = '----TestBoundary' + crypto.randomBytes(8).toString('hex');
  const parts: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: application/pdf\r\n\r\n`));
  parts.push(file.data);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

interface WebhookCapture {
  body: any;
  headers: http.IncomingHttpHeaders;
}

function createWebhookServer(): Promise<{ server: http.Server; port: number; getCaptures: () => WebhookCapture[] }> {
  return new Promise((resolve) => {
    const captures: WebhookCapture[] = [];
    const server = http.createServer((req, res) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => {
        captures.push({ body: JSON.parse(data), headers: req.headers });
        res.writeHead(200);
        res.end('ok');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port, getCaptures: () => captures });
    });
  });
}

let webhookServer: { server: http.Server; port: number; getCaptures: () => WebhookCapture[] };

beforeAll(async () => {
  await ensureTables();
  await getApp();
  webhookServer = await createWebhookServer();
});
afterAll(async () => {
  await closeApp();
  webhookServer.server.close();
  await fs.rm('./test-storage', { recursive: true, force: true }).catch(() => {});
});
beforeEach(async () => { await cleanDb(); });

async function completeRequest(rawKey: string, deviceId: string, requestId: string) {
  const { body, contentType } = buildMultipart(
    { ocr_text: 'Webhook OCR text', page_count: '1' },
    { name: 'file', filename: 'scan.pdf', data: FAKE_PDF },
  );
  const app = await getApp();
  await app.inject({
    method: 'POST', url: `/api/v1/device/requests/${requestId}/complete`,
    headers: { ...deviceHeaders(rawKey, deviceId), 'content-type': contentType },
    payload: body,
  });
  // Give webhook delivery a moment
  await new Promise(r => setTimeout(r, 500));
}

describe('Webhooks', () => {
  it('fires webhook when request is completed with webhook_url', async () => {
    const { rawKey, key } = await createTestKey();
    const device = await createTestDevice(key.id);
    const req = await createTestRequest(key.id, {
      status: 'scanning',
      webhookUrl: `http://127.0.0.1:${webhookServer.port}/hook`,
    });
    await db.update(schema.scanRequests).set({ deviceId: device.id }).where(eq(schema.scanRequests.id, req.id));

    await completeRequest(rawKey, device.id, req.id);

    const captures = webhookServer.getCaptures();
    expect(captures.length).toBeGreaterThanOrEqual(1);
    const last = captures[captures.length - 1];
    expect(last.body.event).toBe('scan.completed');
    expect(last.body.request_id).toBe(req.id);
  });

  it('webhook includes correct payload structure', async () => {
    const { rawKey, key } = await createTestKey();
    const device = await createTestDevice(key.id);
    const req = await createTestRequest(key.id, {
      status: 'scanning',
      message: 'Webhook payload test',
      webhookUrl: `http://127.0.0.1:${webhookServer.port}/hook`,
    });
    await db.update(schema.scanRequests).set({ deviceId: device.id }).where(eq(schema.scanRequests.id, req.id));

    await completeRequest(rawKey, device.id, req.id);

    const captures = webhookServer.getCaptures();
    const last = captures[captures.length - 1];
    expect(last.body.event).toBe('scan.completed');
    expect(last.body.request_id).toBe(req.id);
    expect(last.body.result).toBeDefined();
    expect(last.body.result.pdf_url).toContain('/pdf');
    expect(last.body.result.text_url).toContain('/text');
    expect(last.body.result.page_count).toBe(1);
  });

  it('webhook includes X-Webhook-Signature when secret is provided', async () => {
    const { rawKey, key } = await createTestKey();
    const device = await createTestDevice(key.id);
    const secret = 'my-webhook-secret';
    const req = await createTestRequest(key.id, {
      status: 'scanning',
      webhookUrl: `http://127.0.0.1:${webhookServer.port}/hook`,
      webhookSecret: secret,
    });
    await db.update(schema.scanRequests).set({ deviceId: device.id }).where(eq(schema.scanRequests.id, req.id));

    await completeRequest(rawKey, device.id, req.id);

    const captures = webhookServer.getCaptures();
    const last = captures[captures.length - 1];
    expect(last.headers['x-webhook-signature']).toBeDefined();
    // Verify the HMAC is correct
    const expectedSig = crypto.createHmac('sha256', secret).update(JSON.stringify(last.body)).digest('hex');
    expect(last.headers['x-webhook-signature']).toBe(expectedSig);
  });
});
