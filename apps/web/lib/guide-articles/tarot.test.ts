import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CARDS, getCard } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { aiTells } from "../ai/style";
import { GUIDE_ARTICLES, findArticle, guideSectionText, type GuideArticle, type GuideBlock, type GuideSection } from "../guide";
import { guideQuestions } from "../jsonld";

/**
 * The 22 major arcana articles after the AdSense rewrite of 2026-10-22 ("가치가 별로 없는 콘텐츠"; Google's scaled content
 * and helpful content guidance). Each card page carries what only Starlog can show: its own deck's picture of the card,
 * described from the KB (content/kb/cards imagery.decks.starlog); three worked examples picked for that card; its own
 * 자주 묻는 질문; and links on to the cards it is read with. No page may read as another with the name swapped: once
 * the card names and numbers are taken out, no sentence repeats on another card, nor nearly repeats.
 */

const CARD_ARTICLES = GUIDE_ARTICLES.filter((article) => article.cardId);
const nameOf = (article: GuideArticle) => getCard(article.cardId ?? "").names.ko;

interface StarlogDeck {
  facts: { id: string; ko: string }[];
  commonMisdescriptions: { wrong: string; regex: string }[];
}
const kbPath = (cardId: string) => fileURLToPath(new URL(`../../../../content/kb/cards/${cardId}.json`, import.meta.url));
const starlogDeck = (cardId: string): StarlogDeck =>
  (JSON.parse(readFileSync(kbPath(cardId), "utf8")) as { imagery: { decks: { starlog: StarlogDeck } } }).imagery.decks.starlog;

const isStarlogFigure = (article: GuideArticle) => (block: GuideBlock) => block.kind === "figure" && block.src === `/cards/starlog/${article.cardId}.webp`;
const starlogSection = (article: GuideArticle) => article.sections.find((section) => section.blocks?.some(isStarlogFigure(article)));
type Steps = Extract<GuideBlock, { kind: "steps" }>;
const stepsIn = (section: GuideSection | undefined): Steps[] => (section?.blocks ?? []).filter((block): block is Steps => block.kind === "steps");
const EXAMPLE = "예시 · ";
const examplesOf = (article: GuideArticle) =>
  article.sections.flatMap((section) => stepsIn(section)).filter((block) => block.items.every((item) => item.title.startsWith(EXAMPLE)));
const faqSection = (article: GuideArticle) => article.sections.find((section) => section.heading === `${nameOf(article)} 카드 자주 묻는 질문`);
const lookAlikeSection = (article: GuideArticle) => article.sections.find((section) => section.blocks?.some((block) => block.kind === "cardRow"));

const sentences = (text: string) =>
  text
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.?!])\s+/))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
const firstSentence = (text: string) => sentences(text)[0] ?? "";

/** The new parts of a card page: the Starlog scene, the worked examples and the 자주 묻는 질문. */
const newText = (article: GuideArticle) =>
  [
    guideSectionText(starlogSection(article) ?? { heading: "", body: "" }),
    ...examplesOf(article).flatMap((block) => block.items.map((item) => `${item.title}: ${item.text}`)),
    guideSectionText(faqSection(article) ?? { heading: "", body: "" }),
  ].join("\n");

/** Every card name (the 78, longest first) and every number taken out, then spaces and punctuation: the sentence's frame. */
const NAMES = [...new Set(CARDS.map((card) => card.names.ko))].sort((a, b) => b.length - a.length);
function frame(sentence: string): string {
  let text = sentence;
  for (const name of NAMES) text = text.split(name).join("");
  return text.replace(/\d+번?|\b[IVXL]+\b/g, "").replace(/[^가-힣a-zA-Z]/g, "");
}
/** Character-pair counts of a frame, for the Dice score: 2 × shared pairs / all pairs. */
function bigrams(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < text.length - 1; i++) counts.set(text.slice(i, i + 2), (counts.get(text.slice(i, i + 2)) ?? 0) + 1);
  return counts;
}
function dice(x: Map<string, number>, y: Map<string, number>, pairs: number): number {
  let shared = 0;
  for (const [gram, count] of x) shared += Math.min(count, y.get(gram) ?? 0);
  return (2 * shared) / Math.max(1, pairs);
}

/** Everything a card page says in sentences: 요약, 한눈에 보기 and every section (body, blocks, captions). */
const pageSentences = (article: GuideArticle) =>
  sentences([article.summary ?? "", ...(article.keyPoints ?? []), ...article.sections.map(guideSectionText)].join("\n"));

