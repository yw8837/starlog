import "server-only";
import { krwPerUsd, usdOf } from "@/lib/ai/cost";
import type { Usage } from "@/lib/ai/provider";
import { cloudflareEnv } from "@/lib/cloudflare";
import { kstDay } from "@/lib/security/quota";
import { dailyStore, logKvError } from "./dailyStore";

/**
 * Server-side accounting in DAILY_KV, independent of cookies and of /api/commit (which only moves
 * the device's own cookie counters). Four kinds of keys here (the paid book's `paidcost:` is at addPaidCost):
 * - `count:<kstDay>:<kind>:<client>`: generations started today by one client network (Gate.client,
 *   a keyed hash of the IP; raw IPs are never stored). Charged when a generation starts, so a
 *   client that disconnects before `done` is still counted; checked before the next one
 *   (http.ts checkServerLimits).
 * - `cost:<kstDay>:<shard>`: estimated KRW billed today. Each upstream call reserves its worst case
 *   when it starts and is reconciled to its real usage when it ends (SpendLedger): a call that was
 *   cut off after the model began answering stays charged at its reservation, one that failed
 *   before any token was billed releases it. Spread over shards because KV takes about one write
 *   per second per key; a write that fails moves to another shard, and repeated write failures make
 *   the total "unknown" (it would otherwise stop growing while reads still work).
 * - `netcost:<kstDay>:<client>:<shard>`: the part of that cost billed for one client network's
 *   free-tier generations (SEC-01), so one network cannot spend the whole day's budget; mirrored
 *   from the same ledger writes (respondGeneration), one write each, never retried on another shard.
 * - `turns:<chapterId>`: follow-up answers given in one chapter, so replaying an older chapter token
 *   (fewer turns) cannot reset the per-chapter cap.
 * KV has no atomic increment and is eventually consistent (another location can read a value up to
 * about 60 s old), so every count here is approximate: two writes racing on one key can lose one,
 * and a burst can overshoot by what the per-minute limiters let through. The budget therefore trips
 * at 80% (BUDGET_TRIP). Exact counts need a Durable Object (one per day for the cost total, one per
 * client for its counters); that is the planned replacement for this module.
 */

export type SpendKind = "full" | "teaser" | "followup" | "daily" | "line";

const COUNT_TTL_SECONDS = 36 * 60 * 60;
const COST_TTL_SECONDS = 48 * 60 * 60;
/** standard chapter tokens live 7 days; a premium chapter's count passes its own expiry (recordChapterTurns `ttlSeconds`) */
const TURNS_TTL_SECONDS = 8 * 24 * 60 * 60;
const COST_SHARDS = 8;
/** a cost write that fails tries this many shards in all */
const COST_WRITE_TRIES = 3;
const DEFAULT_DAILY_BUDGET_KRW = 30_000;
/** Lost KV updates make the total run low, so the cap trips at 80% of the budget. */
export const BUDGET_TRIP = 0.8;
/** SEC-01: the share of the day's budget one client network's free-tier generations may cost. */
export const NETWORK_BUDGET_SHARE = 0.2;
const NETWORK_COST_SHARDS = 4;

// ---- KV access: every error is logged (at most one line per 10 s per isolate, with a count) ----

/** A stored number, 0 when absent, or null when KV could not be read. */
async function read(key: string): Promise<number | null> {
  try {
    const value = await dailyStore().get(key);
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  } catch (error) {
    logKvError("spend.kv_error", "read", error);
    return null;
  }
}

/** True when written. A failed write is logged, never thrown: accounting never fails a reading. */
async function write(key: string, value: number, ttlSeconds: number): Promise<boolean> {
  try {
    await dailyStore().put(key, value, ttlSeconds);
    return true;
  } catch (error) {
    logKvError("spend.kv_error", "write", error);
    return false;
  }
}

/** On Workers without the DAILY_KV binding, the counters would live in one isolate's memory only. */
function bindingMissing(): boolean {
  const env = cloudflareEnv();
  return Boolean(env) && !env!.DAILY_KV;
}

/** Cost writes that failed on every shard, recent ones only (per isolate). */
const WRITE_FAILURE_WINDOW_MS = 60_000;
const WRITE_FAILURES_UNKNOWN = 3;
let costWriteFailures: number[] = [];

function noteCostWrite(ok: boolean, now: number): void {
  costWriteFailures = ok ? [] : [...costWriteFailures.filter((t) => now - t < WRITE_FAILURE_WINDOW_MS), now];
}

/** Test hook. */
export function resetSpendState(): void {
  costWriteFailures = [];
}

// ---- per-network counters ----

const countKey = (client: string, kind: SpendKind, now: number) => `count:${kstDay(now)}:${kind}:${client}`;

