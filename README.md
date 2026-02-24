<![CDATA[<div align="center">

# 📄 AgentsCan Cloud API

**Document request broker between AI agents and mobile users**

[![Tests](https://img.shields.io/badge/tests-32%20passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![Version](https://img.shields.io/badge/version-1.0.0-orange)]()

[Quick Start](#-quick-start) · [API Reference](#-api-reference) · [Deployment](docs/DEPLOYMENT.md) · [Integration Guide](docs/INTEGRATION_GUIDE.md)

</div>

---

## Overview

AgentsCan Cloud API is the backend service that connects **AI agents** (LangChain, n8n, custom bots) with **mobile devices** running the AgentsCan iOS scanner app. When an AI agent needs a physical document scanned, it creates a scan request through this API. The request is routed to a paired mobile device, the user scans the document, and the result (PDF + OCR text) is delivered back to the agent — all in real time.

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   AI Agent   │────────▶│  AgentsCan API   │────────▶│   iOS App       │
│  (n8n, etc.) │  HTTP   │  (Fastify + PG)  │  Push   │  (Scanner)      │
│              │◀────────│                  │◀────────│                 │
│  Get result  │  Poll   │  Stores results  │ Upload  │  Scan & OCR     │
└─────────────┘         └──────────────────┘         └─────────────────┘
        │                        │
        │                        ├── API Key auth (agents)
        │                        ├── Device auth (mobile)
        │                        ├── Webhook delivery
        │                        ├── Auto-cleanup (expired + TTL)
        │                        └── Rate limiting (100 req/min)
        │
        └── Webhook callback (optional)
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Fastify 5 |
| Database | PostgreSQL + Drizzle ORM |
| File Storage | Local filesystem (configurable) |
| Auth | SHA-256 hashed API keys |
| Rate Limiting | @fastify/rate-limit |
| File Upload | @fastify/multipart |
| Testing | Vitest (32 tests, 7 files) |

---

## 🚀 Quick Start

Get the API running locally in under 5 minutes.

### Prerequisites

- Node.js 18+
- PostgreSQL 15+ (via Homebrew, Docker, or native)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/Ammarplays/agentscan-api.git
cd agentscan-api

# 2. Install dependencies
npm install

# 3. Start PostgreSQL
brew services start postgresql@17
# OR: docker compose up -d

# 4. Create the database
createdb agentscan

# 5. Copy environment config
cp .env.example .env

# 6. Push the database schema
npx drizzle-kit push

# 7. Seed a test API key
npm run seed

# 8. Start the dev server
npm run dev

# 9. Verify it's running
curl http://localhost:3000/health
# → {"status":"ok","version":"1.0.0"}
```

The seed script will print a test API key to the console. Save it — you'll need it for the next steps.

---

## 🔑 Authentication

### API Key Auth (for AI agents)

All agent-facing endpoints require a Bearer token:

```
Authorization: Bearer ask_xxxxxxxxxxxxxxxxxxxx
```

API keys are SHA-256 hashed before storage. The raw key is only returned once at creation time.

### Device Auth (for mobile apps)

Device endpoints require **both** a Bearer token and a device ID header:

```
Authorization: Bearer ask_xxxxxxxxxxxxxxxxxxxx
X-Device-Id: <device-uuid>
```

### Admin Auth

Key management endpoints use the `ADMIN_SECRET` from your `.env`:

```
Authorization: Bearer <your-admin-secret>
```

---

## 📖 API Reference

Base URL: `http://localhost:3000`

### Health

```bash
GET /health
```

```bash
curl http://localhost:3000/health
```

Response:
```json
{"status": "ok", "version": "1.0.0"}
```

---

### API Keys

#### Create API Key

```bash
POST /api/v1/keys
Authorization: Bearer <ADMIN_SECRET>
```

```bash
curl -X POST http://localhost:3000/api/v1/keys \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Agent", "owner_email": "agent@example.com"}'
```

Response `201`:
```json
{
  "id": "uuid",
  "name": "My Agent",
  "key": "ask_xxxxxxxxxxxxxxxxxxxx",
  "key_prefix": "ask_xxxx",
  "owner_email": "agent@example.com",
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

> ⚠️ The `key` field is only returned once. Store it securely.

#### List API Keys

```bash
GET /api/v1/keys
Authorization: Bearer <ADMIN_SECRET>
```

```bash
curl http://localhost:3000/api/v1/keys \
  -H "Authorization: Bearer $ADMIN_SECRET"
```

Response `200`:
```json
[
  {
    "id": "uuid",
    "name": "My Agent",
    "key_prefix": "ask_xxxx",
    "owner_email": "agent@example.com",
    "created_at": "2025-01-01T00:00:00.000Z",
    "last_used_at": "2025-01-02T00:00:00.000Z",
    "is_active": true
  }
]
```

#### Revoke API Key

```bash
DELETE /api/v1/keys/:id
Authorization: Bearer <ADMIN_SECRET>
```

```bash
curl -X DELETE http://localhost:3000/api/v1/keys/$KEY_ID \
  -H "Authorization: Bearer $ADMIN_SECRET"
```

Response `200`:
```json
{"id": "uuid", "is_active": false}
```

---

### Devices

#### Pair Device

```bash
POST /api/v1/devices/pair
Authorization: Bearer <API_KEY>
```

```bash
curl -X POST http://localhost:3000/api/v1/devices/pair \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"device_token": "apns-token", "device_name": "iPhone 15", "platform": "ios"}'
```

Response `201`:
```json
{
  "id": "device-uuid",
  "device_name": "iPhone 15",
  "platform": "ios",
  "paired_at": "2025-01-01T00:00:00.000Z"
}
```

#### List Devices

```bash
GET /api/v1/devices
Authorization: Bearer <API_KEY>
```

```bash
curl http://localhost:3000/api/v1/devices \
  -H "Authorization: Bearer $API_KEY"
```

Response `200`:
```json
[
  {
    "id": "device-uuid",
    "device_name": "iPhone 15",
    "platform": "ios",
    "paired_at": "2025-01-01T00:00:00.000Z",
    "last_seen_at": "2025-01-02T00:00:00.000Z"
  }
]
```

#### Unpair Device

```bash
DELETE /api/v1/devices/:id
Authorization: Bearer <API_KEY>
```

```bash
curl -X DELETE http://localhost:3000/api/v1/devices/$DEVICE_ID \
  -H "Authorization: Bearer $API_KEY"
```

Response `200`:
```json
{"id": "device-uuid", "unpaired": true}
```

---

### Scan Requests

#### Create Scan Request

```bash
POST /api/v1/requests
Authorization: Bearer <API_KEY>
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | ✅ | Instructions for the scanner (e.g., "Scan your ID card") |
| `device_id` | string | ❌ | Target a specific device (omit to broadcast to all) |
| `webhook_url` | string | ❌ | URL to receive completion webhook |
| `webhook_secret` | string | ❌ | HMAC secret for webhook signature |
| `expires_in` | number | ❌ | Seconds until expiry (60–86400, default: 3600) |

```bash
curl -X POST http://localhost:3000/api/v1/requests \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Please scan your passport",
    "webhook_url": "https://example.com/webhook",
    "webhook_secret": "my-secret",
    "expires_in": 1800
  }'
```

Response `201`:
```json
{
  "id": "request-uuid",
  "status": "pending",
  "message": "Please scan your passport",
  "created_at": "2025-01-01T00:00:00.000Z",
  "expires_at": "2025-01-01T00:30:00.000Z"
}
```

#### List Scan Requests

```bash
GET /api/v1/requests?status=pending
Authorization: Bearer <API_KEY>
```

```bash
curl "http://localhost:3000/api/v1/requests?status=pending" \
  -H "Authorization: Bearer $API_KEY"
```

#### Get Scan Request

```bash
GET /api/v1/requests/:id
Authorization: Bearer <API_KEY>
```

```bash
curl http://localhost:3000/api/v1/requests/$REQUEST_ID \
  -H "Authorization: Bearer $API_KEY"
```

Response `200`:
```json
{
  "id": "request-uuid",
  "device_id": "device-uuid",
  "message": "Please scan your passport",
  "status": "completed",
  "webhook_url": "https://example.com/webhook",
  "created_at": "2025-01-01T00:00:00.000Z",
  "expires_at": "2025-01-01T00:30:00.000Z",
  "completed_at": "2025-01-01T00:05:00.000Z"
}
```

#### Cancel Scan Request

```bash
DELETE /api/v1/requests/:id
Authorization: Bearer <API_KEY>
```

```bash
curl -X DELETE http://localhost:3000/api/v1/requests/$REQUEST_ID \
  -H "Authorization: Bearer $API_KEY"
```

Response `200`:
```json
{"id": "request-uuid", "status": "cancelled"}
```

---

### Scan Results

#### Get Result Metadata

```bash
GET /api/v1/requests/:id/result
Authorization: Bearer <API_KEY>
```

```bash
curl http://localhost:3000/api/v1/requests/$REQUEST_ID/result \
  -H "Authorization: Bearer $API_KEY"
```

Response `200`:
```json
{
  "id": "result-uuid",
  "request_id": "request-uuid",
  "pdf_url": "http://localhost:3000/api/v1/requests/{id}/pdf",
  "text_url": "http://localhost:3000/api/v1/requests/{id}/text",
  "pdf_size_bytes": 245120,
  "page_count": 3,
  "ocr_text_preview": "First 500 characters of OCR text...",
  "created_at": "2025-01-01T00:05:00.000Z",
  "picked_up": true,
  "auto_delete_at": "2025-01-02T00:05:00.000Z"
}
```

#### Download PDF

```bash
GET /api/v1/requests/:id/pdf
Authorization: Bearer <API_KEY>
```

```bash
curl http://localhost:3000/api/v1/requests/$REQUEST_ID/pdf \
  -H "Authorization: Bearer $API_KEY" \
  -o scan.pdf
```

Returns: `application/pdf` binary data.

#### Get OCR Text

```bash
GET /api/v1/requests/:id/text
Authorization: Bearer <API_KEY>
```

```bash
curl http://localhost:3000/api/v1/requests/$REQUEST_ID/text \
  -H "Authorization: Bearer $API_KEY"
```

Returns: `text/plain` OCR extracted text.

---

### Device API

These endpoints are used by the mobile app to receive and fulfill scan requests.

#### Get Pending Requests

```bash
GET /api/v1/device/requests
Authorization: Bearer <API_KEY>
X-Device-Id: <DEVICE_ID>
```

```bash
curl http://localhost:3000/api/v1/device/requests \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Device-Id: $DEVICE_ID"
```

Response `200`:
```json
[
  {
    "id": "request-uuid",
    "message": "Please scan your passport",
    "status": "pending",
    "created_at": "2025-01-01T00:00:00.000Z",
    "expires_at": "2025-01-01T01:00:00.000Z"
  }
]
```

#### Accept Request

```bash
POST /api/v1/device/requests/:id/accept
Authorization: Bearer <API_KEY>
X-Device-Id: <DEVICE_ID>
```

```bash
curl -X POST http://localhost:3000/api/v1/device/requests/$REQUEST_ID/accept \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Device-Id: $DEVICE_ID"
```

Response `200`:
```json
{"id": "request-uuid", "status": "scanning"}
```

#### Reject Request

```bash
POST /api/v1/device/requests/:id/reject
Authorization: Bearer <API_KEY>
X-Device-Id: <DEVICE_ID>
```

```bash
curl -X POST http://localhost:3000/api/v1/device/requests/$REQUEST_ID/reject \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Device-Id: $DEVICE_ID"
```

Response `200`:
```json
{"id": "request-uuid", "status": "pending"}
```

> If the request was targeted to a specific device, it will be `cancelled` instead of reset to `pending`.

#### Complete Request (Upload Scan)

```bash
POST /api/v1/device/requests/:id/complete
Authorization: Bearer <API_KEY>
X-Device-Id: <DEVICE_ID>
Content-Type: multipart/form-data
```

| Field | Type | Description |
|-------|------|-------------|
| `pdf` | file | The scanned PDF document |
| `ocr_text` | string | Extracted OCR text |
| `page_count` | number | Number of pages |

```bash
curl -X POST http://localhost:3000/api/v1/device/requests/$REQUEST_ID/complete \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Device-Id: $DEVICE_ID" \
  -F "pdf=@scan.pdf" \
  -F "ocr_text=Extracted text from the document" \
  -F "page_count=3"
```

Response `201`:
```json
{
  "id": "result-uuid",
  "request_id": "request-uuid",
  "status": "completed",
  "pdf_size_bytes": 245120,
  "page_count": 3,
  "created_at": "2025-01-01T00:05:00.000Z"
}
```

---

### Webhooks

When a scan request is completed and a `webhook_url` was provided, the API sends a `POST` request:

**Payload:**
```json
{
  "event": "scan.completed",
  "request_id": "request-uuid",
  "message": "Please scan your passport",
  "result": {
    "pdf_url": "http://your-api.com/api/v1/requests/{id}/pdf",
    "text_url": "http://your-api.com/api/v1/requests/{id}/text",
    "page_count": 3,
    "ocr_text_preview": "First 500 characters..."
  },
  "completed_at": "2025-01-01T00:05:00.000Z"
}
```

**HMAC Signature Verification:**

If a `webhook_secret` was provided, the payload is signed with HMAC-SHA256 and sent in the `X-Webhook-Signature` header.

```javascript
// Node.js verification
const crypto = require('crypto');

function verifyWebhook(body, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

```python
# Python verification
import hmac, hashlib

def verify_webhook(body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

---

## ⚙️ Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://agentscan:agentscan@localhost:5432/agentscan` | PostgreSQL connection string |
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `STORAGE_PATH` | `./storage` | Local file storage directory |
| `BASE_URL` | `http://localhost:3000` | Public URL (used in webhook payloads & result URLs) |
| `ADMIN_SECRET` | — | Secret for admin endpoints (key management) |
| `CLEANUP_INTERVAL_MS` | `60000` | How often the cleanup job runs (ms) |
| `DEFAULT_EXPIRES_IN` | `3600` | Default request expiry in seconds |
| `RESULT_TTL_MS` | `86400000` | How long results are kept (24h default) |

---

## 🗄️ Database Schema

| Table | Description |
|-------|-------------|
| `api_keys` | API keys for agent authentication. Keys are SHA-256 hashed. Supports soft-delete via `is_active`. |
| `devices` | Paired mobile devices. Linked to an API key. Tracks platform and last activity. |
| `scan_requests` | Document scan requests from agents. Tracks status lifecycle: `pending` → `scanning` → `completed` / `expired` / `cancelled`. |
| `scan_results` | Completed scan results. Stores PDF path, OCR text, page count. Auto-deleted after TTL. |

---

## 🔒 Rate Limiting

All endpoints are rate-limited to **100 requests per minute** per API key via `@fastify/rate-limit`.

When exceeded, the API returns:

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded, retry in 60 seconds"
}
```

---

## 🧹 Auto-Cleanup

A background job runs every `CLEANUP_INTERVAL_MS` (default: 60 seconds):

1. **Expires pending requests** — Requests past their `expires_at` are marked `expired`
2. **Deletes old results** — Results past their `auto_delete_at` (default 24h) are permanently deleted, including the PDF file

---

## 🧪 Running Tests

```bash
npm test
```

Runs **32 tests** across **7 test files**:

- `health.test.ts` — Health endpoint
- `auth.test.ts` — Authentication & authorization
- `keys.test.ts` — API key CRUD
- `devices.test.ts` — Device pairing
- `requests.test.ts` — Scan request lifecycle
- `device-api.test.ts` — Device-side API
- `webhook.test.ts` — Webhook delivery

Tests use an in-memory test database and clean up after each run.

---

## 🚢 Deployment

See the full [Deployment Guide](docs/DEPLOYMENT.md) for Docker, Railway, Fly.io, and VPS instructions.

**Quick deploy with Docker:**

```bash
docker compose up -d
```

---

## 📚 More Documentation

- **[Full API Reference](docs/API_REFERENCE.md)** — Every endpoint with Python, JavaScript, and n8n examples
- **[Integration Guide](docs/INTEGRATION_GUIDE.md)** — n8n, Zapier, LangChain, custom agents
- **[Deployment Guide](docs/DEPLOYMENT.md)** — Docker, Railway, Fly.io, VPS
- **[Contributing](CONTRIBUTING.md)** — How to contribute
- **[Changelog](CHANGELOG.md)** — Version history

---

## License

[MIT](LICENSE)
]]>