describe("the 22 major arcana pages: what only Starlog has", () => {
  it("covers the 22 cards", () => expect(CARD_ARTICLES).toHaveLength(22));

  it.each(CARD_ARTICLES.map((article) => [article.slug, article] as const))("%s: a Starlog deck scene grounded in the KB, with the card's own picture", (_slug, article) => {
    const section = starlogSection(article);
    expect(section, "a section showing /cards/starlog/<id>.webp").toBeDefined();
    const name = nameOf(article);
    expect(section?.heading).toContain(`${name} 카드`);
    expect(section?.heading).toContain("스타로그");
    const figure = section?.blocks?.find(isStarlogFigure(article));
    expect(figure?.kind === "figure" && [figure.width, figure.height]).toEqual([600, 1040]);
    const alt = figure?.kind === "figure" ? figure.alt : "";
    const text = [section?.heading ?? "", guideSectionText(section ?? { heading: "", body: "" }), alt].join("\n");
    expect(text.length).toBeGreaterThanOrEqual(300);
    // The deck's own known misdescriptions (a cat, not a young man; a rabbit, not a dog...) never appear.
    const deck = starlogDeck(article.cardId ?? "");
    for (const mis of deck.commonMisdescriptions) expect(text, mis.wrong).not.toMatch(new RegExp(mis.regex));
    // Its characters are the ones the KB draws: the cat and the rabbit where the card has them.
    const facts = deck.facts.map((fact) => fact.ko).join(" ");
    for (const animal of ["고양이", "토끼"]) if (facts.includes(animal)) expect(text, animal).toContain(animal);
    // It says how the scene differs from the 1909 picture the rest of the page describes.
    expect(text).toContain("1909");
  });

  it.each(CARD_ARTICLES.map((article) => [article.slug, article] as const))("%s: three worked examples, labelled 예시, each a question and a 2-3 sentence answer", (_slug, article) => {
    const blocks = examplesOf(article);
    expect(blocks).toHaveLength(1);
    const items = blocks[0]?.items ?? [];
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.title, item.title).toMatch(/^예시 · .+\?$/);
      expect(sentences(item.text).length, item.text).toBeGreaterThanOrEqual(2);
      expect(sentences(item.text).length, item.text).toBeLessThanOrEqual(3);
    }
  });

  it("never asks the same example question on two cards, even with the names taken out", () => {
    const titles = CARD_ARTICLES.flatMap((article) => (examplesOf(article)[0]?.items ?? []).map((item) => frame(item.title)));
    expect(titles).toHaveLength(66);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it.each(CARD_ARTICLES.map((article) => [article.slug, article] as const))("%s: the reversed card in one line, in the keyword table", (_slug, article) => {
    const table = article.sections.flatMap((section) => section.blocks ?? []).find((block) => block.kind === "table" && block.caption === `${nameOf(article)} 카드의 키워드`);
    const row = table?.kind === "table" ? table.rows.find((cells) => cells[0] === "한 줄로") : undefined;
    expect(table?.kind === "table" && table.head[2]).toBe("역방향");
    expect((row?.[2] ?? "").length).toBeGreaterThan(10);
  });

  it.each(CARD_ARTICLES.map((article) => [article.slug, article] as const))("%s: 자주 묻는 질문 last, 2-3 questions of its own, each answered first in one short sentence", (_slug, article) => {
    const section = faqSection(article);
    expect(section, `${nameOf(article)} 카드 자주 묻는 질문`).toBeDefined();
    expect(article.sections.at(-1)).toBe(section);
    const items = stepsIn(section).flatMap((block) => block.items);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(3);
    for (const item of items) {
      expect(item.title, item.title).toMatch(/\?$/);
      // Not the two meaning questions the page already answers under its own headings.
      expect(item.title).not.toMatch(/(정|역)방향은 어떤 뜻/);
      expect(firstSentence(item.text).length, item.text).toBeLessThanOrEqual(120);
      expect(sentences(item.text).length, item.text).toBeGreaterThanOrEqual(2);
    }
    // The FAQPage answers (정방향, 역방향) open with their answer too.
    for (const { a } of guideQuestions(article)) expect(firstSentence(a).length, a).toBeLessThanOrEqual(120);
  });

  it("never asks the same 자주 묻는 질문 on two cards, even with the names taken out", () => {
    const questions = CARD_ARTICLES.flatMap((article) => stepsIn(faqSection(article)).flatMap((block) => block.items.map((item) => frame(item.title))));
    expect(new Set(questions).size).toBe(questions.length);
  });

  it.each(CARD_ARTICLES.map((article) => [article.slug, article] as const))("%s: links on to 2 or more major cards it says why to read with, and to a guide beyond the cards", (_slug, article) => {
    const related = (article.related ?? []).map((slug) => findArticle(slug));
    for (const [i, other] of related.entries()) expect(other, article.related?.[i]).toBeDefined();
    const cards = related.filter((other) => other?.cardId);
    expect(cards.length).toBeGreaterThanOrEqual(2);
    // The look-alike section (함께 읽는 카드) names at least two of them; every linked card is named somewhere on the page.
    const lookAlike = guideSectionText(lookAlikeSection(article) ?? { heading: "", body: "" });
    expect(cards.filter((other) => lookAlike.includes(nameOf(other as GuideArticle))).length).toBeGreaterThanOrEqual(2);
    const page = article.sections.map(guideSectionText).join("\n");
    for (const other of cards) expect(page, other?.slug).toContain(nameOf(other as GuideArticle));
    expect(related.some((other) => other && !other.cardId), "a guide that is not a card article").toBe(true);
  });

  it.each(CARD_ARTICLES.map((article) => [article.slug, article] as const))("%s: the 요약 answers what the card means in its first sentence", (_slug, article) => {
    const first = firstSentence(article.summary ?? "");
    expect(first).toContain(nameOf(article));
    expect(first).toMatch(/정방향|뜻/);
  });

  it.each(CARD_ARTICLES.map((article) => [article.slug, article] as const))("%s: no AI tells in the new parts, and the page dated 2026-10-22", (_slug, article) => {
    const hits = aiTells(newText(article));
    expect(hits.map((hit) => `${hit.id} ${hit.label}`)).toEqual([]);
    expect(article.updated).toBe("2026-10-22");
  });
});

