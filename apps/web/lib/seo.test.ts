import { CONSTELLATIONS } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { GET as robotsRoute } from "@/app/robots.txt/route";
import sitemap from "@/app/sitemap";
import { SITE } from "./config";
import { GUIDE_ARTICLES } from "./guide";
import { LEGAL_EFFECTIVE_DATE } from "./legal";
import { NAMED_CRAWLERS, daumWebmasterLine, robotsTxt } from "./robots";
import { pageMetadata, siteVerification, sitemapEntries } from "./seo";

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);
  const entry = (path: string) => entries.find((e) => e.url === new URL(path, SITE.url).toString());

  it("lists the entry points, the free daily cards, both guide tabs, pricing and every policy page on the production origin", () => {
    for (const path of ["/tarot/new", "/saju/new", "/now", "/today", "/guide/tarot", "/guide/saju", "/pricing", "/refund", "/terms", "/privacy"]) {
      expect(urls).toContain(`${SITE.url}${path}`);
    }
    for (const path of ["/about", "/how", "/help", "/faq"]) expect(urls).toContain(`${SITE.url}${path}`);
    expect(urls).toContain(`${SITE.url}/`);
    expect(urls.every((url) => url.startsWith(`${SITE.url}/`))).toBe(true);
  });

  it("includes every guide article with its updated date as lastmod, and each tab with its newest article's", () => {
    for (const article of GUIDE_ARTICLES) {
      expect(entry(`/guide/${article.slug}`)?.lastModified, article.slug).toBe(article.updated);
    }
    const newest = GUIDE_ARTICLES.map((article) => article.updated ?? "").sort().at(-1);
    expect(entry("/guide/tarot")?.lastModified).toBe(newest);
  });

  it("dates the policies by their 시행일 and leaves lastmod off pages without a content date", () => {
    for (const path of ["/refund", "/terms", "/privacy"]) expect(entry(path)?.lastModified).toBe(LEGAL_EFFECTIVE_DATE);
    for (const path of ["/", "/now", "/today", "/faq"]) expect(entry(path)?.lastModified).toBeUndefined();
  });

  it("with 별자리 인연 on, lists /lucky, /ranking and the twelve sign rankings; with it off, none of them", () => {
    expect(SITE.features.bonds).toBe(true);
    for (const path of ["/lucky", "/ranking", ...CONSTELLATIONS.map((sign) => `/ranking/${sign.id}`)]) expect(urls).toContain(`${SITE.url}${path}`);
    expect(CONSTELLATIONS).toHaveLength(12);
    const off = sitemapEntries({ features: { bonds: false } }).map((e) => e.path);
    expect(off.some((path) => path === "/lucky" || path.startsWith("/ranking"))).toBe(false);
  });

  it("leaves out /guide, which permanently redirects to the first tab, and lists each page once", () => {
    expect(urls).not.toContain(`${SITE.url}/guide`);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("leaves out personal and in-progress pages", () => {
    const personal = /^\/(chapter|story|me|invite|dev|api|b|bonds|login|owner)(\/|$)|^\/tarot\/(draw|result|new\/situation)|^\/saju\/chart/;
    expect(urls.filter((url) => personal.test(new URL(url).pathname))).toEqual([]);
  });
});

const response = robotsRoute();
const text = await response.text();

describe("robots.txt", () => {
  const lines = text.split("\n");
  const values = (field: string) => lines.filter((line) => line.startsWith(`${field}: `)).map((line) => line.slice(field.length + 2));

  it("is plain text with one group for every crawler, search and AI alike", () => {
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    const agents = values("User-agent");
    expect(agents[0]).toBe("*");
    for (const bot of ["Googlebot", "Yeti", "Bingbot", "Daumoa", "Google-Extended", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot"]) {
      expect(agents, bot).toContain(bot);
    }
    expect(agents).toEqual(["*", ...NAMED_CRAWLERS]);
    // One group: no rule line comes before the last User-agent line.
    const lastAgent = lines.findLastIndex((line) => line.startsWith("User-agent: "));
    const firstRule = lines.findIndex((line) => /^(Allow|Disallow): /.test(line));
    expect(firstRule).toBeGreaterThan(lastAgent);
  });

  it("keeps the API and personal pages out, but lets link previews fetch /api/og/", () => {
    const disallow = values("Disallow");
    for (const path of ["/api/", "/chapter", "/story", "/me", "/dev", "/invite", "/bonds", "/b/"]) expect(disallow).toContain(path);
    expect(values("Allow")).toEqual(["/", "/api/og/"]);
  });

  it("does not block the public pages, the rankings included, and points at the sitemap", () => {
    const disallow = values("Disallow");
    const publicPaths = ["/", "/pricing", "/refund", "/terms", "/privacy", "/guide/tarot", "/guide/the-fool", "/now", "/today", "/ranking", "/ranking/aries", "/lucky", "/llms.txt", "/tarot/new", "/saju/new"];
    for (const path of publicPaths) expect(disallow.some((rule) => path.startsWith(rule)), path).toBe(false);
    expect(values("Sitemap")).toEqual([`${SITE.url}/sitemap.xml`]);
  });

  it("adds the Daum 웹마스터도구 line only when its code is set, whole line or code alone", () => {
    expect(robotsTxt({ daum: "" })).not.toContain("DaumWebMasterTool");
    const code = "2e3b08a507e2acc3f28c65113723c370:oqGG0QNteBAx1EjTM8fgkA==";
    for (const value of [code, `#DaumWebMasterTool:${code}`, `  #DaumWebMasterTool:${code}\n`]) {
      expect(robotsTxt({ daum: value }).trimEnd().split("\n").at(-1)).toBe(`#DaumWebMasterTool:${code}`);
    }
    expect(daumWebmasterLine("not a code\nUser-agent: *")).toBeNull();
  });
});

describe("search console verification", () => {
  it("writes each engine's meta tag only for the codes that are set", () => {
    expect(siteVerification({})).toBeUndefined();
    expect(siteVerification({ google: " g-code ", naver: "n-code", bing: "b-code" })).toEqual({
      google: "g-code",
      other: { "naver-site-verification": "n-code", "msvalidate.01": "b-code" },
    });
    expect(siteVerification({ naver: "n-code" })).toEqual({ other: { "naver-site-verification": "n-code" } });
  });
});

describe("pageMetadata", () => {
  it("sets the canonical, og:url, the shared image and the feed link", () => {
    const meta = pageMetadata({ title: "제목", description: "설명", path: "/faq" });
    expect(meta.alternates?.canonical).toBe("/faq");
    expect(meta.alternates?.types).toHaveProperty("application/rss+xml");
    expect(meta.openGraph).toMatchObject({ type: "website", url: "/faq", locale: "ko_KR", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] });
  });

  it("marks articles with their dates and publisher", () => {
    const meta = pageMetadata({ title: "제목", description: "설명", path: "/guide/the-fool", type: "article", publishedTime: "2026-10-01", modifiedTime: "2026-10-02" });
    expect(meta.openGraph).toMatchObject({ type: "article", publishedTime: "2026-10-01", modifiedTime: "2026-10-02", authors: [SITE.business.name] });
  });
});
