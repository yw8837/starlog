import { createSessionStore, type SessionStore } from "@/lib/sessionStore";

/**
 * The free teaser last written in this tab, keyed by exactly what it was written for (draw token
 * and inputs, or birth data and chips). A reload or a step back shows it again instead of spending
 * another teaser; any change in the inputs writes a new one.
 */

type Slot = "tarot" | "saju";

interface Entry {
  key: string;
  value: unknown;
}

const parseEntry = (value: unknown): Entry | null =>
  typeof value === "object" && value !== null && typeof (value as Entry).key === "string" && "value" in value ? (value as Entry) : null;

const stores: Record<Slot, SessionStore<Entry>> = {
  tarot: createSessionStore("starlog.teaser.tarot", parseEntry),
  saju: createSessionStore("starlog.teaser.saju", parseEntry),
};

/** The teaser kept for `key`, or null; a kept value that no longer has the teaser's shape counts as none. */
export function readTeaser<T>(slot: Slot, key: string, accept: (value: unknown) => value is T): T | null {
  const entry = stores[slot].read();
  return entry && entry.key === key && accept(entry.value) ? entry.value : null;
}

export function saveTeaser(slot: Slot, key: string, value: unknown) {
  stores[slot].save({ key, value });
}

/** Forgets both teasers of this tab (내 정보 → 기록 모두 지우기). */
export function clearTeasers() {
  stores.tarot.clear();
  stores.saju.clear();
}
