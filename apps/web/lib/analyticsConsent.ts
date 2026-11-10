import { GA_MEASUREMENT_ID, gaDisableKey } from "./analytics";
import { SITE } from "./config";
import { META_PIXEL_ID, metaPixelOn } from "./metaPixel";

/**
 * The visitor's answer to "방문 통계를 켜도 될까요?" (components/seo/ConsentBanner.tsx), per browser and per host:
 * localStorage, so the app host and the guides ask separately. Google Analytics runs only on "granted"
 * (components/seo/GoogleAnalytics.tsx), and the Meta pixel only on a "granted" that named it (components/seo/MetaPixel.tsx). Browser-only: every function here touches window.
 */
export const CONSENT_KEY = "starlog.analytics.consent";

export type AnalyticsChoice = "granted" | "denied";

/** The last choice made on this page load: what is read when the browser refuses storage, so the banner does not ask again on every page. */
let remembered: AnalyticsChoice | null = null;
/** Whether that choice was made where the banner named Meta (sales 2026-11-10 item 7). */
let rememberedMeta = false;
/** The browser refused to store `remembered`: it wins over whatever older choice storage still holds. */
let unsaved = false;
const listeners = new Set<() => void>();

function readRecord(): { choice: AnalyticsChoice | null; meta: boolean } {
  if (unsaved) return { choice: remembered, meta: rememberedMeta };
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    const record = raw ? (JSON.parse(raw) as { choice?: unknown; meta?: unknown } | null) : null;
    const choice = record?.choice;
    if (choice === "granted" || choice === "denied") return { choice, meta: record?.meta === true };
  } catch {
    // Storage blocked, or a value that is not JSON: this page load's memory.
  }
  return { choice: remembered, meta: rememberedMeta };
}

export function readChoice(): AnalyticsChoice | null {
  return readRecord().choice;
}

/**
 * The Meta pixel may run: 허용 given where the banner named Meta (stored as `meta: true`). An 허용 from before (GA only)
 * keeps GA running and does not cover Meta: needsChoice asks again.
 */
export function readMetaGranted(): boolean {
  const record = readRecord();
  return record.choice === "granted" && record.meta;
}

/** The banner asks: no choice yet, or an older 허용 that did not cover the Meta pixel now built in. */
export function needsChoice(): boolean {
  const record = readRecord();
  return record.choice === null || (record.choice === "granted" && !record.meta && metaPixelOn());
}

/**
 * GA stops on this page and its cookies go: the ga-disable flag drops every hit gtag.js would still send, and `_ga`
 * and `_ga_<id>` are deleted for this host and for the domain both hosts share (gtag.js sets them on the widest one it
 * can, `.yeolmaeapps.kr`).
 */
function stopAnalytics(id: string): void {
  (window as unknown as Record<string, unknown>)[gaDisableKey(id)] = true;
  const shared = `; domain=.${new URL(SITE.guideUrl).hostname}`;
  for (const name of ["_ga", `_ga_${id.replace(/^G-/, "")}`]) {
    for (const domain of ["", shared]) document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
  }
}

/** The Meta pixel stops on this page (fbq's consent revoke drops what it would still send) and its _fbp cookie goes. */
function stopMeta(): void {
  (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq?.("consent", "revoke");
  const shared = `; domain=.${new URL(SITE.guideUrl).hostname}`;
  for (const domain of ["", shared]) document.cookie = `_fbp=; Max-Age=0; path=/${domain}`;
}

/** `meta`: the banner named Meta when this was chosen (a pixel id is built in and its revision is in force). */
export function chooseAnalytics(choice: AnalyticsChoice, meta: boolean = metaPixelOn()): void {
  const covers = choice === "granted" && meta;
  remembered = choice;
  rememberedMeta = covers;
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, at: new Date().toISOString(), ...(covers ? { meta: true } : {}) }));
    unsaved = false;
  } catch {
    // Kept in memory for this page load (above); an older stored choice must not come back on the next one.
    unsaved = true;
    try {
      window.localStorage.removeItem(CONSENT_KEY);
    } catch {
      // Storage refused altogether: nothing stored to come back.
    }
  }
  if (choice === "denied") {
    stopAnalytics(GA_MEASUREMENT_ID);
    if (META_PIXEL_ID) stopMeta();
  }
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore: a choice made here, or in another tab of this host (the storage event). */
export function subscribeChoice(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CONSENT_KEY || event.key === null) listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
