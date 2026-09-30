import "server-only";
import { signToken, verifyToken, type SignedPayload } from "./sign";

/**
 * Beta quotas: limits, the KST day, and the signed `sl_q` counter cookie. Cookies are best effort
 * by nature (a device can drop them); the per-IP limiter (rateLimit.ts) is the backstop.
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
export const QUOTA_COOKIE_MAX_AGE = 2 * 24 * 60 * 60;

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
