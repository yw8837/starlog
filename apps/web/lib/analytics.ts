/**
 * Google Analytics 4: the 스타로그 property (web stream https://starlog.yeolmaeapps.kr, every data-sharing option off),
 * one ID for both hosts. "" turns the loader off (components/seo/GoogleAnalytics.tsx). It collects only from the privacy
 * revision that discloses it (lib/legal.ts PRIVACY_REVISION_DATE), by the browser's clock.
 */
export const GA_MEASUREMENT_ID = "G-8X11ZGFZKY";

/** gtag.js; its origin is in next.config.ts's script policy. */
export const gaScriptSrc = (id: string): string => `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;

/** The window property that, set to true, makes gtag.js send nothing for this measurement ID. */
export const gaDisableKey = (id: string): string => `ga-disable-${id}`;

/**
 * The address GA may see, when it must differ from the page's: no query or hash on /pay (Toss returns paymentKey,
 * orderId and amount there), and no share id on /s/<id> (the link opens someone's reading). No app URL carries a
 * question or a birth date in its query (they live in the browser's storage); every other address goes as it is, so
 * utm tags still count. Both pages are opened by a full load, where the config's page_location applies.
 */
function redactedPageLocation(href: string): string | null {
  const url = new URL(href);
  if (url.pathname.startsWith("/s/")) return `${url.origin}/s/`;
  if (url.pathname === "/pay" || url.pathname.startsWith("/pay/")) return `${url.origin}${url.pathname}`;
  return null;
}

/** The config call's parameters: Google signals and ad personalization off, and page_location where it must be redacted. */
export function gaConfig(href: string): Record<string, string | boolean> {
  const pageLocation = redactedPageLocation(href);
  return { allow_google_signals: false, allow_ad_personalization_signals: false, ...(pageLocation ? { page_location: pageLocation } : {}) };
}
