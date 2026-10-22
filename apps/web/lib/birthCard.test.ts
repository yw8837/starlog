import { readFileSync } from "node:fs";
import { CARDS, getCard } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { sitemapEntriesFor, sitemapXml } from "./seo";
import {
  BIRTH_CARDS,
  BIRTH_CARD_PATH,
  birthCardFor,
  birthCardNumber,
  birthCardOgPath,
  birthCardPath,
  findBirthCard,
  pairCardOf,
  solarBirthDate,
} from "./birthCard";

/** The card knowledge base the readings use (lib/kb is server-only, so the JSON is read directly). */
type KbCard = {
  id: string;
  keywordsKo: string[];
  core: { upright: string[]; shadow: string };
  imagery: { decks?: { starlog?: { misdescriptions: Array<{ regex: string }> } } };
};
const KB: { cards: KbCard[] } = JSON.parse(readFileSync(new URL("./kb/cards.generated.json", import.meta.url), "utf8"));
const kbOf = (id: string) => KB.cards.find((card) => card.id === id)!;

describe("birthCardNumber: every digit of YYYYMMDD added, added again while over 22, and 22 is 0 (바보)", () => {
  // Worked by hand: the digits, their sum, the reduction.
  it.each([
    [1990, 5, 15, 3], // 1+9+9+0+0+5+1+5 = 30 → 3+0 = 3 여황제
    [1985, 7, 23, 8], // 1+9+8+5+0+7+2+3 = 35 → 8 힘
    [2000, 1, 1, 4], // 2+0+0+0+0+1+0+1 = 4 황제
    [2010, 10, 10, 5], // 2+0+1+0+1+0+1+0 = 5 교황
    [1980, 1, 3, 0], // 1+9+8+0+0+1+0+3 = 22 → 0 바보
    [1991, 1, 10, 0], // 1+9+9+1+0+1+1+0 = 22 → 0 바보
    [1960, 2, 3, 21], // 1+9+6+0+0+2+0+3 = 21 세계 (21 stays)
    [1970, 1, 1, 19], // 1+9+7+0+0+1+0+1 = 19 태양
    [2004, 2, 29, 19], // 2+0+0+4+0+2+2+9 = 19 태양 (a leap day)
    [2003, 1, 7, 13], // 2+0+0+3+0+1+0+7 = 13 죽음
    [1987, 11, 29, 11], // 1+9+8+7+1+1+2+9 = 38 → 11 정의
    [1995, 8, 17, 4], // 1+9+9+5+0+8+1+7 = 40 → 4 황제
    [1999, 9, 29, 12], // 1+9+9+9+0+9+2+9 = 48 → 12 매달린 사람
    [1975, 2, 4, 10], // 1+9+7+5+0+2+0+4 = 28 → 10 운명의 수레바퀴
    [1990, 1, 3, 5], // 1+9+9+0+0+1+0+3 = 23 → 5 교황 (23 is reduced, not mapped)
  ])("%i-%i-%i → %i", (year, month, day, number) => {
    expect(birthCardNumber(year, month, day)).toBe(number);
    expect(birthCardFor(year, month, day).number).toBe(number);
  });

  it("is a major arcana number for every day from 1900 to 2100; I 마법사 and II 여사제 never come out of this sum", () => {
    const seen = new Set<number>();
    for (let t = Date.UTC(1900, 0, 1); t <= Date.UTC(2100, 11, 31); t += 86_400_000) {
      const date = new Date(t);
      const n = birthCardNumber(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      expect(Number.isInteger(n) && n >= 0 && n <= 21).toBe(true);
      seen.add(n);
    }
    // A date's digits add up to at least 4 (2000-01-10), and 10, 11, 19 and 20 stay as they are: the sum
    // never lands on 1 or 2. Their pages exist (shared links, the list of 22) but no birth date leads there.
    expect([...seen].sort((a, b) => a - b)).toEqual([0, ...Array.from({ length: 19 }, (_, i) => i + 3)]);
  });
});

describe("짝 카드: a card of 10–21 also shows the card its two digits add up to, once", () => {
  it.each([
    [10, 1], // 1+0 마법사
    [11, 2], // 1+1 여사제
    [12, 3],
    [13, 4],
    [14, 5],
    [15, 6],
    [16, 7],
    [17, 8],
    [18, 9],
    [19, 10], // 1+9 운명의 수레바퀴 (whose own 짝 카드 is 마법사: one step per page)
    [20, 2], // 2+0 여사제
    [21, 3], // 2+1 여황제
  ])("%i → %i", (number, pair) => {
    expect(pairCardOf(BIRTH_CARDS[number]!)?.number).toBe(pair);
  });

  it("is none for 0–9", () => {
    for (const card of BIRTH_CARDS.slice(0, 10)) expect(pairCardOf(card), card.slug).toBeUndefined();
  });

  it("with the 짝 카드, every one of the 22 cards comes out of some birth date from 1900 to 2100", () => {
    const seen = new Set<number>();
    for (let t = Date.UTC(1900, 0, 1); t <= Date.UTC(2100, 11, 31); t += 86_400_000) {
      const date = new Date(t);
      const card = birthCardFor(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      seen.add(card.number);
      const pair = pairCardOf(card);
      if (pair) seen.add(pair.number);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 22 }, (_, i) => i));
  });
});

