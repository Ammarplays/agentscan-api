# AgentsCan Cloud API

Document request broker that lets AI agents request physical document scans from users via their iOS app.

## Quick Start

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
npm install

# 3. Copy env
cp .env.example .env

# 4. Push schema to database
npx drizzle-kit push

# 5. Create a test API key
npm run seed

# 6. Start the server
npm run dev
```

## API Overview

All endpoints (except `/health`) require `Authorization: Bearer <api_key>`.

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `POST /api/v1/keys` | Create API key |
| `GET /api/v1/keys` | List API keys |
| `DELETE /api/v1/keys/:id` | Revoke key |
| `POST /api/v1/devices/pair` | Pair a device |
| `GET /api/v1/devices` | List devices |
| `DELETE /api/v1/devices/:id` | Unpair device |
| `POST /api/v1/requests` | Create scan request |
| `GET /api/v1/requests` | List requests |
| `GET /api/v1/requests/:id` | Get request status |
| `DELETE /api/v1/requests/:id` | Cancel request |
| `GET /api/v1/requests/:id/pdf` | Download PDF |
| `GET /api/v1/requests/:id/text` | Get OCR text |
| `GET /api/v1/requests/:id/result` | Get result metadata |

### Device-facing (iOS app)

Requires `X-Device-Id` header.

| Endpoint | Description |
|---|---|
| `GET /api/v1/device/requests` | Get pending requests |
| `POST /api/v1/device/requests/:id/accept` | Accept request |
| `POST /api/v1/device/requests/:id/complete` | Upload scan result |
| `POST /api/v1/device/requests/:id/reject` | Reject request |

## Example Flow

```bash
# Create a scan request
curl -X POST http://localhost:3000/api/v1/requests \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"message": "Please scan your electricity bill"}'

# Device accepts it
curl -X POST http://localhost:3000/api/v1/device/requests/{id}/accept \
  -H "Authorization: Bearer sk_live_..." \
  -H "X-Device-Id: {device_id}"

# Device uploads result
curl -X POST http://localhost:3000/api/v1/device/requests/{id}/complete \
  -H "Authorization: Bearer sk_live_..." \
  -H "X-Device-Id: {device_id}" \
  -F "file=@scan.pdf" \
  -F "ocr_text=extracted text here" \
  -F "page_count=2"

# Agent retrieves result
curl http://localhost:3000/api/v1/requests/{id}/result \
  -H "Authorization: Bearer sk_live_..."
```

## Tech Stack

- **Runtime:** Node.js + Fastify
- **Database:** PostgreSQL + Drizzle ORM
- **Storage:** Local filesystem (S3 abstraction layer ready)
- **Push:** Firebase Cloud Messaging (stubbed)
