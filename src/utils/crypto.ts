import crypto from 'node:crypto';

export function generateApiKey(): string {
  const random = crypto.randomBytes(32).toString('hex');
  return `sk_live_${random}`;
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function getKeyPrefix(key: string): string {
  return key.substring(0, 12);
}

export function hmacSign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