describe("no card page is another card page with the name swapped", () => {
  const all = CARD_ARTICLES.flatMap((article) => pageSentences(article).map((sentence) => ({ slug: article.slug, sentence, frame: frame(sentence) })));
  const shown = (a: (typeof all)[number], b: (typeof all)[number]) => `${a.slug}: ${a.sentence}\n${b.slug}: ${b.sentence}`;

  it("opens the new sections (Starlog scene, 자주 묻는 질문) in their own words: no opening shared by three cards", () => {
    for (const pick of [starlogSection, faqSection]) {
      const openings = new Map<string, string[]>();
      for (const article of CARD_ARTICLES) {
        const opening = frame(firstSentence(pick(article)?.body ?? "")).slice(0, 12);
        openings.set(opening, [...(openings.get(opening) ?? []), article.slug]);
      }
      expect([...openings.entries()].filter(([, slugs]) => slugs.length > 2)).toEqual([]);
    }
  });

  it("has no sentence that another card repeats once the card names and numbers are taken out", () => {
    const byFrame = new Map<string, (typeof all)[number][]>();
    for (const entry of all.filter((e) => e.frame.length >= 8)) byFrame.set(entry.frame, [...(byFrame.get(entry.frame) ?? []), entry]);
    const repeats = [...byFrame.values()].flatMap((entries) => entries.filter((e) => e.slug !== entries[0]!.slug).map((e) => shown(entries[0]!, e)));
    expect(repeats).toEqual([]);
  });

  it("has no sentence that another card nearly repeats (same frame, a word or two changed: Dice 0.8 or more)", () => {
    const THRESHOLD = 0.8;
    // Shortest first: a pair whose lengths alone keep the score under the threshold ends the inner loop.
    const long = all
      .filter((entry) => entry.frame.length >= 14)
      .map((entry) => ({ ...entry, grams: bigrams(entry.frame), pairs: entry.frame.length - 1 }))
      .sort((a, b) => a.pairs - b.pairs);
    const found: string[] = [];
    for (let i = 0; i < long.length; i++) {
      const a = long[i]!;
      for (let j = i + 1; j < long.length; j++) {
        const b = long[j]!;
        if ((2 * a.pairs) / (a.pairs + b.pairs) < THRESHOLD) break;
        if (a.slug !== b.slug && dice(a.grams, b.grams, a.pairs + b.pairs) >= THRESHOLD) found.push(shown(a, b));
      }
    }
    expect(found).toEqual([]);
  });
});
