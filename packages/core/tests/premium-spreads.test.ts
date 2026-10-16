import { describe, expect, it } from "vitest";
import { PREMIUM_TEMPLATES, TEMPLATES, createDeck, pickCards } from "../src";

describe("premium spreads", () => {
  it("lays out ten cards for the deep reading, in plain Korean", () => {
    expect(TEMPLATES["deep-tarot"].positions).toEqual([
      "지금의 나", "가로막는 것", "바탕", "지나온 것", "바라는 것", "다가올 것", "나의 태도", "주변", "바람과 걱정", "결과의 방향",
    ]);
    expect(TEMPLATES["deep-tarot"].positionsJa).toHaveLength(10);
  });

  it("lays out five cards for the relationship reading", () => {
    expect(TEMPLATES.match.positions).toEqual(["나의 마음", "그 사람 쪽 흐름", "두 사람 사이", "엇갈리는 지점", "함께 가꿀 방향"]);
    expect(TEMPLATES.match.positionsJa).toHaveLength(5);
  });

  it("deals ten distinct cards in tap order", () => {
    const picks = [70, 3, 12, 40, 5, 66, 21, 9, 33, 50];
    const cards = pickCards(createDeck("seed-deep", 0.3), TEMPLATES["deep-tarot"], picks);
    expect(cards.map((c) => c.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(cards.map((c) => c.cardId)).size).toBe(10);
    expect(() => pickCards(createDeck("seed-deep", 0.3), TEMPLATES["deep-tarot"], [1, 2, 3])).toThrow();
  });

  it("names the premium spreads", () => {
    expect([...PREMIUM_TEMPLATES]).toEqual(["deep-tarot", "match"]);
  });

  // Screens may call it 켈틱 크로스 (owner 2026-10-16, lib/premium/products.ts `entry`); these positions reach the model, which never names it.
  it("never names the ten-card spread after its tradition in what the reading is written from", () => {
    expect(JSON.stringify(TEMPLATES)).not.toMatch(/켈틱|셀틱|celtic/i);
  });
});
