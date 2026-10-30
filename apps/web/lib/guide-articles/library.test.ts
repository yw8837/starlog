import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CARDS, getCard } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { aiTells } from "../ai/style";
import { SITE, won } from "../config";
import { GUIDE_ARTICLES, GUIDE_CATEGORIES, articlesIn, findArticle, guideSectionText, type GuideArticle } from "../guide";
import { GUIDE_MOVED_TO_HELP } from "../hostRoutes";
import { llmsFullTxt } from "../llms";
import { guideRss } from "../rss";
import { sitemapXml } from "../seo";
import { guideFaqJsonLd, guideQuestions, isQuestion } from "../jsonld";
import { GUIDE_DATES, GUIDE_SUMMARIES } from "./answers";
import { DAY_MASTER_ARTICLES } from "./day-masters";
import { SAJU_ARTICLES } from "./saju";
import { SAJU_CONCEPT_ARTICLES } from "./saju-concepts";
import { SPREAD_ARTICLES } from "./spreads";
import { MAJOR_ARCANA_ARTICLES } from "./tarot";
import { TAROT_BASICS_ARTICLES } from "./tarot-basics";

const LIBRARY: readonly GuideArticle[] = [
  ...SPREAD_ARTICLES, ...TAROT_BASICS_ARTICLES, ...MAJOR_ARCANA_ARTICLES, ...SAJU_ARTICLES, ...SAJU_CONCEPT_ARTICLES, ...DAY_MASTER_ARTICLES,
];

// A section's text is its body and its blocks' text (tables, lists, steps, callouts, captions).
const bodyText = (article: GuideArticle) => article.sections.map(guideSectionText).join("\n");
const allText = (article: GuideArticle) =>
  [article.title, article.description, article.summary ?? "", ...(article.keyPoints ?? []), ...article.sections.flatMap((section) => [section.heading, guideSectionText(section)])].join("\n");
const bodyLength = (article: GuideArticle) => article.sections.reduce((sum, section) => sum + guideSectionText(section).length, 0);

interface KbCard {
  id: string;
  names: { ko: string };
  imagery: { commonMisdescriptions: { wrong: string; regex: string }[] };
}
const kbPath = (cardId: string) => fileURLToPath(new URL(`../../../../content/kb/cards/${cardId}.json`, import.meta.url));
const kbCard = (cardId: string): KbCard => JSON.parse(readFileSync(kbPath(cardId), "utf8")) as KbCard;

/**
 * A card article's headings (SEO-05, ADS-04): every one names the card, so each stands alone for an answer engine, and
 * none is a stock heading. Since the editorial rework of 2026-10-23 a card has no fixed set of sections: which parts it
 * has, in what order and under what wording is the card's own (tarot.test.ts keeps those shapes varied).
 */
const SHARED_CARD_HEADINGS = ["그림 속 장면", "연애·일·돈 질문에서", "비슷한 카드와 헷갈릴 때"];
function expectCardHeadings(article: GuideArticle, name: string) {
  for (const heading of article.sections.map((section) => section.heading)) {
    expect(heading).toContain(name);
    expect(SHARED_CARD_HEADINGS).not.toContain(heading);
  }
}

/** Owner rules: no vendor or model names, no "베타", no promised outcomes (KB 글쓰기 규칙 too).
 * 재회 itself is a topic since 2026-10-31 (owner 2026-10-30: 재회운이 인기); a 재회 promised or foretold stays banned.
 */
const BANNED = [
  "베타", "Claude", "클로드", "GPT", "Gemini", "제미나이", "OpenAI", "Anthropic", "앤트로픽",
  "보장", "확률", "반드시", "무조건", "합격", "100%", "틀림없이", "우주가", "에너지가 흐르", "때가 되면", "절대로",
  "재회 가능성", "재회할 수 있어요", "재회하게 돼요", "재회 성공", "재회운이 있어요", "재회운이 없어요", "돌아올 거예요", "연락이 올 거예요", "연락이 와요",
];

const CELTIC_SLUG = "celtic-cross-spread";
/** An opening date or month next to a launch verb ("11월 중순 오픈", "2027년 1월에 열려요"). */
const OPENING_DATE = /오픈 예정|출시 예정|출시일|(\d+월|\d{4}년)[^.]{0,12}(오픈|출시|열려요|열릴|열어요|선보)/;

