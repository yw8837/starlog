import { CARDS, TEMPLATES, type Orientation } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { teaserCut } from "@/lib/security/teaserSeal";
import { mockTarotTeaser } from "./mock";
import { buildTarotContext } from "./prompts/tarot";

/**
 * The free teaser shows the second card cut near half (감질맛) and its end never leaves the server. The mock closed that
 * card on today's action even when its position hint had already said the very same sentence (펜타클 왕 reversed: "꼭
 * 쥐지 않아도 되는 것 하나를 내려놓아 보세요."), so the end showed in the cut: the tarot flow test failed now and then.
 */
const INPUT = {
  topicId: "money", whoId: "me", whenId: "week", question: "이번 주, 나의 재물 흐름은 어떨까",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }, { label: "관심 방향", value: "지출 줄이기" }], note: "이번 달 카드값이 많이 나왔어요",
};

describe("the mock teaser's second card", () => {
  it("never closes on a sentence it already said, for every card and orientation in its place", () => {
    const template = TEMPLATES["self-flow"];
    const repeated: string[] = [];
    for (const card of CARDS) {
      for (const orientation of ["upright", "reversed"] as Orientation[]) {
        const drawn = [CARDS[0]!.id, card.id, CARDS[1]!.id].map((cardId, slot) => ({
          cardId: slot === 1 ? card.id : cardId === card.id ? CARDS[2]!.id : cardId, slot, position: template.positions[slot]!, orientation: slot === 1 ? orientation : ("upright" as Orientation),
        }));
        const body = mockTarotTeaser(buildTarotContext("self-flow", drawn, INPUT as never)).secondCard!.body.trim();
        const end = body.slice(-20);
        if (teaserCut(body).includes(end)) repeated.push(`${card.id} ${orientation}`);
      }
    }
    expect(repeated).toEqual([]);
  });
});
