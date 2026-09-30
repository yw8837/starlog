import { GUIDE_ARTICLES } from "./guide";

/** Personal readings, stories, invites, the account page, dev screens and the API stay out of search (spec §10). */
export const ROBOTS_DISALLOW = ["/api", "/chapter", "/story", "/me", "/dev", "/invite"] as const;

/** Public, indexable pages: entry points, the guide and its articles, pricing and the policies. */
export const SITEMAP_PATHS: readonly string[] = [
  "/",
  "/tarot/new",
  "/saju/new",
  "/guide",
  ...GUIDE_ARTICLES.map((article) => `/guide/${article.slug}`),
  "/pricing",
  "/refund",
  "/terms",
  "/privacy",
];
