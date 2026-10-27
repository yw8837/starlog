import { SITE } from "./config";

/**
 * robots.txt (served by app/robots.txt/route.ts). Search engines and AI search/answer crawlers may
 * read every public page; chapters, invites, dev screens and the API stay out, except the share
 * images under /api/og/ that link previews fetch. The account, stories and 별자리 인연 owner pages
 * (/me, /story, /bonds, /b) and the in-progress flow screens are crawlable but carry noindex (lib/seo.ts
 * NOINDEX): a crawler that may not fetch a page never reads its noindex.
 * Both hosts (the app and the guide's root domain) get the same rules; `site`, the origin of the host
 * that served the file, only sets the Sitemap and llms.txt lines (app/robots.txt/route.ts).
 * Training-only crawlers (GPTBot, ClaudeBot, Google-Extended and the like) are named nowhere here:
 * Cloudflare's managed robots block and the edge keep them out, by the owner's decision of 2026-10-08.
 */

/**
 * Path prefixes no crawler may fetch. `/b` and `/b/<code>` (friend invites) carry noindex and are read-only, so
 * they are crawlable: Google must fetch them to read the tag. /pay stays blocked although its pages carry noindex:
 * /pay/success is Toss's callback and confirms the payment from its query when opened, which a crawler must never do.
 */
export const ROBOTS_DISALLOW = ["/api/", "/chapter", "/dev", "/invite", "/pay"] as const;

/** Longest match wins, so the share images stay fetchable under the disallowed /api/. */
export const ROBOTS_ALLOW = ["/", "/api/og/"] as const;

/**
 * Crawlers named in the same group as `*`, so each one reads the same rules even if a future group
 * would single it out: web search (Google, Naver, Bing, Daum, Apple, DuckDuckGo, Yandex) and the AI
 * search and answer crawlers the owner wants citing the site. Never a training-only crawler: this
 * group allows every public page, so a name here would let it in (see the top of this file).
 */
export const NAMED_CRAWLERS = [
  "Googlebot",
  "Googlebot-Image",
  "Yeti",
  "NaverBot",
  "Bingbot",
  "Daumoa",
  "Applebot",
  "DuckDuckBot",
  "YandexBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-SearchBot",
  "Claude-User",
  "MistralAI-User",
] as const;

/**
 * Share images that are fetched as pictures but must not be indexed as pages (Search Console listed ~25 of
 * /api/og/* as "크롤링됨"). One X-Robots-Tag header from next.config instead of one per route: link-preview
 * scrapers ignore it, Google obeys it. They stay crawlable (ROBOTS_ALLOW), or Google could not read the header.
 * /opengraph-image is the shared brand picture (app/opengraph-image.tsx).
 */
export const NOINDEX_HEADER_SOURCES = ["/api/og/:path*", "/opengraph-image"] as const;

export function noindexHeaders() {
  return NOINDEX_HEADER_SOURCES.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex" }] }));
}

/** Daum 웹마스터도구 ownership line, read at build time like the other verification codes. */
const DAUM_ENV = process.env.NEXT_PUBLIC_DAUM_WEBMASTER_TOOL;

/**
 * "#DaumWebMasterTool:<pin>:<id>" as Daum gives it. The owner may paste the whole line or only the
 * part after "#DaumWebMasterTool:"; anything else (spaces, line breaks) is refused.
 */
export function daumWebmasterLine(value: string | undefined = DAUM_ENV): string | null {
  const code = value?.trim().replace(/^#?DaumWebMasterTool:/i, "") ?? "";
  return /^[A-Za-z0-9+/=:_-]+$/.test(code) ? `#DaumWebMasterTool:${code}` : null;
}

export function robotsTxt({ daum = DAUM_ENV, site = SITE.url }: { daum?: string; site?: string } = {}): string {
  const lines = [
    `# ${SITE.name} robots.txt`,
    "# Search engines and AI search/answer crawlers are welcome on every public page.",
    `# About the service for language models: ${new URL("/llms.txt", site).toString()}`,
    "",
    "User-agent: *",
    ...NAMED_CRAWLERS.map((agent) => `User-agent: ${agent}`),
    ...ROBOTS_ALLOW.map((path) => `Allow: ${path}`),
    ...ROBOTS_DISALLOW.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${new URL("/sitemap.xml", site).toString()}`,
  ];
  const daumLine = daumWebmasterLine(daum);
  return `${[...lines, ...(daumLine ? ["", daumLine] : [])].join("\n")}\n`;
}
