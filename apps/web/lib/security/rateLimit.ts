import "server-only";
import { cloudflareEnv, warnMissingBinding } from "@/lib/cloudflare";

/** Per-IP rate limiter: the Workers Rate Limiting bindings, with an in-memory fallback. */

export type LimiterName =
  | "GEN_LIMITER" | "OWNER_GEN_LIMITER" | "FULL_LIMITER" | "OWNER_FULL_LIMITER" | "OWNER_LOGIN_LIMITER"
  | "BOND_JOIN_LIMITER" | "BOND_CODE_LIMITER" | "BOND_VIEW_LIMITER"
  | "AUTH_LIMITER" | "PAY_LIMITER" | "WEBHOOK_LIMITER" | "ME_LIMITER";

/**
 * Requests per 60 s; must match wrangler.jsonc so the in-memory fallback behaves like production.
 * Keyed by IP (IPv6 /64), which many people can share (carrier CGNAT, office or café Wi-Fi), so the
 * per-minute limits leave room for a crowd (final QA Q-01: the 6th full reading on one IP within a
 * minute was refused at 5).
 */
export const LIMITS_PER_MINUTE: Record<LimiterName, number> = {
  GEN_LIMITER: 60,
  OWNER_GEN_LIMITER: 150,
  /** full readings (the expensive calls), on top of GEN_LIMITER */
  FULL_LIMITER: 20,
  OWNER_FULL_LIMITER: 25,
  OWNER_LOGIN_LIMITER: 5,
  /** 별자리 인연: joins and new owners; failed invite-code lookups (against guessing codes); opening real codes and share images */
  BOND_JOIN_LIMITER: 10,
  BOND_CODE_LIMITER: 10,
  BOND_VIEW_LIMITER: 120,
  /** Kakao login start/callback, logout, delete intent, account readings (P4) */
  AUTH_LIMITER: 20,
  /** checkout, orders, confirm, refund (P4) */
  PAY_LIMITER: 20,
  /** Toss webhooks (P4) */
  WEBHOOK_LIMITER: 60,
  /** /api/me, which every page with an account line asks (P4): generous, like BOND_VIEW_LIMITER */
  ME_LIMITER: 120,
};

const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;
const windows = new Map<string, number[]>();

/** Sliding window used when the binding is absent (tests, `next dev`). Per isolate, best effort. */
function memoryLimit(name: LimiterName, key: string, now: number): boolean {
  const id = `${name}:${key}`;
  const recent = (windows.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  windows.delete(id); // re-inserted below, so the Map stays in least-recently-used order
  if (recent.length >= LIMITS_PER_MINUTE[name]) {
    windows.set(id, recent);
    return false;
  }
  recent.push(now);
  // Evict the least recently used keys instead of forgetting every window at once.
  while (windows.size >= MAX_TRACKED_KEYS) windows.delete(windows.keys().next().value!);
  windows.set(id, recent);
  return true;
}

/** True when the request may proceed. `key` is the client IP; it is never logged. */
export async function rateLimit(name: LimiterName, key: string, now = Date.now()): Promise<boolean> {
  const env = cloudflareEnv();
  const limiter = env?.[name];
  if (limiter) return (await limiter.limit({ key })).success;
  // On Workers a missing binding is a deploy mistake: say so once, then limit per isolate.
  if (env) warnMissingBinding(name);
  return memoryLimit(name, key, now);
}

/** Test hook: forget the in-memory windows. */
export function resetMemoryLimiter(): void {
  windows.clear();
}
