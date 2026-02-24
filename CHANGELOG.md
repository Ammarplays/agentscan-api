<![CDATA[# Changelog

All notable changes to the AgentsCan Cloud API will be documented in this file.

## [1.0.0] — 2025-02-24

### Added

- **Core API** — Full RESTful API for document scan request brokering
- **API Key Management** — Create, list, and revoke API keys with SHA-256 hashing
- **Device Pairing** — Pair and manage mobile scanner devices
- **Scan Request Lifecycle** — Create, list, get, and cancel scan requests with status tracking (pending → scanning → completed / expired / cancelled)
- **Scan Results** — PDF download, OCR text retrieval, and result metadata
- **Device API** — Device-side endpoints for receiving, accepting, rejecting, and completing scan requests with multipart PDF upload
- **Webhook Delivery** — Automatic webhook callbacks on scan completion with HMAC-SHA256 signature verification
- **Auto-Cleanup** — Background job to expire pending requests and delete old results (configurable TTL)
- **Rate Limiting** — 100 requests per minute per API key via @fastify/rate-limit
- **Authentication** — API key auth for agents, device auth (API key + device ID) for mobile apps
- **Test Suite** — 32 tests across 7 test files covering all endpoints and edge cases
- **Documentation** — Full API reference, integration guide, deployment guide, and contributing guidelines
]]>