import { createLocalStore, createSessionStore, type SessionStore } from "@/lib/sessionStore";

/**
 * Free teasers kept so a reload or a step back shows them again instead of spending another one.
 * - tarot: the one written last in this tab (sessionStorage), keyed by the draw token and inputs;
 * - saju (saju-topics spec §9.3): up to 15 on this device (localStorage), one per birth data, topic and
 *   that topic's chips (lib/sajuFlow.ts sajuTeaserKey), each until the server's `freshUntil` (30 days,
 *   the next 입춘 or the end of the 대운) and never past 30 days. A topic seen here switches back for free.
 *   One past its time is ignored on read, dropped at the next save and whenever the app opens (RouteTracker).
 */

type Slot = "tarot" | "saju";

interface Entry {
  key: string;
  value: unknown;
}

const parseEntry = (value: unknown): Entry | null =>
  typeof value === "object" && value !== null && typeof (value as Entry).key === "string" && "value" in value ? (value as Entry) : null;

const tarotStore: SessionStore<Entry> = createSessionStore("starlog.teaser.tarot", parseEntry);

/** v2 (2026-10-08): the locked lists kept under v1 lack the 한눈에 보기 card and the plain headings, so v1 is not read again. */
export const SAJU_TEASERS_KEY = "starlog.teaser.saju.v2";
/** The tab-only saju slot of earlier versions, erased with the rest. */
const LEGACY_SAJU_KEY = "starlog.teaser.saju";
/** The device-wide list before v2; its keys hold birth data, so it goes the next time the app opens. */
const LEGACY_SAJU_LIST_KEY = "starlog.teaser.saju.v1";

function dropLegacySajuList() {
  try {
    if (window.localStorage.getItem(LEGACY_SAJU_LIST_KEY) !== null) window.localStorage.removeItem(LEGACY_SAJU_LIST_KEY);
  } catch {
    // Blocked storage: nothing was kept there.
  }
}
export const SAJU_TEASER_SLOTS = 15;
const MAX_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

interface SajuEntry extends Entry {
  savedAt: number;
  freshUntil: number;
}

const isSajuEntry = (value: unknown): value is SajuEntry =>
  parseEntry(value) !== null && typeof (value as SajuEntry).savedAt === "number" && typeof (value as SajuEntry).freshUntil === "number";

const sajuStore = createLocalStore<SajuEntry[]>(SAJU_TEASERS_KEY, (value) => (Array.isArray(value) ? value.filter(isSajuEntry) : null));

/** The teaser kept for `key`, or null; one past its time, or no longer of the teaser's shape, counts as none. */
export function readTeaser<T>(slot: Slot, key: string, accept: (value: unknown) => value is T, now = Date.now()): T | null {
  if (slot === "tarot") {
    const entry = tarotStore.read();
    return entry && entry.key === key && accept(entry.value) ? entry.value : null;
  }
  const entry = (sajuStore.read() ?? []).find((e) => e.key === key && e.freshUntil > now);
  return entry && accept(entry.value) ? entry.value : null;
}

/** Keeps `value` for `key`; a saju teaser until its `freshUntil` (30 days at most), the newest 15 at most. */
export function saveTeaser(slot: Slot, key: string, value: unknown, now = Date.now()) {
  if (slot === "tarot") {
    tarotStore.save({ key, value });
    return;
  }
  const stated = typeof value === "object" && value !== null ? Date.parse(String((value as { freshUntil?: unknown }).freshUntil ?? "")) : Number.NaN;
  const freshUntil = Math.min(Number.isFinite(stated) ? stated : Number.POSITIVE_INFINITY, now + MAX_KEEP_MS);
  const kept = (sajuStore.read() ?? []).filter((e) => e.key !== key && e.freshUntil > now);
  sajuStore.save([...kept, { key, value, savedAt: now, freshUntil }].slice(-SAJU_TEASER_SLOTS));
}

/**
 * Drops the saju teasers past their time. Their keys hold the birth data, and the privacy policy says
 * those past 30 days are gone the next time the app is opened, so components/layout/RouteTracker.tsx
 * calls this on every page load rather than waiting for the next save. Writes only when something goes.
 */
export function pruneSajuTeasers(now = Date.now()) {
  dropLegacySajuList();
  const all = sajuStore.read() ?? [];
  const live = all.filter((e) => e.freshUntil > now);
  if (live.length === all.length) return;
  if (live.length === 0) sajuStore.clear();
  else sajuStore.save(live);
}

/** Forgets the saju teasers on this device (사주 정보 지우기, 기록 모두 지우기). */
export function clearSajuTeasers() {
  sajuStore.clear();
  dropLegacySajuList();
  try {
    window.sessionStorage.removeItem(LEGACY_SAJU_KEY);
  } catch {
    // Blocked storage: nothing was kept there.
  }
}

/** Forgets every kept teaser (내 정보 → 기록 모두 지우기). */
export function clearTeasers() {
  tarotStore.clear();
  clearSajuTeasers();
}
