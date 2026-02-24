import { lt, eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { storage } from './storage.js';

export async function expirePendingRequests(): Promise<number> {
  const now = new Date();
  const expired = await db
    .update(schema.scanRequests)
    .set({ status: 'expired' })
    .where(and(eq(schema.scanRequests.status, 'pending'), lt(schema.scanRequests.expiresAt, now)))
    .returning({ id: schema.scanRequests.id });
  return expired.length;
}

export async function deleteExpiredResults(): Promise<number> {
  const now = new Date();
  const results = await db
    .select()
    .from(schema.scanResults)
    .where(lt(schema.scanResults.autoDeleteAt, now));

  for (const result of results) {
    await storage.delete(result.pdfPath);
    await db.delete(schema.scanResults).where(eq(schema.scanResults.id, result.id));
  }
  return results.length;
}

export function startCleanupInterval(intervalMs: number): NodeJS.Timer {
  const run = async () => {
    try {
      const expired = await expirePendingRequests();
      const deleted = await deleteExpiredResults();
      if (expired > 0 || deleted > 0) {
        console.log(`[Cleanup] Expired ${expired} requests, deleted ${deleted} results`);
      }
    } catch (err) {
      console.error('[Cleanup] Error:', err);
    }
  };
  run(); // run immediately once
  return setInterval(run, intervalMs);
}