/** Generations of `kind` this client network started today (0 when KV cannot be read: the budget check closes then). */
export async function clientCount(client: string, kind: SpendKind, now: number): Promise<number> {
  return (await read(countKey(client, kind, now))) ?? 0;
}

export async function recordClientSpend(client: string, kind: SpendKind, now: number): Promise<void> {
  const key = countKey(client, kind, now);
  const current = await read(key);
  if (current !== null) await write(key, Math.max(0, current) + 1, COUNT_TTL_SECONDS);
}

const networkCostKey = (client: string, now: number, shard: number) => `netcost:${kstDay(now)}:${client}:${shard}`;

/** KRW this network's free-tier generations cost today; a shard that cannot be read counts 0 (the budget check closes when KV is down). */
export async function networkCostKrw(client: string, now: number): Promise<number> {
  const shards = await Promise.all(Array.from({ length: NETWORK_COST_SHARDS }, (_, i) => read(networkCostKey(client, now, i))));
  return Math.max(0, shards.reduce<number>((total, krw) => total + (krw ?? 0), 0));
}

/** Adds `krw` (negative to release) to the network's day total: one shard, one write, no retry. */
export async function addNetworkCost(client: string, krw: number, now: number): Promise<void> {
  if (!Number.isFinite(krw) || krw === 0) return;
  const key = networkCostKey(client, now, Math.floor(Math.random() * NETWORK_COST_SHARDS));
  const current = await read(key);
  if (current !== null) await write(key, current + krw, COST_TTL_SECONDS);
}

/** `BETA_NETWORK_BUDGET_SHARE` (0 to 1), else NETWORK_BUDGET_SHARE. */
export function networkBudgetShare(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.BETA_NETWORK_BUDGET_SHARE;
  const n = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 1 ? n : NETWORK_BUDGET_SHARE;
}

/** True once this network's free-tier cost today reached its share of the day's budget. */
export async function overNetworkBudget(client: string, now: number): Promise<boolean> {
  return (await networkCostKrw(client, now)) >= dailyBudgetKrw() * networkBudgetShare();
}

// ---- the day's cost ----

/**
 * `BETA_DAILY_BUDGET_KRW`, else 30,000. 0 stops every new generation. `off` (owner 2026-10-15: no day cap) is
 * Infinity: no day total closes the free tier and no network share of it applies; the per-network counts, the
 * rate limiters and the prepaid model credit still bound the spend, and the cost is still recorded.
 */
export function dailyBudgetKrw(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.BETA_DAILY_BUDGET_KRW;
  if (value?.trim().toLowerCase() === "off") return Infinity;
  const n = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_BUDGET_KRW;
}

/**
 * Estimated KRW billed on this KST day, all clients and owners together; null when no shard could be
 * read. When only some shards can be read, their sum is scaled up to all shards (an estimate that
 * errs high rather than ignoring the missing ones).
 */
export async function spentTodayKrw(now: number): Promise<number | null> {
  const day = kstDay(now);
  const shards = await Promise.all(Array.from({ length: COST_SHARDS }, (_, i) => read(`cost:${day}:${i}`)));
  const readable = shards.filter((krw): krw is number => krw !== null);
  if (readable.length === 0) return null;
  // Releases can leave one shard negative; only the sum means anything.
  const sum = Math.max(0, readable.reduce((total, krw) => total + krw, 0));
  return readable.length === COST_SHARDS ? sum : (sum * COST_SHARDS) / readable.length;
}

/**
 * "over" once today's estimated spend reaches BUDGET_TRIP of the budget; "unknown" when the total
 * cannot be trusted (KV unreadable, the binding missing on Workers, or cost writes failing
 * repeatedly in this isolate); else "ok". Callers treat "unknown" as closed for new generations.
 * With no day cap (`off`) nothing is compared, but KV that cannot be read (or a missing binding) is
 * still "unknown": the per-network day counts would read 0 then and bound nothing (H-2).
 */
export async function budgetState(now: number): Promise<"ok" | "over" | "unknown"> {
  if (bindingMissing()) return "unknown";
  if (dailyBudgetKrw() === Infinity) return (await spentTodayKrw(now)) === null ? "unknown" : "ok";
  const recentFailures = costWriteFailures.filter((t) => now - t < WRITE_FAILURE_WINDOW_MS).length;
  if (recentFailures >= WRITE_FAILURES_UNKNOWN) return "unknown";
  const spent = await spentTodayKrw(now);
  if (spent === null) return "unknown";
  return spent >= dailyBudgetKrw() * BUDGET_TRIP ? "over" : "ok";
}

