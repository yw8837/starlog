import "server-only";
import { krwPerUsd, usdOf } from "@/lib/ai/cost";
import type { Usage } from "@/lib/ai/provider";
import { kstDay } from "@/lib/security/quota";
import { dailyStore } from "./dailyStore";

/**
 * Server-side accounting in DAILY_KV, independent of cookies and of /api/commit (which only moves
 * the device's own cookie counters). Three kinds of keys:
 * - `count:<kstDay>:<kind>:<client>`: generations completed today by one client network (Gate.client,
 *   an HMAC of the IP under the signing secret; raw IPs are never stored). Written at `done`, in
 *   both response modes; checked before a generation starts (http.ts checkServerLimits).
 * - `cost:<kstDay>:<shard>`: estimated KRW billed today, from the usage of every upstream call
 *   (refused, cut-off and rejected drafts included). Spread over shards because KV takes about one
 *   write per second per key.
 * - `turns:<chapterId>`: follow-up answers given in one chapter, so replaying an older chapter token
 *   (fewer turns) cannot reset the per-chapter cap.
 * KV has no atomic increment and is eventually consistent (another location can read a value up to
 * about 60 s old), so every count here is approximate: two requests finishing together can count
 * once, and a burst can overshoot a limit by what the per-minute limiters let through. That is
 * accepted for a backstop; exact counts would need a Durable Object.
 */

export type SpendKind = "full" | "teaser" | "followup" | "daily";

const COUNT_TTL_SECONDS = 36 * 60 * 60;
const COST_TTL_SECONDS = 48 * 60 * 60;
/** chapter tokens live 7 days */
const TURNS_TTL_SECONDS = 8 * 24 * 60 * 60;
const COST_SHARDS = 8;
const DEFAULT_DAILY_BUDGET_KRW = 30_000;

const numberOf = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);

let warned = false;

/** A KV failure never fails a reading: counters read as 0 and writes are dropped, logged once per isolate. */
function warnOnce(error: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(JSON.stringify({ evt: "spend.kv_error", error: error instanceof Error ? error.constructor.name : typeof error }));
}

async function read(key: string): Promise<number> {
  try {
    return numberOf(await dailyStore().get(key));
  } catch (error) {
    warnOnce(error);
    return 0;
  }
}

async function write(key: string, value: number, ttlSeconds: number): Promise<void> {
  try {
    await dailyStore().put(key, value, ttlSeconds);
  } catch (error) {
    warnOnce(error);
  }
}

const countKey = (client: string, kind: SpendKind, now: number) => `count:${kstDay(now)}:${kind}:${client}`;

/** Generations of `kind` this client network completed today. */
export function clientCount(client: string, kind: SpendKind, now: number): Promise<number> {
  return read(countKey(client, kind, now));
}

export async function recordClientSpend(client: string, kind: SpendKind, now: number): Promise<void> {
  const key = countKey(client, kind, now);
  await write(key, (await read(key)) + 1, COUNT_TTL_SECONDS);
}

/** `BETA_DAILY_BUDGET_KRW`, else 30,000. 0 stops every new generation. */
export function dailyBudgetKrw(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.BETA_DAILY_BUDGET_KRW;
  const n = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_BUDGET_KRW;
}

/** Estimated KRW billed on this KST day, all clients and owners together. */
export async function spentTodayKrw(now: number): Promise<number> {
  const day = kstDay(now);
  const shards = await Promise.all(Array.from({ length: COST_SHARDS }, (_, i) => read(`cost:${day}:${i}`)));
  return shards.reduce((sum, krw) => sum + krw, 0);
}

/** True once today's estimated spend has reached the budget: no new generation starts (owners included). */
export async function overDailyBudget(now: number): Promise<boolean> {
  return (await spentTodayKrw(now)) >= dailyBudgetKrw();
}

/** Adds what `usage` cost to today's total (on one random shard). */
export async function recordCost(usage: readonly Usage[], now: number): Promise<void> {
  const krw = usdOf(usage) * krwPerUsd();
  if (!(krw > 0)) return;
  const key = `cost:${kstDay(now)}:${Math.floor(Math.random() * COST_SHARDS)}`;
  await write(key, (await read(key)) + krw, COST_TTL_SECONDS);
}

/** Follow-up answers the server has given in this chapter (0 when it has none on record). */
export function chapterTurns(chapterId: string): Promise<number> {
  return read(`turns:${chapterId}`);
}

export function recordChapterTurns(chapterId: string, turns: number): Promise<void> {
  return write(`turns:${chapterId}`, turns, TURNS_TTL_SECONDS);
}
