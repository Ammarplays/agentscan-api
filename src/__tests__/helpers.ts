import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { db, schema } from '../db/index.js';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../utils/crypto.js';
import { sql } from 'drizzle-orm';

let app: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp({ logger: false });
    await app.ready();
  }
  return app;
}

export async function closeApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}

export async function cleanDb(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE scan_results, scan_requests, devices, api_keys CASCADE`);
}

export async function ensureTables(): Promise<void> {
  // Create tables if they don't exist
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      device_token TEXT NOT NULL,
      device_name TEXT NOT NULL,
      platform TEXT NOT NULL,
      paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS scan_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      webhook_url TEXT,
      webhook_secret TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS scan_results (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID NOT NULL UNIQUE REFERENCES scan_requests(id) ON DELETE CASCADE,
      pdf_path TEXT NOT NULL,
      pdf_size_bytes INTEGER NOT NULL,
      ocr_text TEXT NOT NULL,
      page_count INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      picked_up BOOLEAN NOT NULL DEFAULT FALSE,
      picked_up_at TIMESTAMPTZ,
      auto_delete_at TIMESTAMPTZ NOT NULL
    )
  `);
}

/**
 * Creates an API key directly in the DB and returns both the raw key and DB record.
 */
export async function createTestKey(name = 'test-key', email = 'test@example.com') {
  const rawKey = generateApiKey();
  const [key] = await db.insert(schema.apiKeys).values({
    name,
    keyHash: hashApiKey(rawKey),
    keyPrefix: getKeyPrefix(rawKey),
    ownerEmail: email,
  }).returning();
  return { rawKey, key };
}

/**
 * Creates a test device paired to the given API key.
 */
export async function createTestDevice(apiKeyId: string, opts?: { name?: string; platform?: string; token?: string }) {
  const [device] = await db.insert(schema.devices).values({
    apiKeyId,
    deviceToken: opts?.token ?? 'test-device-token',
    deviceName: opts?.name ?? 'Test Device',
    platform: opts?.platform ?? 'ios',
  }).returning();
  return device;
}

/**
 * Creates a test scan request.
 */
export async function createTestRequest(apiKeyId: string, opts?: {
  message?: string; deviceId?: string; webhookUrl?: string; webhookSecret?: string;
  expiresIn?: number; status?: string;
}) {
  const expiresAt = new Date(Date.now() + (opts?.expiresIn ?? 3600) * 1000);
  const [req] = await db.insert(schema.scanRequests).values({
    apiKeyId,
    deviceId: opts?.deviceId ?? null,
    message: opts?.message ?? 'Please scan this document',
    webhookUrl: opts?.webhookUrl ?? null,
    webhookSecret: opts?.webhookSecret ?? null,
    expiresAt,
    status: opts?.status ?? 'pending',
  }).returning();
  return req;
}

/**
 * Injects a request into the Fastify app (no actual HTTP needed).
 */
export async function inject(method: string, url: string, opts?: {
  headers?: Record<string, string>;
  payload?: unknown;
  body?: Buffer;
  contentType?: string;
}) {
  const a = await getApp();
  const injectOpts: any = {
    method,
    url,
    headers: opts?.headers ?? {},
  };
  if (opts?.payload) {
    injectOpts.payload = opts.payload;
  }
  if (opts?.body) {
    injectOpts.payload = opts.body;
    if (opts.contentType) {
      injectOpts.headers['content-type'] = opts.contentType;
    }
  }
  return a.inject(injectOpts);
}

export function authHeader(rawKey: string): Record<string, string> {
  return { Authorization: `Bearer ${rawKey}` };
}

export function deviceHeaders(rawKey: string, deviceId: string): Record<string, string> {
  return { Authorization: `Bearer ${rawKey}`, 'X-Device-Id': deviceId };
}