describe("solarBirthDate: the date the sum is taken from", () => {
  /** "Today" in Korea for these tests. */
  const TODAY = { year: 2026, month: 10, day: 22 };
  const solar = (year: number, month: number, day: number) => ({ calendar: "solar" as const, year, month, day, isLeapMonth: false });
  const lunar = (year: number, month: number, day: number, isLeapMonth = false) => ({ calendar: "lunar" as const, year, month, day, isLeapMonth });

  it("keeps a solar date as it is", () => {
    expect(solarBirthDate(solar(1990, 5, 15), TODAY)).toEqual({ date: { year: 1990, month: 5, day: 15 } });
  });

  it("turns a lunar date into its solar day (설날 2000 was 2월 5일, 설날 1990 was 1월 27일)", () => {
    expect(solarBirthDate(lunar(2000, 1, 1), TODAY)).toEqual({ date: { year: 2000, month: 2, day: 5 } });
    expect(solarBirthDate(lunar(1990, 1, 1), TODAY)).toEqual({ date: { year: 1990, month: 1, day: 27 } });
  });

  it("refuses a lunar day that does not exist", () => {
    // 1990 has no 윤1월 (its leap month is 5월).
    expect(solarBirthDate(lunar(1990, 1, 1, true), TODAY)).toEqual({ error: "없는 날짜예요. 양력·음력과 날짜를 다시 확인해 주세요." });
  });

  it("refuses a day after today in Korea, in the saju form's words; today itself is fine", () => {
    const future = { error: "오늘 이후의 날짜는 고를 수 없어요." };
    expect(solarBirthDate(solar(2026, 10, 22), TODAY)).toEqual({ date: { year: 2026, month: 10, day: 22 } });
    expect(solarBirthDate(solar(2026, 10, 23), TODAY)).toEqual(future);
    expect(solarBirthDate(solar(2026, 12, 31), TODAY)).toEqual(future);
    // A lunar date counts by its solar day: 음력 2026-11-01 falls in December.
    expect(solarBirthDate(lunar(2026, 11, 1), TODAY)).toEqual(future);
  });
});

