import { describe, expect, it } from "vitest";
import { decisionFor } from "@/lib/decision";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import type { ChapterContext } from "@/lib/security/chapterToken";
import { buildNowSharePayload, buildSharePayload, buildTarotFreePayload } from "./payload";
import { firstSentence, sharePreview } from "./preview";

/** owner 2026-10-23 "결과공유하면 텍스트만 날라간다": a share says what it holds, from the cleaned payload only. */

const tarotCtx: Extract<ChapterContext, { kind: "tarot" }> = {
  kind: "tarot",
  templateId: "relationship-contact",
  input: { topicId: "love", whoId: "us", question: "민수에게 먼저 연락해도 될까요?", conditions: [], note: "지난달 회식 뒤로 답장이 없어요", deck: "starlog" },
  cards: [
    ["wands-03", "upright"],
    ["cups-11", "upright"],
    ["wands-02", "upright"],
  ],
};

describe("sharePreview", () => {
  it("tarot: the card names and the one-line conclusion as the title, the first card's first sentence as the description, and 나도 뽑아 보기", () => {
    const reading = { ...TAROT_SAMPLE.paid, verdict: "지금은 짧게 안부를 건네 볼 때예요. 길게 쓰지 않아도 돼요.", cards: TAROT_SAMPLE.paid.cards.map((c, i) => (i === 0 ? { ...c, body: "먼저 손을 내미는 쪽이 편해지는 흐름이에요. 다음 문장." } : c)) };
    const preview = sharePreview(buildSharePayload(tarotCtx, reading, "starlog"));
    expect(preview.title).toBe("완드 3 · 컵 시종 · 완드 2 · 지금은 짧게 안부를 건네 볼 때예요.");
    expect(preview.description).toBe("먼저 손을 내미는 쪽이 편해지는 흐름이에요.");
    expect(preview.try).toEqual({ label: "나도 뽑아 보기", path: "/tarot/start" });
  });

  it("never uses a sentence that still holds a hidden word: the title keeps the card names only", () => {
    const reading = { ...TAROT_SAMPLE.paid, verdict: "민수에게 먼저 연락해 보세요." };
    const preview = sharePreview(buildSharePayload(tarotCtx, reading, "starlog"));
    expect(preview.title).toBe("완드 3 · 컵 시종 · 완드 2");
    expect(JSON.stringify(preview)).not.toContain("민수");
    expect(JSON.stringify(preview)).not.toContain("회식");
  });

  it("지금의 한 장: the card and its line, why as the description, and /now to try", () => {
    const entry = decisionFor("major-17-star", "upright", "starlog");
    const preview = sharePreview(buildNowSharePayload({ cardId: "major-17-star", orientation: "upright", pick: 0, deck: "starlog" })!);
    expect(preview.title.startsWith("지금의 한 장 · 별 · ")).toBe(true);
    expect(preview.title).toContain(firstSentence(entry.answers[0]).slice(0, 10));
    expect(preview.try).toEqual({ label: "나도 뽑아 보기", path: "/now" });
  });

  it("the free first reading leads into /tarot/start; a premium one into its product page", () => {
    const free = sharePreview(buildTarotFreePayload(tarotCtx, { first: { heading: "완드 3 · 지금의 나", body: "멀리 내다보는 때예요. 둘째 문장." } }));
    expect(free.description).toBe("멀리 내다보는 때예요.");
    expect(free.try.path).toBe("/tarot/start");
    expect(sharePreview({ kind: "premium", v: 1, product: "match", relation: "friend" }).try.path).toBe("/premium/match?from=share");
  });

  it("a 별자리 인연 link says the sign and how far it is filled, its score only once complete, and offers 내 별자리 만들기", () => {
    const filling = sharePreview({ kind: "bonds", v: 1, constellationId: "abcdefghij0123456789" }, { kind: "bonds", signKo: "사자자리", ownerNickname: "별님", stars: 5, slots: 9, total: null, average: null, complete: false, members: [] });
    expect(filling.title).toBe("별님님의 사자자리 · 별 5/9");
    expect(filling.description).toBe("친구 5명이 별이 되어 9칸 가운데 5칸을 채웠어요");
    expect(filling.try).toEqual({ label: "내 별자리 만들기", path: "/bonds" });
    const done = sharePreview({ kind: "bonds", v: 1, constellationId: "abcdefghij0123456789" }, { kind: "bonds", signKo: "사자자리", ownerNickname: "별님", stars: 2, slots: 2, total: 150, average: 75, complete: true, members: [{ nickname: "하늘", score: 80 }, { nickname: "바다", score: 70 }] });
    expect(done.title).toBe("별님님의 사자자리 완성 · 인연 150점");
    expect(done.description).toBe("하늘 · 인연 80점, 바다 · 인연 70점 · 평균 75점");
  });
});
