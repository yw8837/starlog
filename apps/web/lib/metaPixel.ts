import { metaRevisionInForce } from "./legal";

/**
 * The Meta pixel (sales 2026-11-10 item 7): the id comes from the build (NEXT_PUBLIC_META_PIXEL_ID, public by design);
 * none, nothing loads. It runs only for a visitor who allowed it (lib/analyticsConsent.ts readMetaGranted), from the
 * privacy revision naming Meta (lib/legal.ts META_REVISION_DATE). Browser and server both read it; nothing here touches window.
 */
export const META_PIXEL_ID: string = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "").trim();

/** fbevents.js; its origin is in next.config.ts's script policy. */
export const META_SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";

export const metaPixelOn = (id: string = META_PIXEL_ID, now: number = Date.now()): boolean => /^\d{5,20}$/.test(id) && metaRevisionInForce(now);

/** Pages whose address carries an id, a code or a token (as lib/analytics.ts ID_PAGES), and the payment pages. */
const PRIVATE_PREFIXES = ["/s/", "/b/", "/chapter/", "/invite/", "/pay"];

function comparable(pathname: string): string {
  try {
    return decodeURIComponent(pathname).toLowerCase();
  } catch {
    return pathname.toLowerCase();
  }
}

/**
 * The pixel sends the page's whole address and cannot be given a redacted one (as GA is), so a page view is sent only
 * where the address holds nothing personal: not an id page, not /pay, and no query but utm_* tags and Meta's own click
 * id (fbclid, which an ad click adds: without it the ad's visits would not be counted).
 */
export function metaPageAllowed(href: string): boolean {
  const url = new URL(href);
  const path = comparable(url.pathname);
  if (PRIVATE_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  return [...url.searchParams.keys()].every((name) => name.startsWith("utm_") || name === "fbclid");
}