describe("the 22 cards: slug ↔ card", () => {
  const majors = CARDS.filter((card) => card.arcana === "major");

  it("has one entry per major arcana, in number order, named as the deck names it", () => {
    expect(BIRTH_CARDS.map((card) => card.cardId)).toEqual(majors.map((card) => card.id));
    for (const card of BIRTH_CARDS) {
      expect(card.name).toBe(getCard(card.cardId).names.ko);
      expect(card.number).toBe(getCard(card.cardId).number);
    }
  });

  it("uses the card's own slug (major-09-hermit → hermit), unique, and finds each one back", () => {
    const slugs = BIRTH_CARDS.map((card) => card.slug);
    expect(new Set(slugs).size).toBe(22);
    for (const card of BIRTH_CARDS) {
      expect(card.cardId).toBe(`major-${String(card.number).padStart(2, "0")}-${card.slug}`);
      expect(card.slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(findBirthCard(card.slug)).toBe(card);
    }
    expect(findBirthCard("major-09-hermit")).toBeUndefined();
    expect(findBirthCard("")).toBeUndefined();
    expect(findBirthCard("constructor")).toBeUndefined();
  });

  it("puts nothing but the card in its addresses: the page and its preview image", () => {
    expect(BIRTH_CARD_PATH).toBe("/birth-card");
    expect(birthCardPath("hermit")).toBe("/birth-card/hermit");
    expect(birthCardOgPath("hermit")).toBe("/api/og/birth-card/hermit");
    const card = birthCardFor(1990, 1, 9); // 1+9+9+0+0+1+0+9 = 29 → 11 정의: a date gives only a slug
    expect(card.slug).toBe("justice");
    for (const href of [birthCardPath(card.slug), birthCardOgPath(card.slug)]) {
      expect(href).not.toMatch(/\d{4}|\?|#/);
    }
  });
});

describe("what each card page says", () => {
  const lines = (card: (typeof BIRTH_CARDS)[number]) => [...card.traits, card.asks, card.nudge];

  it("has three short traits (30 characters or less), a question and a nudge toward a reading", () => {
    for (const card of BIRTH_CARDS) {
      expect(card.traits, card.slug).toHaveLength(3);
      for (const trait of card.traits) {
        expect(trait.length, trait).toBeGreaterThanOrEqual(8);
        expect(trait.length, trait).toBeLessThanOrEqual(30);
        expect(trait, trait).toMatch(/요$/);
      }
      expect(card.asks, card.slug).toMatch(/\?$/);
      expect(card.asks.length, card.asks).toBeLessThanOrEqual(32);
      expect(card.nudge, card.slug).toMatch(/요\.$/);
      expect(card.nudge.length, card.nudge).toBeLessThanOrEqual(36);
    }
  });

  it("says each line once across the 22 cards", () => {
    const all = BIRTH_CARDS.flatMap(lines);
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps to 해요체 without scores, guarantees or fortune-telling words", () => {
    const banned = /점수|\d+점|\d+%|반드시|무조건|확실히|틀림없|보장|운명적|대박|합격|재회|당신|습니다|입니다/;
    for (const card of BIRTH_CARDS) for (const line of lines(card)) expect(line, line).not.toMatch(banned);
  });

  it("is drawn from the card knowledge base the readings use: every basis phrase is the card's own", () => {
    for (const card of BIRTH_CARDS) {
      const kb = kbOf(card.cardId);
      const own = new Set([...kb.keywordsKo, ...kb.core.upright, kb.core.shadow]);
      expect(card.basis.length, card.slug).toBeGreaterThanOrEqual(2);
      for (const phrase of card.basis) expect(own.has(phrase), `${card.slug}: ${phrase}`).toBe(true);
    }
  });

  it("never describes the Starlog picture in a way the knowledge base marks as wrong", () => {
    for (const card of BIRTH_CARDS) {
      const wrong = kbOf(card.cardId).imagery.decks?.starlog?.misdescriptions ?? [];
      for (const line of lines(card)) for (const { regex } of wrong) expect(line, `${card.slug}: ${line}`).not.toMatch(new RegExp(regex));
    }
  });
});

describe("in the sitemap", () => {
  const paths = [BIRTH_CARD_PATH, ...BIRTH_CARDS.map((card) => birthCardPath(card.slug))];

  it("lists the form and the 22 card pages once each, on the app host only", () => {
    const app = sitemapEntriesFor("app").map((entry) => entry.path);
    expect(paths).toHaveLength(23);
    for (const path of paths) expect(app.filter((listed) => listed === path), path).toHaveLength(1);
    const guide = sitemapEntriesFor("guide").map((entry) => entry.path);
    for (const path of paths) expect(guide, path).not.toContain(path);
    const xml = sitemapXml("app");
    for (const path of paths) expect(xml).toContain(`<loc>https://starlog.yeolmaeapps.kr${path}</loc>`);
  });
});
