import { CARDS, DEFAULT_REVERSAL_RATE, createDeck, type Orientation } from "@starlog/core";
import source from "@content/kb/decision.ko.json";
import { describe, expect, it } from "vitest";
import { decisionFor, drawNow } from "./decision";
import runtime from "./decision.generated.json";
import { SITEMAP_PATHS } from "./seo";

const SIDES: Orientation[] = ["upright", "reversed"];

describe("지금의 한 장 DB lookup", () => {
  it("has an entry for every card and side of the deck", () => {
    for (const card of CARDS) {
      for (const side of SIDES) {
        const entry = decisionFor(card.id, side);
        expect(["go", "wait", "rethink"]).toContain(entry.lean);
        expect(entry.answers).toHaveLength(3);
        for (const answer of entry.answers) expect(answer.length).toBeGreaterThan(0);
        for (const answer of entry.answers) expect(answer.length).toBeLessThanOrEqual(20);
        expect(entry.why.length).toBeLessThanOrEqual(70);
        // The page reads lean, answers and why only: the source KB keeps each tip, the runtime copy drops it.
        expect(entry).not.toHaveProperty("tip");
      }
    }
    expect(Object.keys(runtime)).toHaveLength(CARDS.length);
  });

  it("gives every side its own lines (no line repeats anywhere in the DB)", () => {
    const lines = CARDS.flatMap((card) => SIDES.flatMap((side) => decisionFor(card.id, side).answers));
    expect(lines).toHaveLength(468);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("throws for a card id it does not know", () => {
    expect(() => decisionFor("major-99-nobody", "upright")).toThrow(/No 지금의 한 장 entry/);
  });

  it("is the checker's slim copy of content/kb/decision.ko.json (re-run scripts/check-decision-db.mjs after editing)", () => {
    const expected = Object.fromEntries(
      Object.entries(source.cards).map(([id, sides]) => [
        id,
        Object.fromEntries(SIDES.map((side) => [side, { lean: sides[side].lean, answers: sides[side].answers, why: sides[side].why }])),
      ]),
    );
    expect(runtime).toEqual(expected);
  });
});

describe("drawNow", () => {
  const deck = createDeck("now-test-seed", DEFAULT_REVERSAL_RATE);

  it("resolves every card of a shuffled deck, with its side", () => {
    for (let index = 0; index < deck.order.length; index++) {
      const draw = drawNow(deck, index, 0.5);
      expect(draw.cardId).toBe(deck.order[index]);
      expect(draw.orientation).toBe(deck.orientations[index]);
      const entry = decisionFor(draw.cardId, draw.orientation);
      expect(entry.answers).toContain(draw.answer);
      expect(draw.why).toBe(entry.why);
      expect(draw.lean).toBe(entry.lean);
      // A draw is the card's reading only; the entry's tip is not part of it.
      expect(draw).not.toHaveProperty("tip");
    }
  });

  it("picks one of the three lines from the random number", () => {
    const { answers } = decisionFor(deck.order[0]!, deck.orientations[0]!);
    expect(drawNow(deck, 0, 0).answer).toBe(answers[0]);
    expect(drawNow(deck, 0, 0.34).answer).toBe(answers[1]);
    expect(drawNow(deck, 0, 0.9999).answer).toBe(answers[2]);
    // Out-of-range numbers still land on a real line.
    expect(drawNow(deck, 0, 1).answer).toBe(answers[2]);
    expect(drawNow(deck, 0, -0.5).answer).toBe(answers[0]);
  });

  it("rejects an index outside the deck", () => {
    expect(() => drawNow(deck, 78, 0.5)).toThrow(RangeError);
    expect(() => drawNow(deck, 1.5, 0.5)).toThrow(RangeError);
  });
});

describe("/now in search", () => {
  it("is listed in the sitemap", () => {
    expect(SITEMAP_PATHS).toContain("/now");
  });
});

describe("the why for the card design shown", () => {
  it("points at the Starlog picture when the person sees the Starlog deck, and at the 1909 scan otherwise", () => {
    const db = runtime as Record<string, Record<Orientation, { why: string; whyStarlog?: string }>>;
    for (const card of CARDS) {
      for (const orientation of ["upright", "reversed"] as const) {
        const entry = db[card.id]![orientation];
        expect(decisionFor(card.id, orientation, "starlog").why).toBe(entry.whyStarlog ?? entry.why);
        expect(decisionFor(card.id, orientation, "rws1909").why).toBe(entry.why);
        expect(decisionFor(card.id, orientation).why).toBe(entry.why);
      }
    }
  });
});
