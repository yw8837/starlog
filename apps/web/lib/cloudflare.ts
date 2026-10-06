import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Bindings declared in wrangler.jsonc, typed minimally (only what the app calls). */

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface KvBinding {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

declare global {
  interface CloudflareEnv {
    GEN_LIMITER?: RateLimitBinding;
    OWNER_GEN_LIMITER?: RateLimitBinding;
    FULL_LIMITER?: RateLimitBinding;
    OWNER_FULL_LIMITER?: RateLimitBinding;
    OWNER_LOGIN_LIMITER?: RateLimitBinding;
    AUTH_LIMITER?: RateLimitBinding;
    PAY_LIMITER?: RateLimitBinding;
    WEBHOOK_LIMITER?: RateLimitBinding;
    ME_LIMITER?: RateLimitBinding;
    DAILY_KV?: KvBinding;
    /** Worker secrets read from here, never process.env (lib/account/review.ts) */
    REVIEW_LOGIN_ID?: string;
    REVIEW_LOGIN_PASSWORD?: string;
  }
}

/** The Worker's env, or null outside Workers (tests, `next dev`, `next start`). */
export function cloudflareEnv(): CloudflareEnv | null {
  try {
    return getCloudflareContext().env;
  } catch {
    return null;
  }
}

const warned = new Set<string>();

/** One log line per isolate for a binding the Worker should have but does not. */
export function warnMissingBinding(name: string): void {
  if (warned.has(name)) return;
  warned.add(name);
  console.warn(JSON.stringify({ evt: "config.missing_binding", binding: name }));
}
