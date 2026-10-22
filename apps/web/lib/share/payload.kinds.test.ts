import { describe, expect, it } from "vitest";
import { decisionFor } from "@/lib/decision";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import type { ChapterContext } from "@/lib/security/chapterToken";
import {
  buildNowSharePayload,
  buildPremiumSharePayload,
  buildSajuFreePayload,
  buildTarotFreePayload,
  parseSharePayload,
} from "./payload";

/** Every place a share can come from shows something (owner 2026-10-23): the new kinds, each holding only what its screen shows for free. */

const tarotCtx: Extract<ChapterContext, { kind: "tarot" }> = {
  kind: "tarot",
  templateId: "relationship-contact",
  input: { topicId: "custom", whoId: "us", question: "팀장님께 연락해도 될까요?", conditions: [{ label: "상황", value: "연락이 끊겼어요" }], note: "지난달 회식 뒤로 답장이 없어요", whoText: "팀장님", deck: "starlog" },
  cards: [
    ["major-09-hermit", "upright"],
    ["major-17-star", "reversed"],
    ["cups-03", "upright"],
  ],
};

describe("buildNowSharePayload (지금의 한 장)", () => {
  it("takes the card's line and why from the card DB, never from the client", () => {
    const entry = decisionFor("major-17-star", "reversed", "starlog");
    const payload = buildNowSharePayload({ cardId: "major-17-star", orientation: "reversed", pick: 1, deck: "starlog" });
    expect(payload).toEqual({ kind: "now", v: 1, deck: "starlog", card: { cardId: "major-17-star", orientation: "reversed" }, lean: entry.lean, answer: entry.answers[1], why: entry.why });
  });

  it("refuses a card, side, line or design it does not know", () => {
    expect(buildNowSharePayload({ cardId: "major-99-x", orientation: "upright", pick: 0, deck: "starlog" })).toBeNull();
    expect(buildNowSharePayload({ cardId: "major-17-star", orientation: "sideways", pick: 0, deck: "starlog" })).toBeNull();
    expect(buildNowSharePayload({ cardId: "major-17-star", orientation: "upright", pick: 7, deck: "starlog" })).toBeNull();
    expect(buildNowSharePayload({ cardId: "major-17-star", orientation: "upright", pick: 0.5, deck: "starlog" })).toBeNull();
    expect(buildNowSharePayload({ cardId: "major-17-star", orientation: "upright", pick: 0, deck: "other" })).toBeNull();
  });
});

describe("buildTarotFreePayload (the free first reading)", () => {
  const first = { heading: "은둔자 · 지금의 나", body: "메모에 적은 \"지난달 회식 뒤로 답장이 없어요\"라는 말처럼 팀장님께 먼저 다가가기 전에 마음을 고르는 때예요." };
  const second = { heading: "별(역) · 상대의 마음", body: "아직은 기대를 조금 내려놓은 모습이에요." };
  const payload = buildTarotFreePayload(tarotCtx, { first, second });

  it("keeps the cards, their positions and design, and only the two free paragraphs", () => {
    expect(payload.kind).toBe("tarot-free");
    expect(payload.deck).toBe("starlog");
    expect(payload.cards.map((card) => card.cardId)).toEqual(["major-09-hermit", "major-17-star", "cups-03"]);
    expect(payload.cards.every((card) => card.position.length > 0)).toBe(true);
    expect(payload.second).toEqual(second);
    expect(Object.keys(payload).sort()).toEqual(["cards", "deck", "first", "kind", "second", "v"]);
  });

  it("hides the question, the note and the typed words wherever the text quotes them", () => {
    const text = JSON.stringify(payload);
    expect(text).not.toContain("회식");
    expect(text).not.toContain("팀장님께 연락해도");
    expect(text).not.toContain("팀장");
  });

  it("leaves the second paragraph out when the teaser had none", () => {
    expect(buildTarotFreePayload(tarotCtx, { first }).second).toBeUndefined();
  });
});