describe("guide library", () => {
  it("adds at least 60 articles on top of the six, every major arcana card has exactly one article", () => {
    // 62 until the two app manuals moved to /help (AdSense audit 2026-10-27).
    expect(LIBRARY.length).toBeGreaterThanOrEqual(60);
    expect(GUIDE_ARTICLES.length).toBe(6 + LIBRARY.length);
    const majors = CARDS.filter((card) => card.arcana === "major").map((card) => card.id);
    const cardIds = GUIDE_ARTICLES.flatMap((article) => (article.cardId ? [article.cardId] : []));
    expect([...cardIds].sort()).toEqual([...majors].sort());
  });

  it("keeps slugs ASCII kebab-case, unique, and never a tab segment", () => {
    const slugs = GUIDE_ARTICLES.map((article) => article.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(GUIDE_CATEGORIES as readonly string[]).not.toContain(slug);
    }
  });

  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: 4-7 sections in 해요체, a description of 80 characters or less", (_slug, article) => {
    expect(article.sections.length).toBeGreaterThanOrEqual(4);
    expect(article.sections.length).toBeLessThanOrEqual(7);
    expect(new Set(article.sections.map((section) => section.heading)).size).toBe(article.sections.length);
    for (const section of article.sections) expect(section.body).toMatch(/요[.?]$/);
    expect(article.description.length).toBeGreaterThan(20);
    expect(article.description.length).toBeLessThanOrEqual(80);
    expect(article.description).toMatch(/요[.?]$/);
  });

  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: no banned words, 켈틱 크로스 only in the spread article", (slug, article) => {
    const text = allText(article);
    for (const word of BANNED) expect(text, word).not.toContain(word);
    // 운명 only as the card name 운명의 수레바퀴.
    expect(text.replaceAll("운명의 수레바퀴", "")).not.toContain("운명");
    if (slug !== CELTIC_SLUG) expect(text).not.toMatch(/켈틱|Celtic/i);
  });

  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: AI-tell score below 3", (_slug, article) => {
    const hits = aiTells(bodyText(article));
    expect(hits.map((hit) => hit.id).length, hits.map((hit) => `${hit.id} ${hit.label}`).join(", ")).toBeLessThan(3);
  });

  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: 3-5 related reads that exist", (slug, article) => {
    const related = article.related ?? [];
    expect(related.length).toBeGreaterThanOrEqual(3);
    expect(related.length).toBeLessThanOrEqual(5);
    expect(new Set(related).size).toBe(related.length);
    expect(related).not.toContain(slug);
    for (const other of related) expect(findArticle(other), other).toBeDefined();
  });

  it("gives every library article a substantial body (card articles 3,000-7,800 characters, others 1,500-6,000, in whatever shape they have)", () => {
    // Card articles were 2,800 or more while each carried the 2026-10-22 boilerplate (a 300-character deck section, a
    // two-row keyword table, a one-line FAQ intro); the rework of 2026-10-23 cut those and kept the card's own reading.
    // The second read of 2026-10-23 adds each card's own substance (Waite's words, the older decks, a worked reading).
    for (const article of LIBRARY) {
      const length = bodyLength(article);
      if (article.cardId) {
        expect(length, article.slug).toBeGreaterThanOrEqual(3000);
        expect(length, article.slug).toBeLessThanOrEqual(7800);
      } else if (article.slug.startsWith("day-master-")) {
        // The ten day masters read their stem through its verse, seasons, a worked chart and its neighbours (saju-guides.test.ts).
        expect(length, article.slug).toBeGreaterThanOrEqual(3300);
        expect(length, article.slug).toBeLessThanOrEqual(6500);
      } else if (article.category === "saju") {
        // Saju concept pages carry worked examples and reference tables (saju-guides.test.ts keeps them 1,800+ shown characters).
        expect(length, article.slug).toBeGreaterThanOrEqual(1500);
        expect(length, article.slug).toBeLessThanOrEqual(4800);
      } else {
        expect(length, article.slug).toBeGreaterThanOrEqual(1500);
        // The thin tarot basics and spreads grew in the third review (2026-10-23).
        expect(length, article.slug).toBeLessThanOrEqual(6000);
      }
    }
  });
});

