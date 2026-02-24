<![CDATA[# AgentsCan Integration Guide

This guide covers how to integrate AgentsCan into your AI agent workflows.

## Table of Contents

- [n8n Integration](#n8n-integration)
- [Zapier Integration](#zapier-integration)
- [LangChain Integration](#langchain-integration)
- [Custom AI Agent](#custom-ai-agent)
- [Python SDK](#python-sdk)
- [Node.js SDK](#nodejs-sdk)

---

## n8n Integration

n8n is a workflow automation tool. Here's how to set up an end-to-end document scanning workflow.

### Step 1: Create Credentials

1. Open n8n and go to **Settings → Credentials**
2. Click **Add Credential → Header Auth**
3. Set:
   - **Name:** `AgentsCan API`
   - **Header Name:** `Authorization`
   - **Header Value:** `Bearer ask_your_api_key_here`

### Step 2: Build the Workflow

**Trigger → Create Scan Request → Wait → Poll for Result → Process Document**

#### Node 1: Trigger (Webhook or Schedule)

Set up a Webhook node to receive requests from your AI agent, or use a Schedule Trigger for periodic scanning.

#### Node 2: Create Scan Request (HTTP Request)

- **Method:** POST
- **URL:** `https://your-api.com/api/v1/requests`
- **Authentication:** Header Auth (AgentsCan API credential)
- **Body (JSON):**
  ```json
  {
    "message": "{{ $json.scan_instruction }}",
    "expires_in": 3600
  }
  ```

#### Node 3: Wait Node

- **Wait for:** 10 seconds (or use webhook-based completion)

#### Node 4: Poll for Result (HTTP Request)

- **Method:** GET
- **URL:** `https://your-api.com/api/v1/requests/{{ $json.id }}/result`
- **Authentication:** Header Auth (AgentsCan API credential)
- **On Error:** Continue (result may not be ready yet)

#### Node 5: IF Node (Check Status)

Check if the result endpoint returned 200. If not, loop back to the Wait node.

#### Node 6: Download PDF (HTTP Request)

- **Method:** GET
- **URL:** `{{ $json.pdf_url }}`
- **Response Format:** File
- **Authentication:** Header Auth (AgentsCan API credential)

### Webhook-Based Workflow (Recommended)

Instead of polling, use webhooks for instant notification:

1. Create a **Webhook** node in n8n (this gives you a URL)
2. When creating the scan request, set `webhook_url` to the n8n webhook URL
3. n8n will be triggered automatically when the scan is complete

```json
{
  "message": "Please scan the invoice",
  "webhook_url": "https://your-n8n.com/webhook/scan-complete",
  "webhook_secret": "your-secret"
}
```

### Complete n8n Workflow JSON

```json
{
  "name": "AgentsCan Document Scanner",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "scan-request",
        "responseMode": "responseNode"
      },
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{$env.AGENTSCAN_URL}}/api/v1/requests",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {"name": "Authorization", "value": "Bearer {{$env.AGENTSCAN_KEY}}"},
            {"name": "Content-Type", "value": "application/json"}
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={\"message\": \"{{$json.body.message}}\", \"webhook_url\": \"{{$env.N8N_WEBHOOK_URL}}\", \"expires_in\": 3600}"
      },
      "name": "Create Scan Request",
      "type": "n8n-nodes-base.httpRequest",
      "position": [450, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={\"request_id\": \"{{$json.id}}\", \"status\": \"{{$json.status}}\"}"
      },
      "name": "Respond to Webhook",
      "type": "n8n-nodes-base.respondToWebhook",
      "position": [650, 300]
    }
  ],
  "connections": {
    "Webhook Trigger": {"main": [[{"node": "Create Scan Request", "type": "main", "index": 0}]]},
    "Create Scan Request": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
  }
}
```

---

## Zapier Integration

### Using Webhooks by Zapier

1. **Trigger:** "Webhooks by Zapier" → Catch Hook (this creates a webhook URL)
2. **Action:** "Webhooks by Zapier" → POST
   - URL: `https://your-api.com/api/v1/requests`
   - Payload Type: JSON
   - Data:
     - `message`: Your scan instruction
     - `webhook_url`: The Zapier catch hook URL from step 1
     - `expires_in`: 3600

3. **When the scan completes**, the webhook fires back to Zapier
4. Add follow-up actions: save to Google Drive, email the PDF, update a spreadsheet, etc.

### Zapier Code Step (Advanced)

Use a Code by Zapier step to interact with the API:

```javascript
const response = await fetch("https://your-api.com/api/v1/requests", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${inputData.apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    message: inputData.message,
    webhook_url: inputData.webhookUrl,
    expires_in: 3600,
  }),
});

return await response.json();
```

---

## LangChain Integration

### As a LangChain Tool

```python
from langchain.tools import BaseTool
from pydantic import BaseModel, Field
import requests
import time


class ScanDocumentInput(BaseModel):
    message: str = Field(description="Instructions for what to scan")


class AgentsCanScanTool(BaseTool):
    """Tool that requests a physical document scan from a mobile device."""

    name: str = "scan_document"
    description: str = (
        "Request a physical document scan from a mobile device. "
        "Use this when you need to scan a physical document like an ID, "
        "passport, invoice, receipt, or any paper document. "
        "Returns the OCR text and a link to the PDF."
    )
    args_schema: type[BaseModel] = ScanDocumentInput

    api_url: str
    api_key: str
    poll_interval: int = 5
    timeout: int = 300

    def _run(self, message: str) -> str:
        headers = {"Authorization": f"Bearer {self.api_key}"}

        # Create scan request
        r = requests.post(
            f"{self.api_url}/api/v1/requests",
            headers={**headers, "Content-Type": "application/json"},
            json={"message": message, "expires_in": self.timeout},
        )
        r.raise_for_status()
        request_id = r.json()["id"]

        # Poll for result
        start = time.time()
        while time.time() - start < self.timeout:
            r = requests.get(
                f"{self.api_url}/api/v1/requests/{request_id}/result",
                headers=headers,
            )
            if r.status_code == 200:
                result = r.json()
                # Get the full OCR text
                text_r = requests.get(
                    f"{self.api_url}/api/v1/requests/{request_id}/text",
                    headers=headers,
                )
                return (
                    f"Scan completed ({result['page_count']} pages).\n"
                    f"OCR Text:\n{text_r.text}\n\n"
                    f"PDF URL: {result['pdf_url']}"
                )
            time.sleep(self.poll_interval)

        return "Scan timed out. The user may not have completed the scan."

    async def _arun(self, message: str) -> str:
        raise NotImplementedError("Use sync version")
```

### Usage with an Agent

```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate

# Create the tool
scan_tool = AgentsCanScanTool(
    api_url="https://your-api.com",
    api_key="ask_your_key_here",
)

# Create the agent
llm = ChatOpenAI(model="gpt-4o")
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant that can request document scans."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_openai_tools_agent(llm, [scan_tool], prompt)
executor = AgentExecutor(agent=agent, tools=[scan_tool], verbose=True)

result = executor.invoke({
    "input": "I need you to scan my passport for the visa application"
})
print(result["output"])
```

---

## Custom AI Agent

### Basic Flow

```
1. Agent creates a scan request via POST /api/v1/requests
2. Mobile user receives notification and scans the document
3. Agent polls GET /api/v1/requests/:id/result (or uses webhook)
4. Agent downloads PDF and/or reads OCR text
```

### Full Example (Python)

```python
import requests
import time

API_URL = "https://your-api.com"
API_KEY = "ask_your_key_here"

def request_scan(message: str, timeout: int = 300) -> dict:
    """Request a document scan and wait for the result."""
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    # 1. Create the request
    r = requests.post(f"{API_URL}/api/v1/requests", headers=headers, json={
        "message": message,
        "expires_in": timeout,
    })
    r.raise_for_status()
    request_id = r.json()["id"]
    print(f"📋 Scan request created: {request_id}")

    # 2. Poll for completion
    start = time.time()
    while time.time() - start < timeout:
        r = requests.get(
            f"{API_URL}/api/v1/requests/{request_id}",
            headers=headers,
        )
        status = r.json()["status"]
        print(f"   Status: {status}")

        if status == "completed":
            # 3. Get the result
            result = requests.get(
                f"{API_URL}/api/v1/requests/{request_id}/result",
                headers=headers,
            ).json()

            # 4. Get OCR text
            text = requests.get(
                f"{API_URL}/api/v1/requests/{request_id}/text",
                headers=headers,
            ).text

            return {
                "request_id": request_id,
                "page_count": result["page_count"],
                "pdf_url": result["pdf_url"],
                "ocr_text": text,
            }

        if status in ("expired", "cancelled"):
            raise Exception(f"Scan {status}")

        time.sleep(5)

    raise TimeoutError("Scan timed out")


# Usage
result = request_scan("Please scan your driver's license")
print(f"✅ Scanned {result['page_count']} pages")
print(f"📄 Text: {result['ocr_text'][:200]}...")
```

---

## Python SDK

A complete Python SDK class for the AgentsCan API:

```python
"""AgentsCan Python SDK"""

import time
import hmac
import hashlib
from typing import Optional
from dataclasses import dataclass

import requests


@dataclass
class ScanResult:
    request_id: str
    pdf_url: str
    text_url: str
    page_count: int
    pdf_size_bytes: int
    ocr_text_preview: str
    created_at: str
    auto_delete_at: str


@dataclass
class Device:
    id: str
    device_name: str
    platform: str
    paired_at: str
    last_seen_at: str


class AgentsCan:
    """Python SDK for the AgentsCan Cloud API."""

    def __init__(self, api_key: str, base_url: str = "https://api.agentscan.io"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        })

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def _check(self, r: requests.Response) -> dict:
        if not r.ok:
            error = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"error": r.text}
            raise AgentsCanError(r.status_code, error.get("error", "Unknown error"), error.get("code", "UNKNOWN"))
        return r.json() if r.headers.get("content-type", "").startswith("application/json") else {}

    # --- Health ---

    def health(self) -> dict:
        """Check API health."""
        return self._check(self.session.get(self._url("/health")))

    # --- Devices ---

    def list_devices(self) -> list[Device]:
        """List all paired devices."""
        data = self._check(self.session.get(self._url("/api/v1/devices")))
        return [Device(**d) for d in data]

    def pair_device(self, device_token: str, device_name: str, platform: str = "ios") -> Device:
        """Pair a new device."""
        data = self._check(self.session.post(self._url("/api/v1/devices/pair"), json={
            "device_token": device_token,
            "device_name": device_name,
            "platform": platform,
        }))
        return Device(id=data["id"], device_name=data["device_name"],
                      platform=data["platform"], paired_at=data["paired_at"], last_seen_at=data["paired_at"])

    def unpair_device(self, device_id: str) -> None:
        """Unpair a device."""
        self._check(self.session.delete(self._url(f"/api/v1/devices/{device_id}")))

    # --- Scan Requests ---

    def create_request(
        self,
        message: str,
        device_id: Optional[str] = None,
        webhook_url: Optional[str] = None,
        webhook_secret: Optional[str] = None,
        expires_in: int = 3600,
    ) -> dict:
        """Create a scan request."""
        body = {"message": message, "expires_in": expires_in}
        if device_id:
            body["device_id"] = device_id
        if webhook_url:
            body["webhook_url"] = webhook_url
        if webhook_secret:
            body["webhook_secret"] = webhook_secret
        return self._check(self.session.post(self._url("/api/v1/requests"), json=body))

    def get_request(self, request_id: str) -> dict:
        """Get scan request status."""
        return self._check(self.session.get(self._url(f"/api/v1/requests/{request_id}")))

    def list_requests(self, status: Optional[str] = None) -> list[dict]:
        """List scan requests, optionally filtered by status."""
        params = {"status": status} if status else {}
        return self._check(self.session.get(self._url("/api/v1/requests"), params=params))

    def cancel_request(self, request_id: str) -> dict:
        """Cancel a scan request."""
        return self._check(self.session.delete(self._url(f"/api/v1/requests/{request_id}")))

    # --- Results ---

    def get_result(self, request_id: str) -> ScanResult:
        """Get scan result metadata."""
        data = self._check(self.session.get(self._url(f"/api/v1/requests/{request_id}/result")))
        return ScanResult(
            request_id=data["request_id"], pdf_url=data["pdf_url"],
            text_url=data["text_url"], page_count=data["page_count"],
            pdf_size_bytes=data["pdf_size_bytes"],
            ocr_text_preview=data["ocr_text_preview"],
            created_at=data["created_at"], auto_delete_at=data["auto_delete_at"],
        )

    def get_pdf(self, request_id: str) -> bytes:
        """Download the scanned PDF."""
        r = self.session.get(self._url(f"/api/v1/requests/{request_id}/pdf"))
        r.raise_for_status()
        return r.content

    def get_text(self, request_id: str) -> str:
        """Get the OCR text."""
        r = self.session.get(self._url(f"/api/v1/requests/{request_id}/text"))
        r.raise_for_status()
        return r.text

    # --- Convenience ---

    def scan_and_wait(
        self,
        message: str,
        timeout: int = 300,
        poll_interval: int = 5,
        **kwargs,
    ) -> ScanResult:
        """Create a scan request and wait for the result."""
        req = self.create_request(message, expires_in=timeout, **kwargs)
        request_id = req["id"]

        start = time.time()
        while time.time() - start < timeout:
            try:
                return self.get_result(request_id)
            except AgentsCanError as e:
                if e.code != "NO_RESULT":
                    raise
            time.sleep(poll_interval)

        raise TimeoutError(f"Scan not completed within {timeout}s")

    # --- Webhook Verification ---

    @staticmethod
    def verify_webhook(body: bytes, signature: str, secret: str) -> bool:
        """Verify a webhook signature."""
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature, expected)


class AgentsCanError(Exception):
    def __init__(self, status: int, message: str, code: str):
        self.status = status
        self.message = message
        self.code = code
        super().__init__(f"[{status}] {code}: {message}")
```

### Usage

```python
client = AgentsCan(api_key="ask_your_key_here", base_url="https://your-api.com")

# One-liner: scan and wait
result = client.scan_and_wait("Please scan the receipt")
text = client.get_text(result.request_id)
print(text)

# Or download the PDF
pdf_bytes = client.get_pdf(result.request_id)
with open("scan.pdf", "wb") as f:
    f.write(pdf_bytes)
```

---

## Node.js SDK

```typescript
/**
 * AgentsCan Node.js SDK
 */

import crypto from "node:crypto";

interface ScanResult {
  id: string;
  request_id: string;
  pdf_url: string;
  text_url: string;
  pdf_size_bytes: number;
  page_count: number;
  ocr_text_preview: string;
  created_at: string;
  picked_up: boolean;
  auto_delete_at: string;
}

interface ScanRequest {
  id: string;
  status: string;
  message: string;
  created_at: string;
  expires_at: string;
}

interface CreateRequestOptions {
  message: string;
  device_id?: string;
  webhook_url?: string;
  webhook_secret?: string;
  expires_in?: number;
}

class AgentsCanError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(`[${status}] ${code}: ${message}`);
  }
}

class AgentsCan {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(apiKey: string, baseUrl = "https://api.agentscan.io") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText, code: "UNKNOWN" }));
      throw new AgentsCanError(res.status, err.code, err.error);
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json() as T;
    return res.text() as unknown as T;
  }

  // Health
  async health(): Promise<{ status: string; version: string }> {
    return this.request("GET", "/health");
  }

  // Devices
  async listDevices() {
    return this.request<any[]>("GET", "/api/v1/devices");
  }

  async pairDevice(deviceToken: string, deviceName: string, platform = "ios") {
    return this.request("POST", "/api/v1/devices/pair", {
      device_token: deviceToken,
      device_name: deviceName,
      platform,
    });
  }

  async unpairDevice(deviceId: string) {
    return this.request("DELETE", `/api/v1/devices/${deviceId}`);
  }

  // Scan Requests
  async createRequest(options: CreateRequestOptions): Promise<ScanRequest> {
    return this.request("POST", "/api/v1/requests", options);
  }

  async getRequest(requestId: string): Promise<ScanRequest & { device_id?: string }> {
    return this.request("GET", `/api/v1/requests/${requestId}`);
  }

  async listRequests(status?: string) {
    const qs = status ? `?status=${status}` : "";
    return this.request<ScanRequest[]>("GET", `/api/v1/requests${qs}`);
  }

  async cancelRequest(requestId: string) {
    return this.request("DELETE", `/api/v1/requests/${requestId}`);
  }

  // Results
  async getResult(requestId: string): Promise<ScanResult> {
    return this.request("GET", `/api/v1/requests/${requestId}/result`);
  }

  async getPdf(requestId: string): Promise<ArrayBuffer> {
    const res = await fetch(`${this.baseUrl}/api/v1/requests/${requestId}/pdf`, {
      headers: this.headers,
    });
    if (!res.ok) throw new AgentsCanError(res.status, "DOWNLOAD_FAILED", "PDF download failed");
    return res.arrayBuffer();
  }

  async getText(requestId: string): Promise<string> {
    return this.request("GET", `/api/v1/requests/${requestId}/text`);
  }

  // Convenience
  async scanAndWait(
    message: string,
    options: { timeout?: number; pollInterval?: number } = {},
  ): Promise<ScanResult> {
    const { timeout = 300, pollInterval = 5 } = options;
    const req = await this.createRequest({ message, expires_in: timeout });
    const start = Date.now();

    while (Date.now() - start < timeout * 1000) {
      try {
        return await this.getResult(req.id);
      } catch (e) {
        if (e instanceof AgentsCanError && e.code === "NO_RESULT") {
          await new Promise((r) => setTimeout(r, pollInterval * 1000));
          continue;
        }
        throw e;
      }
    }
    throw new Error(`Scan not completed within ${timeout}s`);
  }

  // Webhook verification
  static verifyWebhook(body: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
}

export { AgentsCan, AgentsCanError };
export type { ScanResult, ScanRequest, CreateRequestOptions };
```

### Usage

```typescript
import { AgentsCan } from "./agentscan";

const client = new AgentsCan("ask_your_key_here", "https://your-api.com");

// One-liner
const result = await client.scanAndWait("Please scan the invoice");
const text = await client.getText(result.request_id);
console.log(text);

// Download PDF
const pdf = await client.getPdf(result.request_id);
await Bun.write("scan.pdf", pdf); // or fs.writeFileSync
```
]]>