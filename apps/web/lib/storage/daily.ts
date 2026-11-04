import { kstDate } from "@/lib/kst";
import type { DailyData } from "@/lib/reading/types";
import { isDailyData } from "@/lib/reading/validate";
import { createLocalStore } from "@/lib/sessionStore";

/**
 * 오늘의 한 장 kept on this device for the KST day it was opened, so a revisit that day shows it
 * even when the server cannot hand it out again (a missed store, the day's limit). Only today's is
 * kept; tomorrow it reads as nothing. It is the account's (owner 2026-11-04): kept with `account`, the
 * server's marker of that account (lib/api/member.ts dailyViewer, never the user id), and TodayView
 * shows it only once the server says the same marker is logged in (code review 2026-11-04).
 */

export const DAILY_KEY = "starlog.daily";

export interface SavedDaily {
  day: string;
  reading: DailyData;
  /** the server's marker of the account it was opened with; absent on one kept before 2026-11-04 (shown to nobody) */
  account?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A kept fortune with every part the screen shows (a known card, all three areas); otherwise none. */
function parseSaved(value: unknown): SavedDaily | null {
  if (!isRecord(value) || typeof value.day !== "string" || !isDailyData(value.reading)) return null;
  return { day: value.day, reading: value.reading, ...(typeof value.account === "string" ? { account: value.account } : {}) };
}

const store = createLocalStore<SavedDaily>(DAILY_KEY, parseSaved);

/** Today's opened cookie, if it was opened on this device today (KST). */
export function readDaily(now: number = Date.now()): DailyData | null {
  const saved = store.read();
  return saved && saved.day === kstDate(now) ? saved.reading : null;
}

export function saveDaily(reading: DailyData, now: number = Date.now(), account?: string) {
  store.save({ day: kstDate(now), reading, ...(account ? { account } : {}) });
}

export function clearDaily() {
  store.clear();
}

/** Today's kept card with its account marker: undefined before hydration, null when none was opened today. */
export function useDailySaved(now: number = Date.now()): SavedDaily | null | undefined {
  const saved = store.useValue();
  if (saved === undefined) return undefined;
  return saved && saved.day === kstDate(now) ? saved : null;
}
