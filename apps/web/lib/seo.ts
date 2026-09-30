import { GUIDE_ARTICLES, GUIDE_CATEGORIES, guideIndexPath } from "./guide";
import { INFO_PAGES } from "./infoPages";

/** Personal readings, stories, invites, the account page, dev screens and the API stay out of search (spec §10). */
export const ROBOTS_DISALLOW = ["/api", "/chapter", "/story", "/me", "/dev", "/invite"] as const;

/**
 * Public, indexable pages: entry points, the guide tabs and articles, the service pages (about, how,
 * help, FAQ), pricing and the policies.
 * `/guide` itself is a permanent redirect to the first tab (next.config.ts), so it is not listed.
 */
export const SITEMAP_PATHS: readonly string[] = [
  "/",
  "/tarot/new",
  "/now",
  "/saju/new",
  ...GUIDE_CATEGORIES.map(guideIndexPath),
  ...GUIDE_ARTICLES.map((article) => `/guide/${article.slug}`),
  ...Object.values(INFO_PAGES).map((page) => page.path),
  "/pricing",
  "/refund",
  "/terms",
  "/privacy",
];
