import { GA_MEASUREMENT_ID, gaDisableKey } from "./analytics";
import { SITE } from "./config";

/**
 * The visitor's answer to "방문 통계를 켜도 될까요?" (components/seo/ConsentBanner.tsx), per browser and per host:
 * localStorage, so the app host and the guides ask separately. Google Analytics runs only on "granted"
 * (components/seo/GoogleAnalytics.tsx). Browser-only: every function here touches window.
 */
export const CONSENT_KEY = "starlog.analytics.consent";

export type AnalyticsChoice = "granted" | "denied";

/** The last choice made on this page load: what is read when the browser refuses storage, so the banner does not ask again on every page. */
let remembered: AnalyticsChoice | null = null;
const listeners = new Set<() => void>();

export function readChoice(): AnalyticsChoice | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    const choice: unknown = raw ? (JSON.parse(raw) as { choice?: unknown } | null)?.choice : undefined;
    if (choice === "granted" || choice === "denied") return choice;
  } catch {
    // Storage blocked, or a value that is not JSON: this page load's memory.
  }
  return remembered;
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

export function chooseAnalytics(choice: AnalyticsChoice): void {
  remembered = choice;
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice, at: new Date().toISOString() }));
  } catch {
    // Kept in memory for this page load (above).
  }
  if (choice === "denied") stopAnalytics(GA_MEASUREMENT_ID);
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
