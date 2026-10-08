import { getCard } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { GUIDE_ARTICLES, GUIDE_CATEGORIES, articlesIn, findArticle, guideIndexPath, guideSectionText, type GuideBlock } from "./guide";

describe("GUIDE_ARTICLES", () => {
  it("starts with the six original articles, in order, with the agreed titles (the library follows)", () => {
    expect(GUIDE_ARTICLES.slice(0, 6).map((a) => a.title)).toEqual([
      "타로 카드 읽는 법",
      "정방향과 역방향은 뭐가 달라요?",
      "출생시간을 모를 때 사주는?",
      "오행이 뭐예요?",
      // Renamed 2026-10-08 to match the other card articles ("타로 바보 카드 뜻").
      "타로 은둔자 카드 뜻",
      "타로 별 카드 뜻",
    ]);
  });

  it("gives each article a unique, URL-safe slug", () => {
    const slugs = GUIDE_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("finds an article by slug, and nothing for an unknown slug", () => {
    expect(findArticle("the-star")?.title).toBe("타로 별 카드 뜻");
    expect(findArticle("nope")).toBeUndefined();
  });

  it("keeps bodies to 4-7 sections, every one in 해요체", () => {
    for (const article of GUIDE_ARTICLES) {
      expect(article.sections.length, article.slug).toBeGreaterThanOrEqual(4);
      expect(article.sections.length, article.slug).toBeLessThanOrEqual(7);
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

describe("guideSectionText (llms-full, FAQ answers, length and style checks)", () => {
  const withBlocks = (...blocks: GuideBlock[]) => guideSectionText({ heading: "제목", body: "첫 문단이에요.", blocks });

  it("is the body alone when the section has no blocks", () => {
    expect(guideSectionText({ heading: "제목", body: "첫 문단이에요." })).toBe("첫 문단이에요.");
    expect(withBlocks()).toBe("첫 문단이에요.");
  });

  it("puts every paragraph, item, step and callout on its own line after the body, with no list marks", () => {
    expect(
      withBlocks(
        { kind: "p", text: "둘째 문단이에요." },
        { kind: "list", items: ["하나", "둘"] },
        { kind: "list", ordered: true, items: ["먼저", "다음"] },
        { kind: "steps", items: [{ title: "자리", text: "자리를 봐요." }, { title: "그림", text: "그림을 봐요." }] },
        { kind: "callout", tone: "caution", title: "중요한 결정", text: "전문가와 상의해 주세요." },
      ),
    ).toBe(["첫 문단이에요.", "둘째 문단이에요.", "하나", "둘", "먼저", "다음", "자리: 자리를 봐요.", "그림: 그림을 봐요.", "중요한 결정: 전문가와 상의해 주세요."].join("\n"));
  });

  it("flattens a table after its caption, one row per line as head: cell pairs", () => {
    const table: GuideBlock = { kind: "table", caption: "오행과 계절", head: ["오행", "계절"], rows: [["목(木)", "봄"], ["화(火)", "여름"]] };
    expect(withBlocks(table)).toBe(["첫 문단이에요.", "오행과 계절", "오행: 목(木), 계절: 봄", "오행: 화(火), 계절: 여름"].join("\n"));
  });

  it("names a card row's cards, and keeps the captions of figures, card rows and diagrams (never an image's alt)", () => {
    expect(
      withBlocks(
        { kind: "cardRow", cards: ["major-00-fool", "major-17-star"], caption: "두 장" },
        { kind: "cardRow", cards: ["major-01-magician", "cups-01"] },
        { kind: "figure", src: "/cards/major-17-star.webp", alt: "별 카드 그림", width: 600, height: 1027, caption: "XVII 별" },
        { kind: "figure", src: "/cards/major-17-star.webp", alt: "별 카드 그림", width: 600, height: 1027 },
        { kind: "diagram", name: "five-elements", caption: "오행의 상생과 상극" },
        { kind: "diagram", name: "daewoon" },
      ),
    ).toBe(["첫 문단이에요.", "두 장", "바보 · 별", "마법사 · 컵 에이스", "XVII 별", "오행의 상생과 상극"].join("\n"));
  });
});

describe("guide tabs", () => {
  it("lists each category's original articles first, in their original order", () => {
    expect(articlesIn("tarot").slice(0, 4).map((a) => a.slug)).toEqual(["how-to-read-tarot", "upright-and-reversed", "the-hermit", "the-star"]);
    expect(articlesIn("saju").slice(0, 2).map((a) => a.slug)).toEqual(["saju-without-birth-time", "five-elements"]);
  });

  it("puts every article in exactly one tab", () => {
    const listed = GUIDE_CATEGORIES.flatMap((category) => articlesIn(category).map((a) => a.slug));
    expect([...listed].sort()).toEqual(GUIDE_ARTICLES.map((a) => a.slug).sort());
  });

  it("gives each tab its own path", () => {
    expect(GUIDE_CATEGORIES.map(guideIndexPath)).toEqual(["/guide/tarot", "/guide/saju"]);
  });
});
