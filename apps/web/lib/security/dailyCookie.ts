import "server-only";
import { signToken, verifyToken, type SignedPayload } from "./sign";

/** 오늘의 한 장 device cookie (`sl_daily`): device id, KST day, the day's card, generations used. */

export const DAILY_COOKIE = "sl_daily";

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
