import type { Usage } from "./provider";

/**
 * What a generation costs, estimated from its token usage: the server's daily spend cap
 * (lib/api/spend.ts) and the smoke report use the same table.
 */

/** USD per million tokens (list prices; cache write = 5-minute TTL). Unknown models get the dearest row. */
export const PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  // server-side fallback targets
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
};

/** The most expensive row: a model missing from the table (a new fallback target) is never underpriced. */
const DEAREST = Object.values(PRICES).reduce((a, b) => (b.output > a.output || (b.output === a.output && b.input > a.input) ? b : a));

export function usdOf(usage: readonly Usage[]): number {
  return usage.reduce((sum, u) => {
    const p = PRICES[u.model] ?? DEAREST;
    return sum + (u.inputTokens * p.input + u.outputTokens * p.output + u.cacheWriteTokens * p.cacheWrite + u.cacheReadTokens * p.cacheRead) / 1e6;
  }, 0);
}

/** KRW per USD for estimates: `KRW_PER_USD`, else 1,500 (the rate plus a margin for VAT and FX moves). */
export function krwPerUsd(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.KRW_PER_USD);
  return Number.isFinite(n) && n > 0 ? n : 1500;
}
