import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CARDS, getCard } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { aiTells } from "../ai/style";
import { GUIDE_ARTICLES, findArticle, guideSectionText, type GuideArticle, type GuideBlock, type GuideSection } from "../guide";
import { guidePlainText } from "../guideLinks";
import { guideQuestions, isQuestion } from "../jsonld";

/**
 * The 22 major arcana pages after the editorial rework of 2026-10-23 (AdSense "가치가 별로 없는 콘텐츠"; Google's scaled
 * content guidance). An independent review found that the sentences were varied but every card wore one skeleton: the
 * same seven headings (그림, 정방향은 어떤 뜻인가요, 역방향은 어떤 뜻인가요, 연애·일·돈, 스타로그 덱, 견주기, 자주 묻는 질문), the
 * same 한 줄로/핵심 낱말 table, exactly three 예시 per card, one description frame and a long mascot section on all 22.
 * Now each card has a shape chosen for what people ask about it (죽음·탑·악마 open with the fear, 연인 with the choice,
 * 수레바퀴 with timing, 정의 with contracts and disputes…). These tests keep that variety measurable: no heading frame on
 * more than three cards, varied section counts, tables and examples only where they help, a FAQPage made of the
 * questions the page really asks, the Starlog deck in a sentence or two next to its picture, and no sentence that
 * another card repeats once the card names are taken out.
 */

const CARD_ARTICLES = GUIDE_ARTICLES.filter((article) => article.cardId);
const nameOf = (article: GuideArticle) => getCard(article.cardId ?? "").names.ko;
const bodyOf = (article: GuideArticle) => article.sections.map(guideSectionText).join("\n");
const blocksOf = (article: GuideArticle) => article.sections.flatMap((section) => section.blocks ?? []);

interface StarlogDeck {
  facts: { id: string; ko: string }[];
  commonMisdescriptions: { wrong: string; regex: string }[];
}
const kbPath = (cardId: string) => fileURLToPath(new URL(`../../../../content/kb/cards/${cardId}.json`, import.meta.url));
const starlogDeck = (cardId: string): StarlogDeck =>
  (JSON.parse(readFileSync(kbPath(cardId), "utf8")) as { imagery: { decks: { starlog: StarlogDeck } } }).imagery.decks.starlog;

type Steps = Extract<GuideBlock, { kind: "steps" }>;
type Table = Extract<GuideBlock, { kind: "table" }>;
const stepsIn = (section: GuideSection | undefined): Steps[] => (section?.blocks ?? []).filter((block): block is Steps => block.kind === "steps");
const EXAMPLE = "예시 · ";
const examplesOf = (article: GuideArticle) => article.sections.flatMap((section) => stepsIn(section)).flatMap((block) => block.items.filter((item) => item.title.startsWith(EXAMPLE)));
const tablesOf = (article: GuideArticle) => blocksOf(article).filter((block): block is Table => block.kind === "table");

/** The Starlog deck's picture of the card and the sentence or two right after it. */
function starlogNote(article: GuideArticle): { alt: string; note: string } | undefined {
  for (const section of article.sections) {
    const blocks = section.blocks ?? [];
    const i = blocks.findIndex((block) => block.kind === "figure" && block.src === `/cards/starlog/${article.cardId}.webp`);
    if (i < 0) continue;
    const figure = blocks[i];
    const next = blocks[i + 1];
    return { alt: figure?.kind === "figure" ? figure.alt : "", note: next?.kind === "p" ? next.text : "" };
  }
  return undefined;
}

const sentences = (text: string) =>
  text
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.?!])\s+/))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
const firstSentence = (text: string) => sentences(text)[0] ?? "";
const count = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].length;

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
  for (const [gram, n] of x) shared += Math.min(n, y.get(gram) ?? 0);
  return (2 * shared) / Math.max(1, pairs);
}
const similar = (a: string, b: string) => dice(bigrams(a), bigrams(b), a.length + b.length - 2);

