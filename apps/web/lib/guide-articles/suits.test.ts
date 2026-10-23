import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CARDS } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { findArticle, guideSectionText, type GuideArticle, type GuideBlock } from "../guide";
import { guidePlainText } from "../guideLinks";

/**
 * The four suit articles and the minor arcana overview (2026-10-23, AdSense "가치가 별로 없는 콘텐츠"): each suit is read
 * from its own angle (완드 by its three key cards and a table, 컵 by the cards that open and unsettle a relationship, 검
 * by the frightening-looking cards read as they are, 펜타클 by building, keeping and enjoying), with worked examples of
 * its own; the overview compares the four and links on instead of repeating them. No two of the five share a heading
 * or a sentence frame once suit and card names are masked, and every picture claim avoids the KB's misdescriptions.
 */

const SUITS = { "wands-suit": "wands", "cups-suit": "cups", "swords-suit": "swords", "pentacles-suit": "pentacles" } as const;
const OVERVIEW = "minor-arcana-suits";
const article = (slug: string) => findArticle(slug) as GuideArticle;
const ARTICLES = [...Object.keys(SUITS), OVERVIEW].map(article);
const text = (a: GuideArticle) => a.sections.map(guideSectionText).join("\n");

const NAMES = [...new Set([...CARDS.map((card) => card.names.ko), "완드", "컵", "검", "펜타클", "소드"])].sort((a, b) => b.length - a.length);
const masked = (sentence: string) => {
  let t = guidePlainText(sentence);
  for (const name of NAMES) t = t.split(name).join("X");
  return t.replace(/\d+/g, "").replace(/X[가-힣]*/g, "X");
};
const frame = (sentence: string) => masked(sentence).replace(/[^가-힣a-zA-Z]/g, "");
const sentences = (t: string) => t.split("\n").flatMap((line) => line.split(/(?<=[.?!])\s+/)).map((s) => s.trim()).filter(Boolean);
function dice(a: string, b: string): number {
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const [x, y] = [grams(a), grams(b)];
  let shared = 0;
  for (const [g, c] of x) shared += Math.min(c, y.get(g) ?? 0);
  return (2 * shared) / Math.max(1, a.length + b.length - 2);
}

interface KbCard {
  imagery?: { commonMisdescriptions?: { wrong: string; regex: string }[] };
}
const kb = (id: string): KbCard => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../content/kb/cards/${id}.json`, import.meta.url)), "utf8")) as KbCard;
type Steps = Extract<GuideBlock, { kind: "steps" }>;

describe("the suit articles each read their suit from an angle of their own", () => {
  it.each(Object.entries(SUITS))("%s: all fourteen cards, none described against the KB, and three worked examples", (slug, suit) => {
    const a = article(slug);
    const body = text(a);
    const cards = CARDS.filter((card) => card.suit === suit);
    expect(cards).toHaveLength(14);
    for (const card of cards) {
      expect(body, card.names.ko).toContain(card.names.ko);
      // Each card's known misdescriptions, checked on the sentences that name that card (another card's true detail may match).
      const about = sentences(body).filter((sentence) => new RegExp(`${card.names.ko}(?![0-9])`).test(sentence)).join("\n");
      for (const mis of kb(card.id).imagery?.commonMisdescriptions ?? []) expect(about, `${card.id}: ${mis.wrong}`).not.toMatch(new RegExp(mis.regex));
    }
    const examples = a.sections.flatMap((section) => section.blocks ?? []).filter((block): block is Steps => block.kind === "steps" && block.items.every((item) => item.title.startsWith("예시 · ")));
    expect(examples).toHaveLength(1);
    expect(examples[0]?.items).toHaveLength(3);
    for (const item of examples[0]?.items ?? []) {
      expect(item.title).toMatch(/\?$/);
      // Each example names one card of its own suit.
      expect(cards.some((card) => item.title.includes(card.names.ko)), item.title).toBe(true);
    }
  });

  it("gives the five articles headings of their own, even with the suit names taken out", () => {
    const headings = ARTICLES.flatMap((a) => a.sections.map((section) => frame(section.heading)));
    expect(new Set(headings).size).toBe(headings.length);
  });

  it("opens no section of the five with the same two words, or ends its first sentence with the same two, on three articles", () => {
    for (const end of [false, true]) {
      const seen = new Map<string, Set<string>>();
      for (const a of ARTICLES) {
        for (const section of a.sections) {
          const words = masked(sentences(section.body)[0] ?? "").replace(/\s+/g, " ").trim().split(" ");
          const key = (end ? words.slice(-2) : words.slice(0, 2)).join(" ");
          seen.set(key, new Set([...(seen.get(key) ?? []), a.slug]));
        }
      }
      expect([...seen].filter(([, slugs]) => slugs.size > 2).map(([key, slugs]) => `${key}: ${[...slugs].join(", ")}`)).toEqual([]);
    }
  });

  it("repeats no sentence of one article in another, nor nearly (Dice 0.8+), once suit and card names are masked", () => {
    const all = ARTICLES.flatMap((a) => sentences([a.summary ?? "", ...(a.keyPoints ?? []), text(a)].join("\n")).map((s) => ({ slug: a.slug, s, f: frame(s) })));
    const found: string[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const [x, y] = [all[i]!, all[j]!];
        if (x.slug === y.slug || x.f.length < 10 || y.f.length < 10) continue;
        if (x.f === y.f || (x.f.length >= 14 && y.f.length >= 14 && dice(x.f, y.f) >= 0.8)) found.push(`${x.slug}: ${x.s}\n${y.slug}: ${y.s}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("has the overview compare the four suits and link to each suit article instead of retelling them", () => {
    const overview = article(OVERVIEW);
    const raw = overview.sections.flatMap((section) => [section.body, ...(section.blocks ?? []).map((block) => JSON.stringify(block))]).join("\n");
    for (const slug of Object.keys(SUITS)) expect(raw, slug).toContain(`(/guide/${slug})`);
    const table = overview.sections.flatMap((section) => section.blocks ?? []).find((block) => block.kind === "table" && block.rows.length === 4);
    expect(table, "a table with one row per suit").toBeDefined();
    // The overview no longer describes an ace scene by scene: those pictures live in the suit articles.
    expect(text(overview)).not.toMatch(/구름에서 나온 손이/);
  });
});
