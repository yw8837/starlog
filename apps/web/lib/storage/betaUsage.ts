import { SITE } from "@/lib/config";
import { kstDate } from "@/lib/kst";
import { createLocalStore } from "@/lib/sessionStore";

/**
 * How many full readings this device opened today (KST), for "오늘 N번 남았어요". The server's
 * quota cookie decides; this mirrors it for display: counted on each opened reading, set to the
 * limit when the server says the day is used up.
 */

export const BETA_USAGE_KEY = "starlog.beta-usage";

interface Usage {
  day: string;
  full: number;
}

function parseUsage(value: unknown): Usage | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  return typeof v.day === "string" && typeof v.full === "number" ? { day: v.day, full: Math.max(0, Math.floor(v.full)) } : null;
}

const store = createLocalStore<Usage>(BETA_USAGE_KEY, parseUsage);

const usedToday = (usage: Usage | null, now: number) => (usage && usage.day === kstDate(now) ? usage.full : 0);

/** Full readings still open today, as far as this device knows. */
export function remainingToday(usage: Usage | null, now: number): number {
  return Math.max(0, SITE.beta.fullPerDay - usedToday(usage, now));
}

export function countFullReading(now: number = Date.now()) {
  store.save({ day: kstDate(now), full: usedToday(store.read(), now) + 1 });
}

export function markDayUsedUp(now: number = Date.now()) {
  store.save({ day: kstDate(now), full: SITE.beta.fullPerDay });
}

export function clearBetaUsage() {
  store.clear();
}

/** Remaining full readings today; undefined before hydration. */
export function useRemainingToday(now: number = Date.now()): number | undefined {
  const usage = store.useValue();
  return usage === undefined ? undefined : remainingToday(usage, now);
}