/** For each item, the cards whose item is the same frame or a near copy (Dice 0.8+); the groups with more than `limit` cards. */
function crowded(items: { slug: string; text: string }[], limit: number): string[] {
  const framed = items.map((item) => ({ ...item, frame: frame(item.text) }));
  const found = new Set<string>();
  for (const a of framed) {
    const cards = new Set(framed.filter((b) => b.frame === a.frame || (a.frame.length >= 6 && b.frame.length >= 6 && similar(a.frame, b.frame) >= 0.8)).map((b) => b.slug));
    if (cards.size > limit) found.add(`${a.text} (${[...cards].join(", ")})`);
  }
  return [...found];
}

/** Everything a card page says in sentences: 요약, 한눈에 보기 and every section (body, blocks, captions). */
const pageSentences = (article: GuideArticle) =>
  sentences([article.summary ?? "", ...(article.keyPoints ?? []), ...article.sections.map(guideSectionText)].join("\n"));

describe("each card article has a shape of its own", () => {
  const each = CARD_ARTICLES.map((article) => [article.slug, article] as const);

  it("covers the 22 cards", () => expect(CARD_ARTICLES).toHaveLength(22));

  it("shares no heading frame, nor a near copy of one, across more than three cards (names and numbers taken out)", () => {
    const headings = CARD_ARTICLES.flatMap((article) => article.sections.map((section) => ({ slug: article.slug, text: section.heading })));
    expect(crowded(headings, 3)).toEqual([]);
  });

  it("varies the section count: 4-7 on each card, at least three different counts, no count on more than half the cards", () => {
    const counts = CARD_ARTICLES.map((article) => article.sections.length);
    for (const n of counts) expect(n).toBeGreaterThanOrEqual(4);
    for (const n of counts) expect(n).toBeLessThanOrEqual(7);
    expect(new Set(counts).size).toBeGreaterThanOrEqual(3);
    for (const n of new Set(counts)) expect(counts.filter((c) => c === n).length, `${n} sections`).toBeLessThanOrEqual(11);
  });

  it("drops the uniform 한 줄로/핵심 낱말 table; tables only where they help, and no table head on more than two cards", () => {
    for (const article of CARD_ARTICLES) {
      for (const table of tablesOf(article)) expect(table.rows.map((row) => row[0]), `${article.slug}: ${table.caption}`).not.toContain("한 줄로");
    }
    const withTable = CARD_ARTICLES.filter((article) => tablesOf(article).length > 0);
    expect(withTable.length).toBeGreaterThan(0);
    expect(withTable.length).toBeLessThan(CARD_ARTICLES.length);
    const heads = CARD_ARTICLES.flatMap((article) => tablesOf(article).map((table) => ({ slug: article.slug, text: table.head.join(" ") })));
    expect(crowded(heads, 2)).toEqual([]);
  });

  it("varies the worked examples: 0-4 per card, at least three different counts, some cards with none", () => {
    const counts = CARD_ARTICLES.map((article) => examplesOf(article).length);
    for (const n of counts) expect(n).toBeLessThanOrEqual(4);
    expect(new Set(counts).size).toBeGreaterThanOrEqual(3);
    expect(counts.filter((n) => n === 0).length).toBeGreaterThan(0);
  });

  it.each(each)("%s: each worked example asks a question and answers it in 1-3 sentences", (_slug, article) => {
    for (const item of examplesOf(article)) {
      expect(item.title, item.title).toMatch(/^예시 · .+\?$/);
      expect(sentences(item.text).length, item.text).toBeGreaterThanOrEqual(1);
      expect(sentences(item.text).length, item.text).toBeLessThanOrEqual(3);
    }
  });

  it("never asks the same example question on two cards, even with the names taken out", () => {
    const titles = CARD_ARTICLES.flatMap((article) => examplesOf(article).map((item) => frame(item.title)));
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("keeps the stock closers rare: 적어 보 once a card at most and 8 in all, 어느 쪽이든 twice in all, 단정하지 않아요 twice in all", () => {
    const bodies = CARD_ARTICLES.map((article) => ({ slug: article.slug, text: bodyOf(article) }));
    for (const { slug, text } of bodies) expect(count(text, /적어 보/g), slug).toBeLessThanOrEqual(1);
    expect(bodies.reduce((sum, { text }) => sum + count(text, /적어 보/g), 0)).toBeLessThanOrEqual(8);
    expect(bodies.reduce((sum, { text }) => sum + count(text, /어느 쪽이든/g), 0)).toBeLessThanOrEqual(2);
    expect(bodies.reduce((sum, { text }) => sum + count(text, /단정하지(는)? 않/g), 0)).toBeLessThanOrEqual(2);
  });

  it("gives every card a description of its own: the card name and 타로, no shared or near-copied frame, not the old one", () => {
    for (const article of CARD_ARTICLES) {
      expect(article.description, article.slug).toContain(nameOf(article));
      expect(article.description, article.slug).toContain("타로");
      expect(article.description, article.slug).not.toMatch(/정방향·역방향 뜻과 연애·일·돈/);
    }
    expect(crowded(CARD_ARTICLES.map((article) => ({ slug: article.slug, text: article.description })), 1)).toEqual([]);
  });

  it.each(each)("%s: reads the card both ways up somewhere on the page", (_slug, article) => {
    expect(bodyOf(article)).toMatch(/역방향|거꾸로/);
  });

  it.each(each)("%s: a FAQPage of 2-4 questions the page asks in its own headings, each answered in its first sentence", (_slug, article) => {
    const questions = guideQuestions(article);
    expect(questions.length).toBeGreaterThanOrEqual(2);
    expect(questions.length).toBeLessThanOrEqual(4);
    const asked = article.sections.filter((section) => isQuestion(section.heading)).map((section) => section.heading.replace(/\?$/, ""));
    for (const { q, a } of questions) {
      expect(q, q).toMatch(/\?$/);
      expect(asked, q).toContain(q.replace(/\?$/, ""));
      // Not the two stock meaning questions every card used to ask.
      expect(q).not.toMatch(/(정|역)방향은 어떤 뜻인가요/);
      expect(firstSentence(a).length, a).toBeLessThanOrEqual(120);
    }
    // A 자주 묻는 질문 section, if a card has one, opens with more than a one-line restatement of the card.
    for (const section of article.sections.filter((s) => s.heading.includes("자주 묻는 질문"))) expect(sentences(section.body).length, section.body).toBeGreaterThanOrEqual(2);
  });

  it("never asks the same FAQ question on two cards, even with the names taken out", () => {
    const questions = CARD_ARTICLES.flatMap((article) => guideQuestions(article).map(({ q }) => frame(q)));
    expect(new Set(questions).size).toBe(questions.length);
  });

  it("links to the birth-card calculator from one card at most, instead of a 탄생 카드 FAQ on every card", () => {
    const linking = CARD_ARTICLES.filter((article) => article.sections.some((section) => JSON.stringify(section).includes("/birth-card")));
    expect(linking.length).toBeLessThanOrEqual(1);
  });

  it.each(each)("%s: the Starlog deck's picture with a sentence or two on what it draws differently, grounded in the deck KB", (_slug, article) => {
    const starlog = starlogNote(article);
    expect(starlog, "a figure of /cards/starlog/<id>.webp").toBeDefined();
    const { alt = "", note = "" } = starlog ?? {};
    expect(sentences(note).length, note).toBeGreaterThanOrEqual(1);
    expect(sentences(note).length, note).toBeLessThanOrEqual(2);
    expect(note).toContain("스타로그");
    // The deck's own known misdescriptions (a cat, not a young man; a rabbit, not a dog...) never appear.
    for (const mis of starlogDeck(article.cardId ?? "").commonMisdescriptions) expect(`${alt}\n${note}`, mis.wrong).not.toMatch(new RegExp(mis.regex));
    // No section of its own for the deck any more.
    for (const section of article.sections) expect(section.heading).not.toContain("스타로그");
  });

  it.each(each)("%s: links on to 2 or more major cards it names, and to a guide beyond the cards", (_slug, article) => {
    const related = (article.related ?? []).map((slug) => findArticle(slug));
    for (const [i, other] of related.entries()) expect(other, article.related?.[i]).toBeDefined();
    const cards = related.filter((other) => other?.cardId);
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const page = bodyOf(article);
    for (const other of cards) expect(page, other?.slug).toContain(nameOf(other as GuideArticle));
    expect(related.some((other) => other && !other.cardId), "a guide that is not a card article").toBe(true);
  });

  it.each(each)("%s: the 요약 answers what the card means in its first sentence", (_slug, article) => {
    const first = firstSentence(article.summary ?? "");
    expect(first).toContain(nameOf(article));
    expect(first).toMatch(/정방향|뜻/);
  });

  it.each(each)("%s: no AI tells in the body, and the page dated 2026-10-27 (third review)", (_slug, article) => {
    expect(aiTells(bodyOf(article)).map((hit) => `${hit.id} ${hit.label}`)).toEqual([]);
    expect(article.updated).toBe("2026-10-27");
  });
});

describe("no card page is another card page with the name swapped", () => {
  const all = CARD_ARTICLES.flatMap((article) => pageSentences(article).map((sentence) => ({ slug: article.slug, sentence, frame: frame(sentence) })));
  const shown = (a: (typeof all)[number], b: (typeof all)[number]) => `${a.slug}: ${a.sentence}\n${b.slug}: ${b.sentence}`;

  /** A sentence as words, every card name masked as X (with the particle after it) and the card numbers gone. */
  const maskedWords = (sentence: string) => {
    let text = guidePlainText(sentence);
    for (const name of NAMES) text = text.split(name).join("X");
    return text.replace(/\d+번?(\([IVXL]+\))?/g, "").replace(/X[가-힣]*/g, "X").replace(/\s+/g, " ").trim().split(" ");
  };

  it("opens every section in its own words: no first sentence starts or ends with the same two words on three cards", () => {
    const openings = new Map<string, Set<string>>();
    const endings = new Map<string, Set<string>>();
    for (const article of CARD_ARTICLES) {
      for (const section of article.sections) {
        const words = maskedWords(firstSentence(section.body));
        for (const [map, key] of [[openings, words.slice(0, 2).join(" ")], [endings, words.slice(-2).join(" ")]] as const) {
          map.set(key, new Set([...(map.get(key) ?? []), article.slug]));
        }
      }
    }
    const shared = (map: Map<string, Set<string>>) => [...map].filter(([, slugs]) => slugs.size > 2).map(([key, slugs]) => `${key}: ${[...slugs].join(", ")}`);
    expect(shared(openings)).toEqual([]);
    expect(shared(endings)).toEqual([]);
  });

  it("opens the Starlog notes in their own words: no opening shared by three cards", () => {
    const openings = new Map<string, string[]>();
    for (const article of CARD_ARTICLES) {
      const opening = frame(firstSentence(starlogNote(article)?.note ?? "")).slice(0, 12);
      openings.set(opening, [...(openings.get(opening) ?? []), article.slug]);
    }
    expect([...openings.entries()].filter(([, slugs]) => slugs.length > 2)).toEqual([]);
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

/**
 * The second independent read of 2026-10-23: accurate, but the cards still read as mass-produced. Bodies were ~1,600
 * characters of KB paraphrase; 21 of 22 summaries opened "X는 메이저 아르카나 N번 카드로, 정방향에서는…", 22 of 22 titles were
 * "타로 X 카드 뜻" and 22 descriptions said "타로 N번 X 카드"; keyPoints ran "~카드예요 / 정방향은… / 역방향은…"; 17 cards closed on a
 * "X 카드와 Y·Z 카드" section ending in a card row of "N번 Y와 함께 나오면…"; "읽어요" came 124 times. Each card now carries
 * substance of its own (Waite's own words, the older decks, a worked three-card reading, its look-alikes), so these checks
 * keep that measurable.
 */
describe("each card article carries substance of its own (second review, 2026-10-23)", () => {
  const each = CARD_ARTICLES.map((article) => [article.slug, article] as const);
  const noSpace = (text: string) => text.replace(/\s/g, "").length;
  const MAJOR_NAMES = CARDS.filter((card) => card.arcana === "major").map((card) => card.names.ko);
  const raw = (article: GuideArticle) => article.sections.flatMap((section) => [section.body, ...(section.blocks ?? []).map((block) => JSON.stringify(block))]).join("\n");

  /** What a section is, from its heading and blocks: its place in the card's order. */
  function sectionKind(article: GuideArticle, section: GuideSection): string {
    const own = nameOf(article);
    const blocks = section.blocks ?? [];
    if (/역방향|거꾸로/.test(section.heading)) return "R";
    if (MAJOR_NAMES.some((name) => name !== own && !own.includes(name) && section.heading.replace(own, "").includes(name))) return "C";
    if (blocks.some((block) => block.kind === "steps" && block.items.some((item) => item.title.startsWith(EXAMPLE)))) return "E";
    if (blocks.some((block) => block.kind === "figure")) return "F";
    if (blocks.some((block) => block.kind === "table")) return "T";
    if (isQuestion(section.heading)) return "Q";
    return "P";
  }

  // Body text with blocks, no spaces: 1,578 on average before (the review's ~1,785 also counted headings and 한눈에 보기).
  // The third review (2026-10-23) asked for lengths that follow what each card has to say, so the floor is lower.
  it.each(each)("%s: a body of 2,300-5,800 characters (no spaces), real reading rather than a paraphrase of the KB", (_slug, article) => {
    const length = noSpace(bodyOf(article));
    expect(length).toBeGreaterThanOrEqual(2300);
    expect(length).toBeLessThanOrEqual(5800);
  });

  it("gives no two cards the same order of sections", () => {
    const orders = CARD_ARTICLES.map((article) => ({ slug: article.slug, order: article.sections.map((section) => sectionKind(article, section)).join(">") }));
    const shared = orders.filter((a) => orders.some((b) => b.slug !== a.slug && b.order === a.order)).map((a) => `${a.slug}: ${a.order}`);
    expect(shared).toEqual([]);
  });

  it("opens no more than three summaries alike, and none on the old 'X는 메이저 아르카나 N번 카드로' frame", () => {
    const summaries = CARD_ARTICLES.map((article) => ({ slug: article.slug, text: article.summary ?? "" }));
    for (const { slug, text } of summaries) expect(text, slug).not.toMatch(/메이저 아르카나 (의 마지막 )?\d+번 카드로/);
    const openings = new Map<string, string[]>();
    for (const { slug, text } of summaries) {
      const opening = frame(firstSentence(text)).slice(0, 8);
      openings.set(opening, [...(openings.get(opening) ?? []), slug]);
    }
    expect([...openings].filter(([, slugs]) => slugs.length > 3)).toEqual([]);
    expect(crowded(summaries.map(({ slug, text }) => ({ slug, text: firstSentence(text) })), 3)).toEqual([]);
  });

  it("writes 한눈에 보기 in each card's own shape: never the '~카드예요 / 정방향은… / 역방향은…' frame, no point frame on more than three cards", () => {
    for (const article of CARD_ARTICLES) {
      const [, second = "", third = ""] = article.keyPoints ?? [];
      expect(/^정방향/.test(second) && /^역방향/.test(third), article.slug).toBe(false);
    }
    const starts = CARD_ARTICLES.flatMap((article) => article.keyPoints ?? []).filter((point) => /^(정방향|역방향)은/.test(point));
    expect(starts.length).toBeLessThanOrEqual(4);
    expect(crowded(CARD_ARTICLES.flatMap((article) => (article.keyPoints ?? []).map((text) => ({ slug: article.slug, text }))), 3)).toEqual([]);
  });

  it("titles each card for what people ask about it, with '<name> 카드' kept for search and no title frame on more than two cards", () => {
    for (const article of CARD_ARTICLES) {
      // "<name> 카드 뜻": the words people search a card with (SEO audit 2026-10-27 M5); what follows is the card's own.
      expect(article.title, article.slug).toContain(`${nameOf(article)} 카드 뜻`);
      expect(article.title, article.slug).not.toBe(`타로 ${nameOf(article)} 카드 뜻`);
      expect(article.title.length, article.title).toBeLessThanOrEqual(34);
    }
    expect(crowded(CARD_ARTICLES.map((article) => ({ slug: article.slug, text: article.title })), 2)).toEqual([]);
    expect(CARD_ARTICLES.filter((article) => /타로 \d+번/.test(article.description)).length).toBeLessThanOrEqual(3);
  });

  it("drops the closing comparison list: few sections end on a card row, and the 'N번 X와 함께 나오면' lines are rare", () => {
    expect(CARD_ARTICLES.filter((article) => (article.sections.at(-1)?.blocks ?? []).some((block) => block.kind === "cardRow")).length).toBeLessThanOrEqual(3);
    const pairs = CARD_ARTICLES.map((article) => ({ slug: article.slug, n: count(bodyOf(article), /함께 나오면|함께라면/g) }));
    for (const { slug, n } of pairs) expect(n, slug).toBeLessThanOrEqual(2);
    expect(pairs.reduce((sum, { n }) => sum + n, 0)).toBeLessThanOrEqual(12);
  });

  it("varies the first heading: a question on at most nine cards, '~인가요?' on at most four", () => {
    const first = CARD_ARTICLES.map((article) => article.sections[0]?.heading ?? "");
    expect(first.filter((heading) => isQuestion(heading)).length).toBeLessThanOrEqual(9);
    expect(first.filter((heading) => /인가요\?$/.test(heading)).length).toBeLessThanOrEqual(4);
  });

  it("brings the stock endings down to a natural level: 읽어요, 카드예요, 함께라면", () => {
    const pages = CARD_ARTICLES.map((article) => ({ slug: article.slug, text: [article.summary ?? "", ...(article.keyPoints ?? []), bodyOf(article)].join("\n") }));
    for (const { slug, text } of pages) {
      expect(count(text, /읽어요/g), slug).toBeLessThanOrEqual(4);
      expect(count(text, /카드예요/g), slug).toBeLessThanOrEqual(1);
    }
    expect(pages.reduce((sum, { text }) => sum + count(text, /읽어요/g), 0)).toBeLessThanOrEqual(60);
    expect(pages.reduce((sum, { text }) => sum + count(text, /카드예요/g), 0)).toBeLessThanOrEqual(10);
    expect(pages.reduce((sum, { text }) => sum + count(text, /함께라면/g), 0)).toBeLessThanOrEqual(6);
  });

  it("keeps the caution box for the cards that need it (no more than nine)", () => {
    const withCaution = CARD_ARTICLES.filter((article) => blocksOf(article).some((block) => block.kind === "callout" && block.tone === "caution"));
    expect(withCaution.length).toBeLessThanOrEqual(9);
  });

  it.each(each)("%s: 3-5 links in the text to other guide articles that exist, never to itself", (_slug, article) => {
    const slugs = [...raw(article).matchAll(/\]\(\/guide\/([a-z0-9-]+)/g)].map((match) => match[1] as string);
    expect(slugs.length).toBeGreaterThanOrEqual(3);
    expect(slugs.length).toBeLessThanOrEqual(5);
    for (const slug of slugs) {
      expect(findArticle(slug), slug).toBeDefined();
      expect(slug).not.toBe(article.slug);
    }
  });

  it.each(each)("%s: what Waite wrote is attributed to him and his book, and the worked reading says it is made up", (_slug, article) => {
    const text = bodyOf(article);
    expect(text).toMatch(/웨이트/);
    expect(text).toMatch(/그림 열쇠|Pictorial Key/);
    // A worked reading, where a card has one, is an illustration, never a client's story.
    for (const section of article.sections) {
      const said = guideSectionText(section);
      if (/첫 장|첫 자리/.test(said) && /세 장|세 자리/.test(said)) expect(said, section.heading).toMatch(MADE_UP);
    }
  });
});

const MADE_UP = /지어낸|꾸며 낸|꾸민|가상의|가정해/;

/**
 * The third independent read of 2026-10-23: accurate (scans and Waite quotes checked, no errors), but the 22 still read as
 * one batch. Lengths sat within ±3% (4,158-4,428 characters); a made-up three-card reading with one skeleton closed 21 of
 * them (made-up marker, 'A, B, C' 세 자리, a minor card, "세 장이 알려 주지 않아요", a reversed coda); 21 summaries said
 * "거꾸로 나오면 …" in their second sentence; every description began "타로 X 카드를…" or ended "풀어요"; every 한눈에 보기
 * had three points, 13 ending on 거꾸로.
 */
describe("the 22 no longer read as one batch (third review, 2026-10-23)", () => {
  const withSpaces = (article: GuideArticle) => bodyOf(article).length;
  const worked = (article: GuideArticle) => article.sections.filter((section) => {
    const said = guideSectionText(section);
    return MADE_UP.test(said) && /첫 장|첫 자리|가운데/.test(said) && /세 장|세 자리/.test(said);
  });

  it("spreads the lengths: the longest body at least 1.5 times the shortest, and no length within 5% of the mean on more than half", () => {
    const lengths = CARD_ARTICLES.map(withSpaces);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeGreaterThanOrEqual(1.5);
    expect(lengths.filter((n) => Math.abs(n - mean) / mean <= 0.05).length).toBeLessThanOrEqual(11);
  });

  it("keeps a made-up three-card reading on 13 cards at most, and its stock sentences rare", () => {
    expect(CARD_ARTICLES.filter((article) => worked(article).length > 0).length).toBeLessThanOrEqual(13);
    const all = CARD_ARTICLES.map(bodyOf).join("\n");
    expect(count(all, /세 자리에 카드를 놓/g)).toBeLessThanOrEqual(2);
    expect(count(all, /세 장이 (알려|정해) 주지 않아요/g)).toBeLessThanOrEqual(2);
    expect(count(all, /거꾸로 나왔다면[^.]*(풀었을|권했을|옮겼을) 거예요/g)).toBeLessThanOrEqual(3);
    const headings = CARD_ARTICLES.flatMap((article) => article.sections.map((section) => section.heading));
    expect(headings.filter((heading) => /, [^,]*(자리의|자리에 놓인|놓인) [^,]* 카드$/.test(heading)).length).toBeLessThanOrEqual(3);
  });

  it("varies the summaries: a reversal in the second sentence on seven cards at most, '예고로는 쓰지 않' on two", () => {
    const second = CARD_ARTICLES.map((article) => sentences(article.summary ?? "")[1] ?? "");
    expect(second.filter((s) => /거꾸로|역방향/.test(s)).length).toBeLessThanOrEqual(7);
    expect(CARD_ARTICLES.filter((article) => /예고로는 쓰지 않/.test(article.summary ?? "")).length).toBeLessThanOrEqual(2);
  });

  it("varies the descriptions: none opens '타로 X 카드를', three end '풀어요' at most, none opens on a '…까지,' clause", () => {
    for (const article of CARD_ARTICLES) expect(article.description, article.slug).not.toMatch(new RegExp(`^타로 ${nameOf(article)} 카드를`));
    expect(CARD_ARTICLES.filter((article) => /풀어요\.$/.test(article.description)).length).toBeLessThanOrEqual(3);
    expect(CARD_ARTICLES.filter((article) => /^[^.?]{0,50}까지,/.test(article.description)).length).toBe(0);
  });

  it("varies 한눈에 보기: at least three different counts, a reversal as the last point on five cards at most", () => {
    expect(new Set(CARD_ARTICLES.map((article) => article.keyPoints?.length)).size).toBeGreaterThanOrEqual(3);
    expect(CARD_ARTICLES.filter((article) => /거꾸로|역방향/.test(article.keyPoints?.at(-1) ?? "")).length).toBeLessThanOrEqual(5);
  });

  it("keeps the stock frames rare: '세 갈래' on three cards at most, FAQ answers opening 'A가 아니라 B에 가까워요' on 14 at most, '쪽' under 10 a card on average", () => {
    expect(CARD_ARTICLES.filter((article) => /세 갈래/.test(bodyOf(article))).length).toBeLessThanOrEqual(3);
    const firsts = CARD_ARTICLES.flatMap((article) => guideQuestions(article).map(({ a }) => firstSentence(a)));
    expect(firsts.filter((s) => /(아니라|보다|라기보다)[^.]*가까워요\.$/.test(s)).length).toBeLessThanOrEqual(14);
    const sides = CARD_ARTICLES.map((article) => count(bodyOf(article), /쪽/g));
    expect(sides.reduce((a, b) => a + b, 0) / sides.length).toBeLessThan(10);
  });
});