describe("card articles agree with the KB", () => {
  it.each(MAJOR_ARCANA_ARTICLES.map((article) => [article.slug, article] as const))("%s", (_slug, article) => {
    const cardId = article.cardId ?? "";
    expect(existsSync(kbPath(cardId)), cardId).toBe(true);
    expect(() => getCard(cardId)).not.toThrow();
    const card = kbCard(cardId);
    expect(card.id).toBe(cardId);
    expect(article.category).toBe("tarot");
    expect(article.title).toContain(card.names.ko);
    expectCardHeadings(article, card.names.ko);
    // The FAQPage JSON-LD (jsonld.ts guideQuestions): the questions the card's own headings ask, in page order.
    const asked = article.sections.filter((section) => isQuestion(section.heading)).map((section) => `${section.heading.replace(/\?$/, "")}?`);
    expect(asked.length).toBeGreaterThanOrEqual(2);
    expect(guideQuestions(article).map((entry) => entry.q)).toEqual(asked);
    expect(guideFaqJsonLd(article)).not.toBeNull();
    // The KB's known misdescriptions of this scan (R3) must not appear anywhere in the article.
    const text = allText(article);
    for (const mis of card.imagery.commonMisdescriptions) expect(text, mis.wrong).not.toMatch(new RegExp(mis.regex));
  });

  // 은둔자 and 별 live in lib/guide.ts with their own question headings; their pictures follow the same KB rules.
  const BASE_CARDS = GUIDE_ARTICLES.filter((article) => article.cardId && !MAJOR_ARCANA_ARTICLES.some((library) => library.slug === article.slug));
  it("finds the two card articles of lib/guide.ts", () => expect(BASE_CARDS.map((article) => article.slug)).toEqual(["the-hermit", "the-star"]));
  it("gives the 22 card articles headings none of which is shared between cards", () => {
    const headings = GUIDE_ARTICLES.filter((article) => article.cardId).flatMap((article) => article.sections.map((section) => section.heading));
    expect(new Set(headings).size).toBe(headings.length);
  });
  it.each(BASE_CARDS.map((article) => [article.slug, article] as const))("%s (lib/guide.ts)", (_slug, article) => {
    const card = kbCard(article.cardId ?? "");
    expect(article.title).toContain(card.names.ko);
    expectCardHeadings(article, card.names.ko);
    const text = allText(article);
    for (const mis of card.imagery.commonMisdescriptions) expect(text, mis.wrong).not.toMatch(new RegExp(mis.regex));
  });
});

describe("the premium readings, on sale since 2026-10-20, are introduced as they are: no 준비 중, no date (review 2026-10-20 A3)", () => {
  const premium = (id: string) => SITE.price.premium.find((p) => p.id === id)!;

  it("the Celtic Cross article explains the 10 positions and names 켈틱 크로스 10장, never 준비 중", () => {
    const article = findArticle(CELTIC_SLUG);
    expect(article?.category).toBe("tarot");
    const text = allText(article as GuideArticle);
    expect(text).toContain("켈틱 크로스");
    expect(text).toContain(premium("tarot-deep").name);
    expect(text).not.toContain("심층 타로");
    expect(text).not.toMatch(/준비 중|준비하고/);
    for (let n = 1; n <= 10; n++) expect(text, `${n}번 자리`).toContain(`${n}번`);
    expect(text).not.toMatch(OPENING_DATE);
  });

  it.each([
    ["saju-compatibility", "match"],
    ["new-year-fortune", "newyear-2027"],
  ])("%s introduces %s by its SITE name, never 준비 중, with no date", (slug, id) => {
    const text = allText(findArticle(slug) as GuideArticle);
    expect(text).toContain(premium(id).name);
    expect(text).not.toMatch(/준비 중|준비하고/);
    expect(text).not.toMatch(OPENING_DATE);
  });

  it("no other article promises an opening date", () => {
    for (const article of GUIDE_ARTICLES) expect(allText(article), article.slug).not.toMatch(OPENING_DATE);
  });

  // AdSense audit 2026-10-27: a price is product info, so it stays in the boxes after the article (the CTA and
  // PremiumRows, app/guide/[slug]/page.tsx), never in an article's own text.
  it("no article's text carries a price", () => {
    const prices = [SITE.price.tarotStandardKrw, SITE.price.sajuStandardKrw, ...SITE.price.premium.map((p) => p.krw)].map(won);
    for (const article of GUIDE_ARTICLES) {
      const text = allText(article);
      expect(text, article.slug).not.toMatch(/\d{1,3}(?:,\d{3})+원/);
      for (const price of prices) expect(text, `${article.slug}: ${price}`).not.toContain(price);
    }
  });
});

describe("answer-first fields (요약, dates)", () => {
  const slugs = GUIDE_ARTICLES.map((article) => article.slug);
  const sentences = (text: string) => text.split(/(?<=[.?!])\s+/).filter(Boolean);

  it("keeps answers.ts keyed by real slugs only", () => {
    for (const map of [GUIDE_SUMMARIES, GUIDE_DATES]) for (const slug of Object.keys(map)) expect(slugs, slug).toContain(slug);
  });

  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: a 2-3 sentence 요약 in 해요체 with no AI tells", (_slug, article) => {
    const summary = article.summary ?? "";
    expect(sentences(summary).length).toBeGreaterThanOrEqual(2);
    expect(sentences(summary).length).toBeLessThanOrEqual(3);
    expect(summary.length).toBeGreaterThanOrEqual(60);
    expect(summary.length).toBeLessThanOrEqual(260);
    for (const sentence of sentences(summary)) expect(sentence, sentence).toMatch(/[요죠][.?]$/);
    expect(summary).not.toBe(article.description);
    const hits = aiTells(summary);
    expect(hits.length, hits.map((hit) => `${hit.id} ${hit.label}`).join(", ")).toBe(0);
  });

  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: published and updated dates, updated not before published", (_slug, article) => {
    expect(article.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(article.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((article.updated ?? "") >= (article.published ?? "")).toBe(true);
  });

});

