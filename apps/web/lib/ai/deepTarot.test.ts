import { DEFAULT_REVERSAL_RATE, TEMPLATES, createDeck, pickCards } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DeepPartASchema, DeepPartBSchema } from "./premiumSchemas";
import {
  DEEP_TAROT_SYSTEM, buildDeepContext, deepHeadings, deepLockedToc, deepPartBPrompt, deepShared, deepTeaserPrompt, previewKeyword,
} from "./prompts/deepTarot";
import { MODEL_BLIND_RULE, STYLE_RULES } from "./style";

const cards = pickCards(createDeck("deep-test", DEFAULT_REVERSAL_RATE), TEMPLATES["deep-tarot"], [3, 14, 25, 36, 47, 58, 69, 70, 1, 12]);
const ctx = buildDeepContext(cards, {
  topicId: "money", whoId: "me", whenId: "month", question: "",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }],
  note: "이번 달 <카드값>이 많이 나왔어요",
});

describe("deep tarot prompts", () => {
  it("carries the shared rules, the blind rule and the ten-card overrides, and never names the tradition", () => {
    expect(DEEP_TAROT_SYSTEM).toContain(STYLE_RULES);
    expect(DEEP_TAROT_SYSTEM).toContain(MODEL_BLIND_RULE);
    expect(DEEP_TAROT_SYSTEM.split(MODEL_BLIND_RULE)).toHaveLength(2);
    expect(DEEP_TAROT_SYSTEM).toContain("여섯 번 이하");
    expect(DEEP_TAROT_SYSTEM).toContain("## deep-a");
    expect(DEEP_TAROT_SYSTEM).toContain("## deep-b");
    expect(DEEP_TAROT_SYSTEM).not.toMatch(/켈틱|셀틱|celtic/i);
    expect(DEEP_TAROT_SYSTEM).not.toContain("베타");
  });

  it("puts all ten cards and the user's words (as data) in the shared block", () => {
    const shared = deepShared(ctx);
    for (const card of ctx.cards) expect(shared).toContain(`cardId ${card.cardId}`);
    expect(shared).toContain("<note>\n이번 달 카드값이 많이 나왔어요\n</note>");
    expect(shared).toContain('자리 10 "결과의 방향"');
    expect(shared).toContain("<spread_facts>");
  });

  it("gives part B the element relations of the crossing, the two axes and the staff (gap review C1, B6)", () => {
    const ids = ["wands-03", "cups-05", "swords-02", "pentacles-04", "wands-07", "major-17-star", "major-09-hermit", "cups-11", "swords-12", "pentacles-13"];
    const fixed = buildDeepContext(
      ids.map((cardId, slot) => ({ cardId, position: TEMPLATES["deep-tarot"].positions[slot]!, orientation: "upright" as const, slot })),
      { topicId: "money", whoId: "me", whenId: "month", question: "", conditions: [] },
    );
    const shared = deepShared(fixed);
    expect(shared).toContain("교차 원소 관계: 지금의 나(완드 3) × 가로막는 것(컵 5) 서로 부딪히는 짝");
    expect(shared).toContain("세로축 원소 관계: 바탕(검 2) × 지금의 나(완드 3) 서로 돕는 짝, 지금의 나(완드 3) × 바라는 것(완드 7) 같은 원소라 서로 돕는 짝");
    expect(shared).toContain("가로축 원소 관계: 지나온 것(펜타클 4) × 지금의 나(완드 3) 무난한 짝, 지금의 나(완드 3) × 다가올 것(별) 서로 돕는 짝");
    expect(shared).toContain(
      "지팡이 원소 관계: 나의 태도(은둔자) × 주변(컵 시종) 서로 돕는 짝, 주변(컵 시종) × 바람과 걱정(검 기사) 무난한 짝, 바람과 걱정(검 기사) × 결과의 방향(펜타클 여왕) 서로 부딪히는 짝",
    );
    const facts = shared.slice(shared.indexOf("<spread_facts>"));
    expect(facts).not.toContain("가운데 카드"); // the three-card line belongs to three-card spreads
    expect(facts).toContain("번호·계급: 완드 3, 컵 5, 검 2, 펜타클 4, 완드 7, 17, 9, 컵 시종, 검 기사, 펜타클 여왕"); // courts by rank, never 11–14
  });

  it("gives the free preview only the first card's KB", () => {
    const teaser = deepTeaserPrompt(ctx);
    expect(teaser).toContain(`cardId ${ctx.cards[0]!.cardId}`);
    expect(teaser).not.toContain(`cardId ${ctx.cards[1]!.cardId}`);
    expect(teaser.startsWith("<task>deep-teaser</task>")).toBe(true);
  });

  it("hands part B the first sentence of each position section", () => {
    const a = DeepPartASchema.parse({
      verdict: "v",
      positions: ctx.cards.map((c) => ({ position: c.position, cardId: c.cardId, body: `${c.name} 첫 문장이에요. 둘째 문장이에요.` })),
    });
    const prompt = deepPartBPrompt(ctx, a);
    expect(prompt).toContain("<earlier>");
    expect(prompt).toContain(`1. 지금의 나 · ${ctx.cards[0]!.name}: ${ctx.cards[0]!.name} 첫 문장이에요.`);
    expect(prompt).not.toContain("둘째 문장이에요");
  });

  it("keeps the locked TOC 1:1 with the paid sections", () => {
    const h = deepHeadings(ctx);
    expect(deepLockedToc(ctx)).toEqual([
      "한 줄 결론", ...ctx.cards.map((c) => `${c.position} · ${c.name}`), h.crossing, h.axes, h.staff, h.timing, h.action, h.observation,
    ]);
    expect(deepLockedToc(ctx)).toHaveLength(17);
  });

  it("picks a short on-topic keyword per card from the KB", () => {
    for (const card of ctx.cards) {
      const keyword = previewKeyword(card, ctx);
      expect(keyword.length).toBeGreaterThan(1);
      expect(keyword.length).toBeLessThanOrEqual(18);
    }
  });

  it("parses part drafts", () => {
    expect(DeepPartBSchema.safeParse({
      crossing: { body: "x" }, axes: { vertical: "x", horizontal: "x" }, staff: { body: "x" }, timing: { body: "x" },
      action: { body: "x" }, observation: { body: "x" }, followUps: ["a", "b"],
    }).success).toBe(true);
  });
});
