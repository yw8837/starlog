import { SITE } from "./config";

/**
 * One Worker answers on two hosts (wrangler.jsonc routes): the app on starlog.yeolmaeapps.kr and the
 * guides on the root domain yeolmaeapps.kr. AdSense approves a root domain and then serves its
 * subdomains without another review, so the guides, the only pages with ads, are on the root domain
 * (owner decision 2026-10-03). The redirects and the rewrite that enforce it are in lib/hostRoutes.ts.
 */
export type SiteHost = "app" | "guide";

/** A guide page: /guide and everything under it. */
export const isGuidePath = (path: string): boolean => path === "/guide" || path.startsWith("/guide/");

/** The host that serves a path in production: guide pages on the root domain, everything else on the app host. */
export const hostOfPath = (path: string): SiteHost => (isGuidePath(path) ? "guide" : "app");

export const originOf = (host: SiteHost): string => (host === "guide" ? SITE.guideUrl : SITE.url);

/**
 * An absolute URL on the host that really serves `path`. Never behind the build flag: canonicals,
 * Open Graph URLs, JSON-LD, sitemaps, feeds and llms.txt always name the one real home.
 */
export const absoluteUrl = (path: string): string => new URL(path, originOf(hostOfPath(path))).toString();

/** The guide's feed lives next to its articles on the root domain (app/rss.xml/route.ts serves it on both hosts). */
export const FEED_URL = new URL("/rss.xml", SITE.guideUrl).toString();

/**
 * NEXT_PUBLIC_SPLIT_HOSTS=1 marks the real deploy build, the only one whose pages are served from the
 * two real hosts. Next inlines the value at build time. Every other run (next dev, the OpenNext
 * preview on localhost, the e2e suite, unit tests) has one origin, so its links must stay paths.
 */
export const splitHosts = (flag: string | undefined = process.env.NEXT_PUBLIC_SPLIT_HOSTS): boolean => flag === "1";

/** A link to a guide page from the app: absolute on the root domain when the hosts are split, else the path. */
export const guideHref = (path: string): string => (splitHosts() ? new URL(path, SITE.guideUrl).toString() : path);

/** A link to an app route from a guide page: absolute on the app host when the hosts are split, else the path. */
export const appHref = (path: string): string => (splitHosts() ? new URL(path, SITE.url).toString() : path);

/**
 * href for a link in a component both hosts render (the tab bar, the footer): `from` is the host the
 * page is served on. A link to the same host stays a path; one to the other host goes through
 * guideHref or appHref.
 */
export function linkHref(path: string, from: SiteHost = "app"): string {
  const target = hostOfPath(path);
  if (target === from) return path;
  return target === "guide" ? guideHref(path) : appHref(path);
}

/** The site a request is for: the root domain's guide, or the app on every other host (starlog, localhost, previews). */
export const siteOfRequest = (request: Request): SiteHost => (new URL(request.url).hostname === new URL(SITE.guideUrl).hostname ? "guide" : "app");
