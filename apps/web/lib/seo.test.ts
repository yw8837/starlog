import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SITE } from "./config";
import { GUIDE_ARTICLES } from "./guide";

describe("sitemap", () => {
  const urls = sitemap().map((entry) => entry.url);

  it("lists the entry points, the guide, pricing and every policy page on the production origin", () => {
    for (const path of ["/tarot/new", "/saju/new", "/guide", "/pricing", "/refund", "/terms", "/privacy"]) {
      expect(urls).toContain(`${SITE.url}${path}`);
    }
    expect(urls).toContain(`${SITE.url}/`);
    expect(urls.every((url) => url.startsWith(`${SITE.url}/`))).toBe(true);
  });

  it("includes every guide article", () => {
    for (const article of GUIDE_ARTICLES) expect(urls).toContain(`${SITE.url}/guide/${article.slug}`);
  });

  it("leaves out personal pages", () => {
    expect(urls.some((url) => /\/(chapter|story|me|invite|dev|api)(\/|$)/.test(new URL(url).pathname))).toBe(false);
  });
});

describe("robots", () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
  const disallow = rules.flatMap((rule) => (Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : []));

  it("keeps the API and personal pages out of crawlers", () => {
    for (const path of ["/api", "/chapter", "/story", "/me", "/dev", "/invite"]) expect(disallow).toContain(path);
  });

  it("does not block the public pages and points at the sitemap", () => {
    for (const path of ["/", "/pricing", "/refund", "/terms", "/privacy", "/guide"]) {
      expect(disallow.some((rule) => path.startsWith(rule))).toBe(false);
    }
    expect(result.sitemap).toBe(`${SITE.url}/sitemap.xml`);
  });
});
