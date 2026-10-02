import { SITE } from "./config";

/**
 * robots.txt (served by app/robots.txt/route.ts). Search engines and AI search/answer crawlers may
 * read every public page; personal pages (readings, stories, invites, the account and 별자리 인연
 * owner pages), dev screens and the API stay out, except the share images under /api/og/ that link
 * previews fetch. In-progress flow screens are crawlable but carry noindex (lib/seo.ts NOINDEX).
 */

/** Path prefixes no crawler may fetch. `/b` itself is a noindex page; `/b/<code>` are friend invites. */
export const ROBOTS_DISALLOW = ["/api/", "/chapter", "/story", "/me", "/dev", "/invite", "/bonds", "/b/", "/pay"] as const;

/** Longest match wins, so the share images stay fetchable under the disallowed /api/. */
export const ROBOTS_ALLOW = ["/", "/api/og/"] as const;

/**
 * Crawlers named in the same group as `*`, so each one reads the same rules even if a future group
 * would single it out: web search (Google, Naver, Bing, Daum, Apple, DuckDuckGo, Yandex) and the AI
 * search, answer and training crawlers the owner wants citing the site.
 */
export const NAMED_CRAWLERS = [
  "Googlebot",
  "Googlebot-Image",
  "Google-Extended",
  "Yeti",
  "NaverBot",
  "Bingbot",
  "Daumoa",
  "Applebot",
  "Applebot-Extended",
  "DuckDuckBot",
  "YandexBot",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "Amazonbot",
  "Meta-ExternalAgent",
  "MistralAI-User",
  "CCBot",
] as const;

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
