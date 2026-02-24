import { config } from '../config.js';
import { hmacSign } from '../utils/crypto.js';
import type { ScanRequest, ScanResult } from '../db/schema.js';

export async function deliverWebhook(request: ScanRequest, result: ScanResult): Promise<void> {
  if (!request.webhookUrl) return;

  const body = JSON.stringify({
    event: 'scan.completed',
    request_id: request.id,
    message: request.message,
    result: {
      pdf_url: `${config.baseUrl}/api/v1/requests/${request.id}/pdf`,
      text_url: `${config.baseUrl}/api/v1/requests/${request.id}/text`,
      page_count: result.pageCount,
      ocr_text_preview: result.ocrText.substring(0, 500),
    },
    completed_at: request.completedAt?.toISOString(),
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (request.webhookSecret) {
    headers['X-Webhook-Signature'] = hmacSign(body, request.webhookSecret);
  }

  try {
    const response = await fetch(request.webhookUrl, { method: 'POST', headers, body });
    if (!response.ok) {
      console.error(`Webhook delivery failed: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.error('Webhook delivery error:', err);
  }
}