/** Adds `krw` (negative to release a reservation) to that day's total, moving to another shard when a write fails. */
export async function addCost(krw: number, now: number): Promise<void> {
  if (!Number.isFinite(krw) || krw === 0) return;
  const day = kstDay(now);
  const first = Math.floor(Math.random() * COST_SHARDS);
  for (let i = 0; i < COST_WRITE_TRIES; i++) {
    const key = `cost:${day}:${(first + i * 3) % COST_SHARDS}`;
    const current = await read(key);
    if (current !== null && (await write(key, current + krw, COST_TTL_SECONDS))) {
      noteCostWrite(true, Date.now());
      return;
    }
  }
  noteCostWrite(false, Date.now());
}

/** P4: where a SpendLedger writes: the free-tier day total (addCost) or the paid book (addPaidCost). */
export type CostSink = (krw: number, at: number) => Promise<void>;

/** P4: paid book entries live long enough for a monthly look in the runbook. */
const PAID_COST_TTL_SECONDS = 35 * 24 * 60 * 60;

/**
 * P4: the model cost of readings opened with a purchase, in `paidcost:<kstDay>:<shard>`. budgetState
 * never reads these keys, so paid readings never close the free tier; the purchase price covers
 * them (spec 11). A failed write is logged (write()) and does not count toward "unknown".
 */
export async function addPaidCost(krw: number, now: number): Promise<void> {
  if (!Number.isFinite(krw) || krw === 0) return;
  const key = `paidcost:${kstDay(now)}:${Math.floor(Math.random() * COST_SHARDS)}`;
  const current = await read(key);
  if (current !== null) await write(key, current + krw, PAID_COST_TTL_SECONDS);
}

export const krwOf = (usage: readonly Usage[]) => usdOf(usage) * krwPerUsd();

/**
 * One generation's cost bookkeeping, written to the day total as it happens.
 * - `reserve`: before each upstream call, its worst case.
 * - `release`: the call failed before the model began answering (an HTTP 429/529/400 or credit error
 *   before message_start): nothing was billed, the reservation goes.
 * - `bill`: the call's real usage replaces its reservation.
 * A call cut off after it started (disconnect, budget, network) keeps its reservation: it was billed
 * for an unknown share of it. Everything about one call settles into the KST day it was reserved in.
 */
export class SpendLedger {
  private reserved = 0;
  private reservedAt = 0;
  private billedSinceReserve = true;
  private billedAny = false;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly clock: () => number = Date.now, private readonly sink: CostSink = addCost) {} // P4: sink

  reserve(usage: readonly Usage[]): void {
    this.settleCall();
    this.reserved = krwOf(usage);
    this.reservedAt = this.clock();
    this.billedSinceReserve = false;
    this.add(this.reserved, this.reservedAt);
  }

  release(): void {
    if (this.billedSinceReserve) return;
    this.add(-this.reserved, this.reservedAt);
    this.reserved = 0;
    this.billedSinceReserve = true;
  }

  bill(usage: readonly Usage[]): void {
    const krw = krwOf(usage);
    this.billedAny = true;
    if (this.billedSinceReserve) {
      this.add(krw, this.clock());
      return;
    }
    const covered = Math.min(this.reserved, krw);
    this.reserved -= covered;
    this.billedSinceReserve = true;
    this.add(krw - covered, this.reservedAt);
  }

  /** SEC-02: a call began answering: usage was billed, or a reservation is still held (cut off after message_start). */
  get began(): boolean {
    return this.billedAny || !this.billedSinceReserve;
  }

  /** Ends the bookkeeping; resolves once every write has been tried (it never rejects). */
  finish(): Promise<void> {
    this.settleCall();
    return this.chain;
  }

  /** The current call's unused reservation is released only when its real usage arrived. */
  private settleCall(): void {
    if (this.billedSinceReserve && this.reserved > 0) this.add(-this.reserved, this.reservedAt);
    this.reserved = 0;
  }

  private add(krw: number, at: number): void {
    if (krw === 0) return;
    this.chain = this.chain.then(() => this.sink(krw, at)).catch((error: unknown) => logKvError("spend.kv_error", "ledger", error));
  }
}

// ---- chapters ----

/** Follow-up answers the server has given in this chapter (0 when none are on record), or null when KV cannot be read. */
export function chapterTurns(chapterId: string): Promise<number | null> {
  return read(`turns:${chapterId}`);
}

/** `ttlSeconds`: how long the count must outlive (a token that lives longer than 7 days passes its own). */
export async function recordChapterTurns(chapterId: string, turns: number, ttlSeconds: number = TURNS_TTL_SECONDS): Promise<void> {
  await write(`turns:${chapterId}`, turns, ttlSeconds);
}
