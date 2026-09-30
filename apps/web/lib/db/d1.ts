import "server-only";
import { cloudflareEnv } from "@/lib/cloudflare";

/** The D1 binding (`DB` in wrangler.jsonc), typed minimally: only what the repositories call. */

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: { changes?: number };
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Binding {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
}

declare global {
  interface CloudflareEnv {
    DB?: D1Binding;
  }
}

/** The D1 database on Workers; null outside Workers (tests, `next dev`, `next start`). */
export function getDb(): D1Binding | null {
  return cloudflareEnv()?.DB ?? null;
}
