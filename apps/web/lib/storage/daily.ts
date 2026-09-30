import { kstDate } from "@/lib/kst";
import type { DailyData } from "@/lib/reading/types";
import { createLocalStore } from "@/lib/sessionStore";

/**
 * 오늘의 한 장 kept on this device for the KST day it was opened, so a revisit that day opens
 * straight to it, even when the server cannot hand it out again (a missed store, the day's limit).
 * Only today's cookie is kept; tomorrow it reads as nothing.
 */

export const DAILY_KEY = "starlog.daily";

interface SavedDaily {
  day: string;
  reading: DailyData;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function parseSaved(value: unknown): SavedDaily | null {
  if (!isRecord(value) || typeof value.day !== "string" || !isRecord(value.reading)) return null;
  const r = value.reading;
  const card = r.card;
  if (!isRecord(card) || typeof card.cardId !== "string" || (card.orientation !== "upright" && card.orientation !== "reversed")) return null;
  if (typeof r.summary !== "string" || typeof r.body !== "string" || typeof r.tip !== "string") return null;
  if (!isRecord(r.areas) || !isRecord(r.lucky)) return null;
  return { day: value.day, reading: r as unknown as DailyData };
}

const store = createLocalStore<SavedDaily>(DAILY_KEY, parseSaved);

/** Today's opened cookie, if it was opened on this device today (KST). */
export function readDaily(now: number = Date.now()): DailyData | null {
  const saved = store.read();
  return saved && saved.day === kstDate(now) ? saved.reading : null;
}

export function saveDaily(reading: DailyData, now: number = Date.now()) {
  store.save({ day: kstDate(now), reading });
}

export function clearDaily() {
  store.clear();
}

/** Today's cookie: undefined before hydration, null when not opened today. */
export function useDaily(now: number = Date.now()): DailyData | null | undefined {
  const saved = store.useValue();
  if (saved === undefined) return undefined;
  return saved && saved.day === kstDate(now) ? saved.reading : null;
}
