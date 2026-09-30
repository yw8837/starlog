import { getCard } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { GUIDE_ARTICLES, GUIDE_CATEGORIES, articlesIn, findArticle, guideIndexPath } from "./guide";

describe("GUIDE_ARTICLES", () => {
  it("holds the six articles, in order, with the agreed titles", () => {
    expect(GUIDE_ARTICLES.map((a) => a.title)).toEqual([
      "타로 카드 읽는 법",
      "정방향과 역방향은 뭐가 달라요?",
      "출생시간을 모를 때 사주는?",
      "오행이 뭐예요?",
      "은둔자 카드 이야기",
      "별 카드 이야기",
    ]);
  });

  it("gives each article a unique, URL-safe slug", () => {
    const slugs = GUIDE_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("finds an article by slug, and nothing for an unknown slug", () => {
    expect(findArticle("the-star")?.title).toBe("별 카드 이야기");
    expect(findArticle("nope")).toBeUndefined();
  });

  it("keeps bodies short: 3-5 paragraphs, every one in 해요체", () => {
    for (const article of GUIDE_ARTICLES) {
      expect(article.sections.length, article.slug).toBeGreaterThanOrEqual(3);
      expect(article.sections.length, article.slug).toBeLessThanOrEqual(5);
      for (const section of article.sections) expect(section.body, article.slug).toMatch(/요[.?]$/);
    }
  });

  it("has a search description for every article (under 120 characters)", () => {
    for (const article of GUIDE_ARTICLES) {
      expect(article.description.length, article.slug).toBeGreaterThan(20);
      expect(article.description.length, article.slug).toBeLessThanOrEqual(120);
    }
  });

  it("points card articles at real cards", () => {
    expect(findArticle("the-hermit")?.cardId).toBe("major-09-hermit");
    expect(findArticle("the-star")?.cardId).toBe("major-17-star");
    for (const article of GUIDE_ARTICLES) if (article.cardId) expect(() => getCard(article.cardId ?? "")).not.toThrow();
  });

  it("never uses a tab segment as a slug (/guide/tarot and /guide/saju are static routes that win over [slug])", () => {
    expect(GUIDE_CATEGORIES).toEqual(["tarot", "saju"]);
    for (const article of GUIDE_ARTICLES) expect(GUIDE_CATEGORIES as readonly string[], article.slug).not.toContain(article.slug);
  });

  it("makes no promises about outcomes", () => {
    const text = JSON.stringify(GUIDE_ARTICLES);
    for (const word of ["보장", "확률", "반드시 이뤄", "무조건", "합격", "재회"]) expect(text).not.toContain(word);
  });
});

describe("guide tabs", () => {
  it("lists each category's articles in their original order", () => {
    expect(articlesIn("tarot").map((a) => a.slug)).toEqual(["how-to-read-tarot", "upright-and-reversed", "the-hermit", "the-star"]);
    expect(articlesIn("saju").map((a) => a.slug)).toEqual(["saju-without-birth-time", "five-elements"]);
  });

  it("puts every article in exactly one tab", () => {
    const listed = GUIDE_CATEGORIES.flatMap((category) => articlesIn(category).map((a) => a.slug));
    expect([...listed].sort()).toEqual(GUIDE_ARTICLES.map((a) => a.slug).sort());
  });

  it("gives each tab its own path", () => {
    expect(GUIDE_CATEGORIES.map(guideIndexPath)).toEqual(["/guide/tarot", "/guide/saju"]);
  });
});
