import { describe, expect, it } from "vitest";
import { ALL_GUIDE_ARTICLES, GUIDE_ARTICLES, findArticleIn, publishedArticles } from "./guide";
import { guidePublished, publishInstant, type GuideArticle } from "./guideMeta";
import { sitemapEntries } from "./seo";

/**
 * publishAt (2026-11-10): an article dated ahead stays out of the lists, the sitemap and its own address until 00:00
 * Korean time of that day. An article without one is out from the start, as every article before this one was.
 */

const at = (iso: string) => Date.parse(iso);
const article = (slug: string, publishAt?: string): GuideArticle => ({
  slug,
  title: slug,
  category: "saju",
  description: "",
  sections: [],
  ...(publishAt ? { publishAt, published: publishAt, updated: publishAt } : {}),
});

describe("guidePublished", () => {
  it("reads publishAt as 00:00 Korean time of that day", () => {
    expect(publishInstant("2026-11-12")).toBe(at("2026-11-11T15:00:00Z"));
  });

  it("hides an article the minute before its day starts in Korea and shows it from that day on", () => {
    const dated = article("dated", "2026-11-12");
    expect(guidePublished(dated, at("2026-11-11T14:59:59Z"))).toBe(false);
    expect(guidePublished(dated, at("2026-11-11T15:00:00Z"))).toBe(true);
    expect(guidePublished(dated, at("2026-12-01T00:00:00Z"))).toBe(true);
  });

  it("always shows an article without publishAt", () => expect(guidePublished(article("plain"), at("2000-01-01T00:00:00Z"))).toBe(true));
});

describe("the lists and the article lookup on either side of a date", () => {
  const list = [article("plain"), article("dated", "2026-11-12")];

  it("lists only what is out", () => {
    expect(publishedArticles(list, at("2026-11-11T14:59:00Z")).map((a) => a.slug)).toEqual(["plain"]);
    expect(publishedArticles(list, at("2026-11-11T15:00:00Z")).map((a) => a.slug)).toEqual(["plain", "dated"]);
  });

  it("finds a dated article only from its day", () => {
    expect(findArticleIn(list, "dated", at("2026-11-11T14:59:00Z"))).toBeUndefined();
    expect(findArticleIn(list, "dated", at("2026-11-11T15:00:00Z"))?.slug).toBe("dated");
    expect(findArticleIn(list, "nothing", at("2026-11-11T15:00:00Z"))).toBeUndefined();
  });

  it("builds GUIDE_ARTICLES from the articles out when the module loads, in ALL_GUIDE_ARTICLES' order", () => {
    const now = Date.now();
    expect(GUIDE_ARTICLES.map((a) => a.slug)).toEqual(ALL_GUIDE_ARTICLES.filter((a) => guidePublished(a, now)).map((a) => a.slug));
  });

  it("dates every scheduled article with publishAt as its first and last date", () => {
    for (const a of ALL_GUIDE_ARTICLES.filter((a) => a.publishAt)) {
      expect(a.publishAt, a.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.published, a.slug).toBe(a.publishAt);
      expect(a.updated, a.slug).toBe(a.publishAt);
    }
  });
});

describe("the sitemap follows the request's time", () => {
  const paths = (now: number) => sitemapEntries({ now }).map((entry) => entry.path);

  it("lists each scheduled article only from its day", () => {
    for (const a of ALL_GUIDE_ARTICLES.filter((a) => a.publishAt)) {
      const day = publishInstant(a.publishAt as string);
      expect(paths(day - 60_000), a.slug).not.toContain(`/guide/${a.slug}`);
      expect(paths(day), a.slug).toContain(`/guide/${a.slug}`);
    }
  });
});
