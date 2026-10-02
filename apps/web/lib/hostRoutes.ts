// next.config.ts loads this file through its own loader, which has no "@/" alias: relative imports only.
import { SITE } from "./config";

/**
 * The host rules (owner decision 2026-10-03: the guides live on the root domain, where AdSense is
 * approved; the app stays on starlog.yeolmaeapps.kr). Both hosts are served by one Worker, so the
 * rules carry a `host` condition, and none of them fires on localhost, the OpenNext preview or in
 * the e2e suite.
 *
 * - https://yeolmaeapps.kr/ shows the guide index (the tarot tab) at the same address: a rewrite.
 * - Every /guide URL on the app host moves to the same path on the root domain for good (308), so
 *   each guide URL has one home and search engines carry its signals over.
 * - Any other path on the root domain is an app page: 307 to the same path on the app host.
 *   Temporary on purpose, because the root domain may later get pages of its own for other apps.
 *
 * The Worker runs these through OpenNext's own copy of Next's routing (core/routing/matcher.js), which
 * differs from Next's server in the ways noted below; lib/hostRoutes.test.ts runs every rule through both.
 */

type HostHas = { type: "host"; value: string };
type HostRedirect = { source: string; has: HostHas[]; destination: string; permanent: boolean };
type HostRewrite = { source: string; has: HostHas[]; destination: string };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `has` for one host, matched exactly. Next anchors a host value itself and drops the port, but the
 * Worker tests it as it is: unanchored, port included. A bare "yeolmaeapps.kr" would then also match
 * "starlog.yeolmaeapps.kr", and the root domain's rules would fire on the app host. Anchored by hand,
 * the value means the same in both.
 */
const onHost = (origin: string): HostHas[] => [{ type: "host", value: `^${escapeRegExp(new URL(origin).hostname)}$` }];

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
const APP_PATH = `/:first((?!(?:${OWN_SEGMENTS.join("|")})(?:/|$))${SEGMENT})/:rest(${SEGMENT})*`;

export function hostRedirects(): HostRedirect[] {
  const onApp = onHost(SITE.url);
  return [
    // "/guide" and "/guide/…" are two rules: with `/guide/:path*` the Worker would leave a literal
    // ":path*" in the Location header for "/guide" itself, where nothing matched.
    { source: "/guide", has: onApp, destination: `${SITE.guideUrl}/guide`, permanent: true },
    { source: "/guide/:path+", has: onApp, destination: `${SITE.guideUrl}/guide/:path+`, permanent: true },
    { source: APP_PATH, has: onHost(SITE.guideUrl), destination: `${SITE.url}/:first/:rest*`, permanent: false },
  ];
}

/** Before the files: the app's own page for "/" exists, and the root domain must not reach it. */
export function hostRewrites(): HostRewrite[] {
  return [{ source: "/", has: onHost(SITE.guideUrl), destination: "/guide/tarot" }];
}
