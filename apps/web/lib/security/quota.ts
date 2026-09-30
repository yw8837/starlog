import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { signToken, verifyToken, type SignedPayload } from "./sign";

/**
 * Beta quotas (signed cookies, KST day), the owner pass, and the per-IP rate limiter.
 * Cookies are best effort by nature (a device can drop them); the IP limiter is the backstop.
 */

// ---- config ----

export interface QuotaLimits {
  full: number;
  teaser: number;
  /** follow-up answers per device per day, across chapters */
  followup: number;
  /** 오늘의 한 장 generations per device per day */
  daily: number;
  followupsPerChapter: number;
}

const DEFAULT_LIMITS: QuotaLimits = { full: 3, teaser: 20, followup: 15, daily: 2, followupsPerChapter: 3 };

function envInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function quotaLimits(env: NodeJS.ProcessEnv = process.env): QuotaLimits {
  return {
    full: envInt(env.BETA_FULL_PER_DAY, DEFAULT_LIMITS.full),
    teaser: envInt(env.BETA_TEASER_PER_DAY, DEFAULT_LIMITS.teaser),
    followup: envInt(env.BETA_FOLLOWUPS_PER_DAY, DEFAULT_LIMITS.followup),
    daily: envInt(env.BETA_DAILY_PER_DAY, DEFAULT_LIMITS.daily),
    followupsPerChapter: envInt(env.BETA_FOLLOWUPS_PER_CHAPTER, DEFAULT_LIMITS.followupsPerChapter),
  };
}

// ---- KST day ----

const KST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" of the Korean calendar day at `now`. */
export function kstDay(now: number): string {
  return new Date(now + KST_MS).toISOString().slice(0, 10);
}

/** The next KST midnight as an ISO instant (when day quotas reset). */
export function nextKstMidnight(now: number): string {
  const startOfDay = Math.floor((now + KST_MS) / DAY_MS) * DAY_MS - KST_MS;
  return new Date(startOfDay + DAY_MS).toISOString();
}

// ---- cookies ----

export const QUOTA_COOKIE = "sl_q";
export const DAILY_COOKIE = "sl_daily";
export const OWNER_COOKIE = "sl_owner";

export const QUOTA_COOKIE_MAX_AGE = 2 * 24 * 60 * 60;
export const OWNER_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export type QuotaKind = "full" | "teaser" | "followup";

interface QuotaPayload extends SignedPayload {
  k: "quota";
  day: string;
  full: number;
  teaser: number;
  followup: number;
}

export type QuotaState = Omit<QuotaPayload, "k" | "exp">;

/** Today's counters from the cookie; a missing, forged or yesterday's cookie starts from zero. */
export async function readQuota(cookie: string | undefined, secret: string, now: number): Promise<QuotaState> {
  const day = kstDay(now);
  const payload = await verifyToken<QuotaPayload>(cookie, "quota", secret, now);
  if (!payload || payload.day !== day) return { day, full: 0, teaser: 0, followup: 0 };
  const count = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : 0);
  return { day, full: count(payload.full), teaser: count(payload.teaser), followup: count(payload.followup) };
}

export function hasQuota(state: QuotaState, kind: QuotaKind, limits: QuotaLimits): boolean {
  return state[kind] < limits[kind];
}

/** The cookie value after spending one `kind`. Call only after a validated generation. */
export async function spendQuota(state: QuotaState, kind: QuotaKind, secret: string): Promise<string> {
  const next: QuotaPayload = { k: "quota", ...state, [kind]: state[kind] + 1 };
  return signToken(next, secret);
}

// ---- 오늘의 한 장 ----

interface DailyPayload extends SignedPayload {
  k: "daily";
  /** random per-device id; with the day it fixes the card */
  did: string;
  day: string;
  cardId: string;
  orientation: "upright" | "reversed";
  /** generations used today */
  gen: number;
}

export type DailyState = Omit<DailyPayload, "k" | "exp">;

/** The device's daily-card cookie, or null when missing, forged or not verifiable. */
export async function readDaily(cookie: string | undefined, secret: string, now: number): Promise<DailyState | null> {
  const p = await verifyToken<DailyPayload>(cookie, "daily", secret, now);
  if (!p || typeof p.did !== "string" || typeof p.day !== "string" || typeof p.cardId !== "string") return null;
  if (p.orientation !== "upright" && p.orientation !== "reversed") return null;
  const gen = Number.isInteger(p.gen) && p.gen >= 0 ? p.gen : 0;
  return { did: p.did, day: p.day, cardId: p.cardId, orientation: p.orientation, gen };
}

export async function dailyCookie(state: DailyState, secret: string): Promise<string> {
  return signToken({ k: "daily", ...state }, secret);
}

// ---- owner pass ----

interface OwnerPayload extends SignedPayload {
  k: "owner";
  exp: number;
}

export async function ownerCookie(secret: string, now: number): Promise<string> {
  const payload: OwnerPayload = { k: "owner", exp: now + OWNER_COOKIE_MAX_AGE * 1000 };
  return signToken(payload, secret);
}

export async function isOwner(cookie: string | undefined, secret: string, now: number): Promise<boolean> {
  return (await verifyToken<OwnerPayload>(cookie, "owner", secret, now)) !== null;
}

// ---- per-IP rate limit ----

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
