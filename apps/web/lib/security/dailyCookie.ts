import "server-only";
import { signToken, verifyToken, type SignedPayload } from "./sign";

/**
 * 오늘의 한 장 device cookie (`sl_daily`): device id, KST day, generations used, and the slot the
 * device picked (locked from its first pick, so a failed generation cannot become a re-pick). It
 * never carries a card: the deal is recomputed from the device id with the secret.
 */

export const DAILY_COOKIE = "sl_daily";

interface DailyPayload extends SignedPayload {
  k: "daily";
  /** random per-device id; with the day and the secret it fixes the deal */
  did: string;
  day: string;
  /** generations used today */
  gen: number;
  /** the face-down slot picked today (0-2), once picked */
  pick?: number;
}

export type DailyState = Omit<DailyPayload, "k" | "exp">;

/** The device's daily-card cookie, or null when missing, forged or not verifiable. */
export async function readDaily(cookie: string | undefined, secret: string, now: number): Promise<DailyState | null> {
  const p = await verifyToken<DailyPayload>(cookie, "daily", secret, now);
  if (!p || typeof p.did !== "string" || typeof p.day !== "string") return null;
  const gen = Number.isInteger(p.gen) && p.gen >= 0 ? p.gen : 0;
  const pick = Number.isInteger(p.pick) && p.pick! >= 0 && p.pick! <= 2 ? p.pick : undefined;
  return { did: p.did, day: p.day, gen, ...(pick !== undefined ? { pick } : {}) };
}

export async function dailyCookie(state: DailyState, secret: string): Promise<string> {
  return signToken({ k: "daily", ...state }, secret);
}