describe("buildSajuFreePayload (사주 맛보기 and 주제별 맛보기)", () => {
  const ctx = { birth: { calendar: "solar" as const, year: 1990, month: 1, day: 1, isLeapMonth: false, gender: "female" as const, timeKnown: true, hour: 12, minute: 30, placeId: "seoul" }, topic: "love" as const };

  it("keeps the title and the summary only, with the birth and the chart's pillars hidden", () => {
    const payload = buildSajuFreePayload(ctx, { title: "한겨울에 뜬 해", summary: "1990년 1월 1일 낮 12시 30분에 태어난 병화(丙火) 일간, 일주 병인(丙寅)이에요." });
    expect(payload).toMatchObject({ kind: "saju-free", v: 1, topic: "love", title: "한겨울에 뜬 해" });
    expect(Object.keys(payload).sort()).toEqual(["kind", "summary", "title", "topic", "v"]);
    expect(payload.summary).not.toMatch(/1990|1월 1일|12시 30분|丙寅|병인\(/);
  });

  it("names no topic for 전체 흐름", () => {
    expect(buildSajuFreePayload({ birth: ctx.birth }, { title: "t", summary: "s" }).topic).toBeUndefined();
  });
});

describe("buildPremiumSharePayload (the image's fields, as a link)", () => {
  it("켈틱 크로스: the ten cards and their design, never the question or the reading", () => {
    const ctx = { kind: "tarot-deep" as const, input: tarotCtx.input, cards: TAROT_SAMPLE.cards.map((c) => [c.cardId, c.orientation] as [string, "upright" | "reversed"]) };
    const payload = buildPremiumSharePayload(ctx, { secret: "유료 본문" });
    expect(payload).toEqual({ kind: "premium", v: 1, product: "tarot-deep", deck: "starlog", cards: ctx.cards.map(([cardId, orientation]) => ({ cardId, orientation })) });
  });

  it("궁합: the relation only, never a birth, a label or the concern", () => {
    const ctx = { kind: "match" as const, me: { birth: {} as never }, partner: { sealed: "x", label: "민수" }, relation: "friend" as const, concern: "요즘 서운해요" };
    expect(buildPremiumSharePayload(ctx, {})).toEqual({ kind: "premium", v: 1, product: "match", relation: "friend" });
  });

  it("신년운세: the year's own title when the image would draw it, else none", () => {
    const ctx = { kind: "newyear-2027" as const, birth: {} as never };
    expect(buildPremiumSharePayload(ctx, { title: "단단히 뿌리내리는 해", months: ["유료"] })).toEqual({ kind: "premium", v: 1, product: "newyear-2027", title: "단단히 뿌리내리는 해" });
    expect(buildPremiumSharePayload(ctx, { title: "丙午年 http://x.kr" })).toEqual({ kind: "premium", v: 1, product: "newyear-2027" });
  });
});

describe("parseSharePayload, the new kinds", () => {
  const round = (value: unknown) => parseSharePayload(JSON.stringify(value));

  it("reads back what the builders write", () => {
    const now = buildNowSharePayload({ cardId: "cups-03", orientation: "upright", pick: 0, deck: "rws1909" })!;
    expect(round(now)).toEqual(now);
    const free = buildTarotFreePayload(tarotCtx, { first: { heading: "h", body: "b" } });
    expect(round(free)).toEqual(free);
    const saju = buildSajuFreePayload({ birth: { calendar: "solar", year: 1990, month: 1, day: 1, isLeapMonth: false, gender: "female", timeKnown: false, hour: null, minute: null, placeId: "seoul" } as never }, { title: "t", summary: "s" });
    expect(round(saju)).toEqual(saju);
    expect(round({ kind: "premium", v: 1, product: "match", relation: "friend" })).toEqual({ kind: "premium", v: 1, product: "match", relation: "friend" });
    expect(round({ kind: "bonds", v: 1, constellationId: "abcdefghij0123456789" })).toEqual({ kind: "bonds", v: 1, constellationId: "abcdefghij0123456789" });
    expect(round({ kind: "bond", v: 1, constellationId: "abcdefghij0123456789", starId: "zyxwvutsrq0123456789" })).toMatchObject({ kind: "bond" });
  });

  it("refuses a malformed one", () => {
    expect(round({ kind: "now", v: 1, deck: "starlog", card: { cardId: "nope", orientation: "upright" }, answer: "a", why: "w" })).toBeNull();
    expect(round({ kind: "tarot-free", v: 1, deck: "starlog", cards: [], first: { heading: "h", body: "b" } })).toBeNull();
    expect(round({ kind: "saju-free", v: 1, title: 3, summary: "s" })).toBeNull();
    expect(round({ kind: "premium", v: 1, product: "nope" })).toBeNull();
    expect(round({ kind: "bonds", v: 1, constellationId: "../x" })).toBeNull();
    expect(round({ kind: "bond", v: 1, constellationId: "abcdefghij0123456789" })).toBeNull();
  });
});
