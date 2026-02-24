<![CDATA[# AgentsCan Cloud API — Full API Reference

> Base URL: `https://your-api.com` (or `http://localhost:3000` for local development)

## Table of Contents

- [Authentication](#authentication)
- [Error Format](#error-format)
- [Endpoints](#endpoints)
  - [Health](#health)
  - [API Keys](#api-keys)
  - [Devices](#devices)
  - [Scan Requests](#scan-requests)
  - [Scan Results](#scan-results)
  - [Device API](#device-api)
- [Webhooks](#webhooks)

---

## Authentication

### Agent Authentication

All agent endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer ask_xxxxxxxxxxxxxxxxxxxx
```

### Device Authentication

Device endpoints require both a Bearer token and the `X-Device-Id` header:

```
Authorization: Bearer ask_xxxxxxxxxxxxxxxxxxxx
X-Device-Id: <device-uuid>
```

### Admin Authentication

Key management endpoints use the `ADMIN_SECRET` configured in `.env`:

```
Authorization: Bearer <admin-secret>
```

---

## Error Format

All errors follow a consistent format:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "status": 404
}
```

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid Authorization header |
| `INVALID_KEY` | 401 | API key is invalid or revoked |
| `MISSING_DEVICE_ID` | 400 | Device endpoint called without X-Device-Id |
| `DEVICE_NOT_FOUND` | 403/404 | Device not found or not paired |
| `NOT_FOUND` | 404 | Resource not found |
| `NO_RESULT` | 404 | Scan result not yet available |
| `NO_FILE` | 400 | File upload missing |
| `EXPIRED` | 410 | Request has expired |
| `FILE_DELETED` | 410 | PDF has been auto-deleted |

---

## Endpoints

### Health

#### `GET /health`

**Auth:** None

**Response `200`:**
```json
{"status": "ok", "version": "1.0.0"}
```

<details>
<summary>curl</summary>

```bash
curl http://localhost:3000/health
```
</details>

<details>
<summary>Python</summary>

```python
import requests

r = requests.get("http://localhost:3000/health")
print(r.json())
```
</details>

<details>
<summary>JavaScript</summary>

```javascript
const res = await fetch("http://localhost:3000/health");
const data = await res.json();
console.log(data);
```
</details>

---

### API Keys

#### `POST /api/v1/keys` — Create API Key

**Auth:** Admin (`ADMIN_SECRET`)

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name for the key |
| `owner_email` | string | ✅ | Owner's email address |

**Response `201`:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "My Agent",
  "key": "ask_xxxxxxxxxxxxxxxxxxxx",
  "key_prefix": "ask_xxxx",
  "owner_email": "agent@example.com",
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

> ⚠️ The `key` field is only returned at creation time. Store it securely.

<details>
<summary>curl</summary>

```bash
curl -X POST http://localhost:3000/api/v1/keys \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Agent", "owner_email": "agent@example.com"}'
```
</details>

<details>
<summary>Python</summary>

```python
import requests

r = requests.post(
    "http://localhost:3000/api/v1/keys",
    headers={"Authorization": f"Bearer {ADMIN_SECRET}"},
    json={"name": "My Agent", "owner_email": "agent@example.com"}
)
key_data = r.json()
api_key = key_data["key"]  # Save this!
print(f"API Key: {api_key}")
```
</details>

<details>
<summary>JavaScript</summary>

```javascript
const res = await fetch("http://localhost:3000/api/v1/keys", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${ADMIN_SECRET}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ name: "My Agent", owner_email: "agent@example.com" }),
});
const { key } = await res.json();
console.log("API Key:", key); // Save this!
```
</details>

<details>
<summary>n8n Workflow</summary>

```json
{
  "nodes": [
    {
      "parameters": {
        "method": "POST",
        "url": "http://localhost:3000/api/v1/keys",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [{"name": "Authorization", "value": "Bearer {{$env.ADMIN_SECRET}}"}]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {"name": "name", "value": "n8n Agent"},
            {"name": "owner_email", "value": "n8n@example.com"}
          ]
        }
      },
      "name": "Create API Key",
      "type": "n8n-nodes-base.httpRequest",
      "position": [250, 300]
    }
  ]
}
```
</details>

---

#### `GET /api/v1/keys` — List API Keys

**Auth:** Admin

**Response `200`:** Array of API key objects (without the raw key).

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

<details>
<summary>curl</summary>

```bash
curl http://localhost:3000/api/v1/keys \
  -H "Authorization: Bearer $ADMIN_SECRET"
```
</details>

<details>
<summary>Python</summary>

```python
r = requests.get(
    "http://localhost:3000/api/v1/keys",
    headers={"Authorization": f"Bearer {ADMIN_SECRET}"}
)
for key in r.json():
    print(f"{key['name']} ({key['key_prefix']}...) - Active: {key['is_active']}")
```
</details>

---

#### `DELETE /api/v1/keys/:id` — Revoke API Key

**Auth:** Admin

**Response `200`:**
```json
{"id": "uuid", "is_active": false}
```

**Error `404`:** Key not found.

<details>
<summary>curl</summary>

```bash
curl -X DELETE http://localhost:3000/api/v1/keys/$KEY_ID \
  -H "Authorization: Bearer $ADMIN_SECRET"
```
</details>

---

### Devices

#### `POST /api/v1/devices/pair` — Pair Device

**Auth:** API Key

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `device_token` | string | ✅ | min 1 char (APNs/FCM token) |
| `device_name` | string | ✅ | min 1 char |
| `platform` | string | ✅ | `ios` or `android` |

**Response `201`:**
```json
{
  "id": "device-uuid",
  "device_name": "iPhone 15",
  "platform": "ios",
  "paired_at": "2025-01-01T00:00:00.000Z"
}
```

<details>
<summary>curl</summary>

```bash
curl -X POST http://localhost:3000/api/v1/devices/pair \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"device_token": "apns-token-here", "device_name": "iPhone 15", "platform": "ios"}'
```
</details>

<details>
<summary>Python</summary>

```python
r = requests.post(
    "http://localhost:3000/api/v1/devices/pair",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "device_token": "apns-token-here",
        "device_name": "iPhone 15",
        "platform": "ios"
    }
)
device = r.json()
print(f"Paired device: {device['id']}")
```
</details>

---

#### `GET /api/v1/devices` — List Devices

**Auth:** API Key

**Response `200`:** Array of paired devices for this API key.

<details>
<summary>curl</summary>

```bash
curl http://localhost:3000/api/v1/devices \
  -H "Authorization: Bearer $API_KEY"
```
</details>

---

#### `DELETE /api/v1/devices/:id` — Unpair Device

**Auth:** API Key

**Response `200`:**
```json
{"id": "device-uuid", "unpaired": true}
```

**Error `404`:** Device not found or doesn't belong to this API key.

---

### Scan Requests

#### `POST /api/v1/requests` — Create Scan Request

**Auth:** API Key

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `message` | string | ✅ | — | Instructions shown to the scanner |
| `device_id` | string | ❌ | null | Target a specific device |
| `webhook_url` | string | ❌ | null | Webhook URL for completion callback |
| `webhook_secret` | string | ❌ | null | HMAC secret for webhook signature |
| `expires_in` | number | ❌ | 3600 | Seconds until expiry (60–86400) |

**Response `201`:**
```json
{
  "id": "request-uuid",
  "status": "pending",
  "message": "Please scan your passport",
  "created_at": "2025-01-01T00:00:00.000Z",
  "expires_at": "2025-01-01T01:00:00.000Z"
}
```

**Status Lifecycle:**
```
pending → scanning → completed
pending → expired (auto, after expires_at)
pending → cancelled (manual)
scanning → completed
scanning → cancelled
```

<details>
<summary>curl</summary>

```bash
curl -X POST http://localhost:3000/api/v1/requests \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Please scan your passport",
    "webhook_url": "https://example.com/webhook",
    "webhook_secret": "whsec_mysecret",
    "expires_in": 1800
  }'
```
</details>

<details>
<summary>Python</summary>

```python
r = requests.post(
    "http://localhost:3000/api/v1/requests",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "message": "Please scan your passport",
        "webhook_url": "https://example.com/webhook",
        "webhook_secret": "whsec_mysecret",
        "expires_in": 1800
    }
)
scan_request = r.json()
print(f"Request ID: {scan_request['id']}")
print(f"Status: {scan_request['status']}")
```
</details>

<details>
<summary>JavaScript</summary>

```javascript
const res = await fetch("http://localhost:3000/api/v1/requests", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    message: "Please scan your passport",
    webhook_url: "https://example.com/webhook",
    expires_in: 1800,
  }),
});
const scanRequest = await res.json();
console.log(`Request ${scanRequest.id}: ${scanRequest.status}`);
```
</details>

<details>
<summary>n8n Workflow</summary>

```json
{
  "nodes": [
    {
      "parameters": {
        "method": "POST",
        "url": "={{$env.AGENTSCAN_API_URL}}/api/v1/requests",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {"name": "Authorization", "value": "Bearer {{$env.AGENTSCAN_API_KEY}}"},
            {"name": "Content-Type", "value": "application/json"}
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={\"message\": \"Please scan the document\", \"webhook_url\": \"{{$env.WEBHOOK_URL}}\", \"expires_in\": 3600}"
      },
      "name": "Create Scan Request",
      "type": "n8n-nodes-base.httpRequest",
      "position": [250, 300]
    }
  ]
}
```
</details>

---

#### `GET /api/v1/requests` — List Scan Requests

**Auth:** API Key

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status: `pending`, `scanning`, `completed`, `expired`, `cancelled` |

<details>
<summary>curl</summary>

```bash
# All requests
curl http://localhost:3000/api/v1/requests \
  -H "Authorization: Bearer $API_KEY"

# Completed only
curl "http://localhost:3000/api/v1/requests?status=completed" \
  -H "Authorization: Bearer $API_KEY"
```
</details>

---

#### `GET /api/v1/requests/:id` — Get Scan Request

**Auth:** API Key

**Response `200`:**
```json
{
  "id": "request-uuid",
  "device_id": "device-uuid",
  "message": "Please scan your passport",
  "status": "completed",
  "webhook_url": "https://example.com/webhook",
  "created_at": "2025-01-01T00:00:00.000Z",
  "expires_at": "2025-01-01T01:00:00.000Z",
  "completed_at": "2025-01-01T00:05:00.000Z"
}
```

---

#### `DELETE /api/v1/requests/:id` — Cancel Scan Request

**Auth:** API Key

**Response `200`:**
```json
{"id": "request-uuid", "status": "cancelled"}
```

---

### Scan Results

#### `GET /api/v1/requests/:id/result` — Get Result Metadata

**Auth:** API Key

Marks the result as "picked up" on first access.

**Response `200`:**
```json
{
  "id": "result-uuid",
  "request_id": "request-uuid",
  "pdf_url": "http://localhost:3000/api/v1/requests/{id}/pdf",
  "text_url": "http://localhost:3000/api/v1/requests/{id}/text",
  "pdf_size_bytes": 245120,
  "page_count": 3,
  "ocr_text_preview": "First 500 characters of the OCR text...",
  "created_at": "2025-01-01T00:05:00.000Z",
  "picked_up": true,
  "auto_delete_at": "2025-01-02T00:05:00.000Z"
}
```

**Error `404` (`NO_RESULT`):** Result not yet available (still scanning).

<details>
<summary>Python — Poll for result</summary>

```python
import time
import requests

def wait_for_result(api_url, api_key, request_id, timeout=300):
    """Poll for scan result with timeout."""
    start = time.time()
    while time.time() - start < timeout:
        r = requests.get(
            f"{api_url}/api/v1/requests/{request_id}/result",
            headers={"Authorization": f"Bearer {api_key}"}
        )
        if r.status_code == 200:
            return r.json()
        time.sleep(5)  # Poll every 5 seconds
    raise TimeoutError("Scan not completed in time")

result = wait_for_result("http://localhost:3000", API_KEY, request_id)
print(f"PDF: {result['pdf_url']}")
print(f"Pages: {result['page_count']}")
```
</details>

---

#### `GET /api/v1/requests/:id/pdf` — Download PDF

**Auth:** API Key

**Response:** `application/pdf` binary data with `Content-Disposition: attachment`.

**Error `410` (`FILE_DELETED`):** PDF has been auto-deleted after TTL.

<details>
<summary>Python — Download PDF</summary>

```python
r = requests.get(
    f"http://localhost:3000/api/v1/requests/{request_id}/pdf",
    headers={"Authorization": f"Bearer {API_KEY}"}
)
with open("scan.pdf", "wb") as f:
    f.write(r.content)
```
</details>

---

#### `GET /api/v1/requests/:id/text` — Get OCR Text

**Auth:** API Key

**Response:** `text/plain` — Full OCR extracted text.

---

### Device API

#### `GET /api/v1/device/requests` — Get Pending Requests

**Auth:** Device (API Key + X-Device-Id)

Returns pending requests for this device (targeted or broadcast).

---

#### `POST /api/v1/device/requests/:id/accept` — Accept Request

**Auth:** Device

Sets request status to `scanning` and assigns this device.

**Error `410` (`EXPIRED`):** Request has expired.

---

#### `POST /api/v1/device/requests/:id/reject` — Reject Request

**Auth:** Device

If the request was targeted to this device, it's `cancelled`. If broadcast, it resets to `pending` for other devices.

---

#### `POST /api/v1/device/requests/:id/complete` — Upload Scan Result

**Auth:** Device  
**Content-Type:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `pdf` | file | Scanned PDF document |
| `ocr_text` | string | OCR extracted text |
| `page_count` | string | Number of pages (as string in form data) |

After upload:
1. PDF is saved to local storage
2. Result record is created
3. Request status is set to `completed`
4. Webhook is delivered (if configured)

---

## Webhooks

### Payload Format

```json
{
  "event": "scan.completed",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Please scan your passport",
  "result": {
    "pdf_url": "https://your-api.com/api/v1/requests/{id}/pdf",
    "text_url": "https://your-api.com/api/v1/requests/{id}/text",
    "page_count": 3,
    "ocr_text_preview": "First 500 characters of OCR text..."
  },
  "completed_at": "2025-01-01T00:05:00.000Z"
}
```

### Signature Verification

When a `webhook_secret` is provided, the JSON body is signed with HMAC-SHA256 and sent in the `X-Webhook-Signature` header.

#### Node.js

```javascript
const crypto = require("crypto");

function verifyWebhook(rawBody, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature, "utf8"),
    Buffer.from(expected, "utf8")
  );
}

// Express example
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["x-webhook-signature"];
  if (!verifyWebhook(req.body, sig, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send("Invalid signature");
  }
  const event = JSON.parse(req.body);
  console.log(`Scan completed: ${event.request_id}`);
  res.sendStatus(200);
});
```

#### Python

```python
import hmac
import hashlib
from flask import Flask, request, abort

app = Flask(__name__)

def verify_webhook(body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)

@app.route("/webhook", methods=["POST"])
def webhook():
    sig = request.headers.get("X-Webhook-Signature", "")
    if not verify_webhook(request.data, sig, WEBHOOK_SECRET):
        abort(401)

    event = request.json
    print(f"Scan completed: {event['request_id']}")
    print(f"PDF: {event['result']['pdf_url']}")
    print(f"Text preview: {event['result']['ocr_text_preview']}")
    return "OK", 200
```
]]>