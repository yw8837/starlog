import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Per-IP rate limiter: the Workers Rate Limiting bindings, with an in-memory fallback. */

/** Workers Rate Limiting binding (wrangler.jsonc `ratelimits`). */
interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

declare global {
  interface CloudflareEnv {
    GEN_LIMITER?: RateLimitBinding;
    OWNER_GEN_LIMITER?: RateLimitBinding;
    OWNER_LOGIN_LIMITER?: RateLimitBinding;
  }
}

export type LimiterName = "GEN_LIMITER" | "OWNER_GEN_LIMITER" | "OWNER_LOGIN_LIMITER";

/** Requests per 60 s; must match wrangler.jsonc so the in-memory fallback behaves like production. */
export const LIMITS_PER_MINUTE: Record<LimiterName, number> = {
  GEN_LIMITER: 30,
  OWNER_GEN_LIMITER: 150,
  OWNER_LOGIN_LIMITER: 5,
};

const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;
const windows = new Map<string, number[]>();

/** Sliding window used when the binding is absent (tests, `next dev`). Per isolate, best effort. */
function memoryLimit(name: LimiterName, key: string, now: number): boolean {
  const id = `${name}:${key}`;
  const recent = (windows.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMITS_PER_MINUTE[name]) {
    windows.set(id, recent);
    return false;
  }
  recent.push(now);
  if (!windows.has(id) && windows.size >= MAX_TRACKED_KEYS) windows.clear();
  windows.set(id, recent);
  return true;
}

function binding(name: LimiterName): RateLimitBinding | undefined {
  try {
    return getCloudflareContext().env[name];
  } catch {
    return undefined; // not running on Workers
  }
}

/** True when the request may proceed. `key` is the client IP; it is never logged. */
export async function rateLimit(name: LimiterName, key: string, now = Date.now()): Promise<boolean> {
  const limiter = binding(name);
  if (limiter) return (await limiter.limit({ key })).success;
  return memoryLimit(name, key, now);
}

/** Test hook: forget the in-memory windows. */
export function resetMemoryLimiter(): void {
  windows.clear();
}
