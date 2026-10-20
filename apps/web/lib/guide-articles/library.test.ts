import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CARDS, getCard } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { aiTells } from "../ai/style";
import { SITE, won } from "../config";
import { GUIDE_ARTICLES, GUIDE_CATEGORIES, findArticle, guideSectionText, type GuideArticle } from "../guide";
import { guideFaqJsonLd, guideQuestions, isQuestion } from "../jsonld";
import { GUIDE_DATES, GUIDE_HOWTO, GUIDE_SUMMARIES } from "./answers";
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
 * A card article's five headings (SEO-05, ADS-04): the two meaning sections ask their question with the card's
 * name; the picture, 연애·일·돈 and look-alike sections name the card in words of their own (the look-alike one
 * also names the first card of its row), so each heading stands alone for an answer engine and none is shared
 * between cards. Only the two meaning headings are questions, so the FAQPage stays those two.
 */
const SHARED_CARD_HEADINGS = ["그림 속 장면", "연애·일·돈 질문에서", "비슷한 카드와 헷갈릴 때"];
function expectCardHeadings(article: GuideArticle, name: string) {
  const headings = article.sections.map((section) => section.heading);
  expect(headings).toHaveLength(5);
  expect(headings.slice(1, 3)).toEqual([`${name} 카드 정방향은 어떤 뜻인가요`, `${name} 카드 역방향은 어떤 뜻인가요`]);
  for (const heading of headings) {
    expect(heading).toContain(`${name} 카드`);
    expect(SHARED_CARD_HEADINGS).not.toContain(heading);
  }
  const [picture, , , topics, lookAlike] = headings as [string, string, string, string, string];
  expect(picture).toContain("그림");
  expect(topics).toContain("연애·일·돈");
  for (const heading of [picture, topics, lookAlike]) expect(isQuestion(heading), heading).toBe(false);
  const row = article.sections[4]?.blocks?.find((block) => block.kind === "cardRow");
  const firstLookAlike = row?.kind === "cardRow" ? row.cards[1] : undefined;
  expect(firstLookAlike, article.slug).toBeDefined();
  expect(lookAlike).toContain(getCard(firstLookAlike ?? "").names.ko);
}

/** Owner rules: no vendor or model names, no "베타", no promised outcomes (KB 글쓰기 규칙 too). */
const BANNED = [
  "베타", "Claude", "클로드", "GPT", "Gemini", "제미나이", "OpenAI", "Anthropic", "앤트로픽",
  "보장", "확률", "반드시", "무조건", "합격", "재회", "100%", "틀림없이", "우주가", "에너지가 흐르", "때가 되면", "절대로",
];

const CELTIC_SLUG = "celtic-cross-spread";
/** An opening date or month next to a launch verb ("11월 중순 오픈", "2027년 1월에 열려요"). */
const OPENING_DATE = /오픈 예정|출시 예정|출시일|(\d+월|\d{4}년)[^.]{0,12}(오픈|출시|열려요|열릴|열어요|선보)/;

describe("guide library", () => {
  it("adds at least 62 articles on top of the six, every major arcana card has exactly one article", () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(62);
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

  it("gives every library article a substantial body (card articles 1,500-2,300 characters)", () => {
    for (const article of LIBRARY) {
      const length = bodyLength(article);
      if (article.cardId) {
        expect(length, article.slug).toBeGreaterThanOrEqual(1500);
        expect(length, article.slug).toBeLessThanOrEqual(2300);
      } else {
        expect(length, article.slug).toBeGreaterThanOrEqual(1500);
        expect(length, article.slug).toBeLessThanOrEqual(3200);
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
    // The two meaning questions are what the FAQPage JSON-LD (jsonld.ts isQuestion) is built from.
    expect(guideQuestions(article).map((entry) => entry.q)).toEqual([`${card.names.ko} 카드 정방향은 어떤 뜻인가요?`, `${card.names.ko} 카드 역방향은 어떤 뜻인가요?`]);
    expect(guideFaqJsonLd(article)).not.toBeNull();
    // The KB's known misdescriptions of this scan (R3) must not appear anywhere in the article.
    const text = allText(article);
    for (const mis of card.imagery.commonMisdescriptions) expect(text, mis.wrong).not.toMatch(new RegExp(mis.regex));
  });

  // 은둔자 and 별 live in lib/guide.ts with their own question headings; their pictures follow the same KB rules.
  const BASE_CARDS = GUIDE_ARTICLES.filter((article) => article.cardId && !MAJOR_ARCANA_ARTICLES.some((library) => library.slug === article.slug));
  it("finds the two card articles of lib/guide.ts", () => expect(BASE_CARDS.map((article) => article.slug)).toEqual(["the-hermit", "the-star"]));
  it("gives the 22 card articles 110 headings with none shared between cards", () => {
    const headings = GUIDE_ARTICLES.filter((article) => article.cardId).flatMap((article) => article.sections.map((section) => section.heading));
    expect(headings).toHaveLength(22 * 5);
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

  it("the Celtic Cross article explains the 10 positions and names 켈틱 크로스 10장 with its SITE price, never 준비 중", () => {
    const article = findArticle(CELTIC_SLUG);
    expect(article?.category).toBe("tarot");
    const text = allText(article as GuideArticle);
    expect(text).toContain("켈틱 크로스");
    expect(text).toContain(premium("tarot-deep").name);
    expect(text).toContain(won(premium("tarot-deep").krw));
    expect(text).not.toContain("심층 타로");
    expect(text).not.toMatch(/준비 중|준비하고/);
    for (let n = 1; n <= 10; n++) expect(text, `${n}번 자리`).toContain(`${n}번`);
    expect(text).not.toMatch(OPENING_DATE);
  });

  it.each([
    ["saju-compatibility", "match"],
    ["new-year-fortune", "newyear-2027"],
  ])("%s introduces %s by its SITE name and price, never 준비 중, with no date", (slug, id) => {
    const text = allText(findArticle(slug) as GuideArticle);
    expect(text).toContain(premium(id).name);
    expect(text).toContain(won(premium(id).krw));
    expect(text).not.toMatch(/준비 중|준비하고/);
    expect(text).not.toMatch(OPENING_DATE);
  });

  it("no other article promises an opening date", () => {
    for (const article of GUIDE_ARTICLES) expect(allText(article), article.slug).not.toMatch(OPENING_DATE);
  });
});

describe("answer-first fields (요약, HowTo, dates)", () => {
  const slugs = GUIDE_ARTICLES.map((article) => article.slug);
  const sentences = (text: string) => text.split(/(?<=[.?!])\s+/).filter(Boolean);

  it("keeps answers.ts keyed by real slugs only", () => {
    for (const map of [GUIDE_SUMMARIES, GUIDE_DATES, GUIDE_HOWTO]) for (const slug of Object.keys(map)) expect(slugs, slug).toContain(slug);
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

  it("gives the step-by-step articles HowTo steps quoted from their own body", () => {
    for (const slug of ["now-card-how-to", "how-to-read-tarot", "one-card-yes-no", "three-card-spread", "manseryeok"]) {
      expect(findArticle(slug)?.howTo, slug).toBeDefined();
    }
    for (const article of GUIDE_ARTICLES) {
      if (!article.howTo) continue;
      expect(article.howTo.steps.length, article.slug).toBeGreaterThanOrEqual(3);
      for (const step of article.howTo.steps) expect(bodyText(article), `${article.slug}: ${step.name}`).toContain(step.text);
    }
  });
});
