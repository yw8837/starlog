import { SITE } from "./config";

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

/** The config call: no page_view of its own (each is sent by hand with redacted fields, below), Google signals and ad personalization off. */
export const GA_CONFIG = { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false } as const;

/**
 * Paths whose segment after the prefix is an id, a code or a token: a share (/s/<id>), a 별자리 인연 invite (/b/<code>),
 * a reading (/chapter/<id>), a card request (/invite/<token>). GA sees the bare prefix and a fixed title: a share's
 * title names its cards, and the PDF's title (components/share/SavePdfButton.tsx) is set on /chapter.
 */
const ID_PAGES: Readonly<Record<string, string>> = { "/s/": "공유된 풀이", "/b/": "별자리 인연 초대", "/chapter/": "내 기록", "/invite/": "카드 한 장 부탁" };

const idPrefix = (pathname: string): string | undefined => Object.keys(ID_PAGES).find((prefix) => pathname.startsWith(prefix));

/**
 * The address GA may see: the origin, the path (an id page's bare prefix, see ID_PAGES), and only the utm_* parameters,
 * so campaign tags still count; every other parameter and the hash are dropped. /pay keeps its path alone (Toss returns
 * paymentKey, orderId and amount there, and checkout carries returnTo).
 */
export function gaLocation(href: string): string {
  const url = new URL(href);
  const pay = url.pathname === "/pay" || url.pathname.startsWith("/pay/");
  const utm = new URLSearchParams(pay ? [] : [...url.searchParams].filter(([name]) => name.startsWith("utm_"))).toString();
  return `${url.origin}${idPrefix(url.pathname) ?? url.pathname}${utm ? `?${utm}` : ""}`;
}

/** page_referrer: one of our pages (either host, or `here`) redacted as gaLocation, another site as its origin, none omitted. */
export function gaReferrer(referrer: string, here: string): string | undefined {
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return undefined;
  }
  if ([here, new URL(SITE.url).origin, new URL(SITE.guideUrl).origin].includes(url.origin)) return gaLocation(referrer);
  return url.origin === "null" ? undefined : url.origin;
}

/** One page_view: what gtag gets (set for every later event, and sent with the page_view), and what the next page must know. */
export type GaPage = {
  fields: { page_location: string; page_title: string; page_referrer?: string };
  /** document.title on an id page, where GA got a fixed title instead: never sent as the next page's title either. */
  hiddenTitle: string | null;
};

/**
 * The page on screen, for GA. The referrer is the page before it in this tab (`previous`), or the document's on the first.
 * The title is the document's, but an id page's fixed one (ID_PAGES), and the site's name while the document still has
 * the title hidden on the page before (Next may put the new title in after the route has changed).
 */
export function gaPage(href: string, documentTitle: string, documentReferrer: string, previous: GaPage | null): GaPage {
  const prefix = idPrefix(new URL(href).pathname);
  const fixed = prefix ? `${ID_PAGES[prefix]} · ${SITE.nameKo}` : null;
  const title = fixed ?? (documentTitle && documentTitle !== previous?.hiddenTitle ? documentTitle : SITE.nameKo);
  const referrer = previous ? previous.fields.page_location : gaReferrer(documentReferrer, new URL(href).origin);
  return {
    fields: { page_location: gaLocation(href), page_title: title, ...(referrer ? { page_referrer: referrer } : {}) },
    hiddenTitle: fixed ? documentTitle : null,
  };
}
