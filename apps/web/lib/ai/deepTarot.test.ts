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