/**
 * The third review of 2026-10-23 found ten tarot basics, spreads and how-tos at 1,300-1,800 characters without spaces,
 * none linking a card article from its body. Each now reads its own facts (Waite, the KB, the app's code, the engine).
 */
describe("the thin tarot basics, spreads and how-tos grew on their own facts (third review, 2026-10-23)", () => {
  const THIN = [
    "redrawing-same-question", "one-card-yes-no", "upright-and-reversed", "major-and-minor-arcana",
    "how-to-read-tarot", "court-cards", "saju-without-birth-time", "three-card-spread", "celtic-cross-spread",
  ];
  const bodyLinks = (article: GuideArticle) => {
    const raw = article.sections.flatMap((section) => [section.body, ...(section.blocks ?? []).map((block) => JSON.stringify(block))]).join("\n");
    return new Set([...raw.matchAll(/\]\(\/guide\/([a-z0-9-]+)\)/g)].map((match) => match[1] as string));
  };

  it.each(THIN)("%s: 2,500 characters or more without spaces, and three or more card articles (saju articles for a saju one) linked from the body", (slug) => {
    const article = findArticle(slug) as GuideArticle;
    expect(bodyText(article).replace(/\s/g, "").length).toBeGreaterThanOrEqual(2500);
    const linked = [...bodyLinks(article)].filter((other) => (article.category === "saju" ? findArticle(other)?.category === "saju" : findArticle(other)?.cardId));
    expect(linked.length, [...bodyLinks(article)].join(", ")).toBeGreaterThanOrEqual(3);
  });

  it("leaves no tarot basics, spread or how-to article without a link in its body", () => {
    const base = GUIDE_ARTICLES.filter((article) => article.category === "tarot" && !article.cardId);
    for (const article of base) expect(bodyLinks(article).size, article.slug).toBeGreaterThan(0);
  });

  it("court-cards: all sixteen court cards in its clue tables, each with a picture clue and what is misremembered", () => {
    const tables = (findArticle("court-cards") as GuideArticle).sections
      .flatMap((section) => section.blocks ?? [])
      .filter((block): block is Extract<NonNullable<GuideArticle["sections"][number]["blocks"]>[number], { kind: "table" }> => block.kind === "table" && block.head[2] === "흔히 잘못 기억하는 것");
    const named = tables.flatMap((table) => table.rows.map((row) => row[0]));
    const courts = CARDS.filter((card) => card.arcana === "minor" && Number(card.id.slice(-2)) > 10).map((card) => card.names.ko);
    expect(courts).toHaveLength(16);
    expect([...named].sort()).toEqual([...courts].sort());
    for (const row of tables.flatMap((table) => table.rows)) expect(row.every((cell) => cell.trim().length >= 2), row.join(" / ")).toBe(true);
  });
});

/**
 * The AdSense audit of 2026-10-27: two articles were manuals for the app's own features (지금의 한 장 사용법, 별자리 인연의
 * 인연 점수), which made the root domain read as the app's help pages. Their how-to now sits on the app's /help, and
 * their old addresses redirect there (lib/hostRoutes.ts GUIDE_MOVED_TO_HELP).
 */
describe("the app's manuals left the guide for /help (AdSense audit 2026-10-27)", () => {
  const MOVED = Object.keys(GUIDE_MOVED_TO_HELP).map((path) => path.replace("/guide/", ""));

  it("are no articles: not in the library, the tab counts, the sitemap, llms-full or the feed", () => {
    expect(MOVED).toEqual(["now-card-how-to", "bond-score"]);
    for (const slug of MOVED) expect(findArticle(slug), slug).toBeUndefined();
    // 37 and 31 before the move, 36 and 30 after it, then 재회 타로 and 재회운 (2026-10-31): the hubs, the article pages and 가이드 소개 read these counts.
    expect([articlesIn("tarot").length, articlesIn("saju").length]).toEqual([37, 31]);
    for (const text of [sitemapXml("guide"), sitemapXml("app"), llmsFullTxt(), guideRss()]) {
      for (const slug of MOVED) expect(text).not.toContain(`/guide/${slug}`);
    }
  });

  it("are pointed at by no article: related lists, links in the text, and the 요약 and date tables", () => {
    for (const article of GUIDE_ARTICLES) {
      for (const slug of MOVED) {
        expect(article.related ?? [], article.slug).not.toContain(slug);
        expect(JSON.stringify(article.sections), article.slug).not.toContain(`/guide/${slug}`);
      }
    }
    for (const table of [GUIDE_SUMMARIES, GUIDE_DATES]) for (const slug of MOVED) expect(Object.keys(table)).not.toContain(slug);
  });
});
