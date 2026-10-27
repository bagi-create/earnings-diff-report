import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Optional persistence on Cloudflare KV (binding name: REPORT_CACHE).
 *
 * - AI summaries are cached by a hash of their input, so the same comparison
 *   never pays for a second Gemini call.
 * - A daily counter enforces AI_DAILY_LIMIT as a hard brake on spend.
 *
 * Without the binding everything still works: the cache is skipped and the
 * counter falls back to per-instance memory (a softer limit).
 */

interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

const memoryCounters = new Map<string, number>();

function kv(): KvLike | undefined {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    return env.REPORT_CACHE as KvLike | undefined;
  } catch {
    return undefined;
  }
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function readCache<T>(key: string): Promise<T | null> {
  const raw = await kv()?.get(`summary:${key}`).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  await kv()
    ?.put(`summary:${key}`, JSON.stringify(value), { expirationTtl: 60 * 60 * 24 * 180 })
    .catch(() => undefined);
}

function today(): string {
  // Japan time, so the budget resets at midnight JST.
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function dailyLimit(): number {
  const value = Number(process.env.AI_DAILY_LIMIT);
  return Number.isFinite(value) && value > 0 ? value : 300;
}

/** Reserve one AI call for today. Returns false once the daily limit is used up. */
export async function takeDailyQuota(): Promise<boolean> {
  const key = `usage:${today()}`;
  const store = kv();
  const used = store
    ? Number((await store.get(key).catch(() => null)) ?? 0)
    : (memoryCounters.get(key) ?? 0);
  if (used >= dailyLimit()) return false;
  if (store) await store.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 }).catch(() => undefined);
  else memoryCounters.set(key, used + 1);
  return true;
}
