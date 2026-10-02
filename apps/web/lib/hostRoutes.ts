// next.config.ts loads this file through its own loader, which has no "@/" alias: relative imports only.
import { SITE } from "./config";
import { splitHosts } from "./hosts";

/**
 * The host rules (owner decision 2026-10-03: the guides live on the root domain, where AdSense is
 * approved; the app stays on starlog.yeolmaeapps.kr). Both hosts are served by one Worker, so the
 * rules carry a `host` condition.
 *
 * - https://yeolmaeapps.kr/ shows the guide index (the tarot tab) at the same address: a rewrite.
 * - Every /guide URL on the app host moves to the same path on the root domain for good (308), so
 *   each guide URL has one home and search engines carry its signals over; /guide itself goes
 *   straight to the tarot tab.
 * - Any other path on the root domain is an app page: 307 to the same path on the app host.
 *   Temporary on purpose, because the root domain may later get pages of its own for other apps.
 * - The root domain's responses send HSTS without includeSubDomains.
 *
 * They exist only in the deploy build: NEXT_PUBLIC_SPLIT_HOSTS=1, the switch the links use, read when
 * next.config builds the routes manifest. `wrangler dev`, and so the OpenNext preview and e2e, hands
 * the Worker every request with the first route's host (starlog.yeolmaeapps.kr) whatever the client
 * sent, so with the rules in, the preview's /guide pages would 308 to the real root domain.
 *
 * The Worker runs these through OpenNext's own copy of Next's routing (core/routing/matcher.js), which
 * differs from Next's server in the ways noted below; lib/hostRoutes.test.ts runs every rule through both.
 */

type HostHas = { type: "host"; value: string };
type HostRedirect = { source: string; has: HostHas[]; destination: string; permanent: boolean };
type HostRewrite = { source: string; has: HostHas[]; destination: string };
type HostHeaders = { source: string; has: HostHas[]; headers: Array<{ key: string; value: string }> };

/** The tarot tab, guideIndexPath("tarot") (lib/guide.ts is not loadable here; the test pins the two together). */
const GUIDE_HOME = "/guide/tarot";

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `has` for one host, matched exactly, with or without an explicit port. Next anchors a host value
 * itself and drops the port, but the Worker tests it against the Host header as it came: unanchored,
 * port included. A bare "yeolmaeapps.kr" would then also match "starlog.yeolmaeapps.kr", and the root
 * domain's rules would fire on the app host. Anchored by hand, with an optional port, the value means
 * the same in both.
 */
const onHost = (origin: string): HostHas[] => [{ type: "host", value: `^${escapeRegExp(new URL(origin).hostname)}(?::\\d+)?$` }];

/**
 * A word in any letter case, one character class per letter. The Worker tests the manifest's regex
 * case-sensitively but takes the params from path-to-regexp, which ignores case; a lookahead that only
 * one of them honours leaves the params unfilled and the Location reading ":first/:rest*".
 */
const anyCase = (word: string) => [...word].map((char) => (/[a-z]/i.test(char) ? `[${char.toLowerCase()}${char.toUpperCase()}]` : escapeRegExp(char))).join("");

/**
 * First path segments the root domain serves itself, besides the guide: Next's build output, the guide
 * pages' own fetches (/api/version), the share images, the generated share image, and the card scans in
 * public/cards. A segment with a dot is a file (robots.txt, sitemap.xml, ads.txt, llms.txt,
 * llms-full.txt, rss.xml, the favicon and icons, logo.png, the IndexNow key, .well-known/…) and stays too.
 */
const OWN_SEGMENTS = ["guide", "_next", "api", "og", "opengraph-image", "cards"];

const SEGMENT = "[^/.]+";

/**
 * Any app path, as a first segment and the rest. Two params, not one `:path(…)` with a custom pattern:
 * the Worker compiles a destination with the default segment check, which refuses a "/" inside one
 * param (and answers 500), while a repeated `:rest*` takes the segments one by one. `:first` is always
 * there, so the Worker (which leaves a destination alone when no param matched) always fills it.
 */
const APP_PATH = `/:first((?!(?:${OWN_SEGMENTS.map(anyCase).join("|")})(?:/|$))${SEGMENT})/:rest(${SEGMENT})*`;

export function hostRedirects(): HostRedirect[] {
  if (!splitHosts()) return [];
  const onApp = onHost(SITE.url);
  return [
    // "/guide" and "/guide/…" are two rules: with `/guide/:path*` the Worker would leave a literal
    // ":path*" in the Location header for "/guide" itself, where nothing matched. /guide goes
    // straight to the tarot tab, one hop instead of two.
    { source: "/guide", has: onApp, destination: `${SITE.guideUrl}${GUIDE_HOME}`, permanent: true },
    { source: "/guide/:path+", has: onApp, destination: `${SITE.guideUrl}/guide/:path+`, permanent: true },
    { source: APP_PATH, has: onHost(SITE.guideUrl), destination: `${SITE.url}/:first/:rest*`, permanent: false },
  ];
}

/** Before the files: the app's own page for "/" exists, and the root domain must not reach it. */
export function hostRewrites(): HostRewrite[] {
  if (!splitHosts()) return [];
  return [{ source: "/", has: onHost(SITE.guideUrl), destination: GUIDE_HOME }];
}

/**
 * The root domain's HSTS: the app's two years (`hstsMaxAge`), without includeSubDomains. Sent from the
 * registrable domain, includeSubDomains would hold every *.yeolmaeapps.kr site to https in each browser
 * that opened a guide page. Next and the Worker both let the last matching entry win a header, so
 * next.config.ts puts this one after the global security headers. The app host keeps its header.
 */
export function hostHeaders(hstsMaxAge: string): HostHeaders[] {
  if (!splitHosts()) return [];
  return [{ source: "/:path*", has: onHost(SITE.guideUrl), headers: [{ key: "Strict-Transport-Security", value: hstsMaxAge }] }];
}
