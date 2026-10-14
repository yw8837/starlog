import { SITE, openingFreeOn } from "@/lib/config";
import { createLocalStore } from "@/lib/sessionStore";

/**
 * How many free tarot full readings (오픈 기념 무료) this device opened, for the unlock sheet and 내 정보.
 * The server's `sl_first` cookie decides; this mirrors it for display: counted on each opened free
 * reading, set to the limit when the server says it is used. It never resets. A new key, so the old
 * daily count (`starlog.beta-usage`) never reads as the free first reading used.
 */

export const BETA_USAGE_KEY = "starlog.first-free";

interface Usage {
  full: number;
}

function parseUsage(value: unknown): Usage | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  return typeof v.full === "number" ? { full: Math.max(0, Math.floor(v.full)) } : null;
}

const store = createLocalStore<Usage>(BETA_USAGE_KEY, parseUsage);

/** Free first readings still open on this device, as far as it knows: none once 오픈 기념 무료 ended. */
export function remainingFree(usage: Usage | null): number {
  if (!openingFreeOn()) return 0;
  return Math.max(0, SITE.beta.firstFreeTarot - (usage?.full ?? 0));
}

export function countFullReading() {
  store.save({ full: (store.read()?.full ?? 0) + 1 });
}

export function markFreeUsedUp() {
  store.save({ full: SITE.beta.firstFreeTarot });
}

export function clearBetaUsage() {
  store.clear();
}

/** Free first readings left on this device; undefined before hydration. */
export function useRemainingFree(): number | undefined {
  const usage = store.useValue();
  return usage === undefined ? undefined : remainingFree(usage);
}
