import { describe, expect, it } from "vitest";
import { MATCH_RELATIONS, RELATION_KO } from "@/lib/ai/prompts/match";
import { MatchBody } from "@/lib/premium/inputs";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { MATCH_RELATION_OPTIONS, matchBody, matchReady, matchesThisFlow, sanitizeMatchFlow, type MatchFlow } from "./matchFlow";

const PARTNER = { ...DEFAULT_SAJU_FORM, year: 1992, month: 2, day: 26 };
const READY: MatchFlow = { me: DEFAULT_SAJU_FORM, partner: PARTNER, relation: "friend", ack: true };

describe("the 우리 사이 궁합 flow in this tab", () => {
  it("offers the server's six relations, in its order and words", () => {
    expect(MATCH_RELATION_OPTIONS.map((o) => o.value)).toEqual([...MATCH_RELATIONS]);
    expect(MATCH_RELATION_OPTIONS.map((o) => o.label)).toEqual(MATCH_RELATIONS.map((r) => RELATION_KO[r]));
  });

  it("is a form until both births, the relation and the consent are there, then ready: no cards to draw (owner 2026-10-17)", () => {
    expect(matchReady({})).toBe("form");
    expect(matchReady({ ...READY, ack: undefined })).toBe("form");
    expect(matchReady({ ...READY, relation: undefined })).toBe("form");
    expect(matchReady({ ...READY, partner: undefined })).toBe("form");
    expect(matchReady(READY)).toBe("ready");
  });

  it("drops the five cards an older tab kept", () => {
    expect(sanitizeMatchFlow({ ...READY, draw: { drawToken: "t", cards: [{ position: "나의 마음", cardId: "major-09-hermit", orientation: "upright" }] } })).toEqual(sanitizeMatchFlow(READY));
  });

  it("keeps only what it knows, the label clipped to 10 and the concern to 60", () => {
    const flow = sanitizeMatchFlow({ ...READY, partnerLabel: "가".repeat(14), concern: "나".repeat(80), relation: "boss", extra: "x" });
    expect(flow.partnerLabel).toHaveLength(10);
    expect(flow.concern).toHaveLength(60);
    expect(flow.relation).toBeUndefined();
    expect("extra" in flow).toBe(false);
    expect(sanitizeMatchFlow({ partner: { year: "x" } }).partner).toBeUndefined();
  });

  it("builds the request the server takes: ack true, the label and concern only when given, the status chips with my birth", () => {
    const body = matchBody({ ...READY, meStatus: { loveStatus: "single" }, partnerLabel: " 민지 ", concern: "" })!;
    expect(MatchBody.safeParse(body).success).toBe(true);
    expect(body).toEqual({ me: { birth: DEFAULT_SAJU_FORM, loveStatus: "single" }, partner: { birth: PARTNER, label: "민지" }, relation: "friend", ack: true });
    expect("label" in matchBody(READY)!.partner).toBe(false);
    expect(matchBody({ ...READY, ack: undefined })).toBeNull();
  });
});

describe("this flow's 궁합 in the account, after a cut-off (review 2026-10-20 A4)", () => {
  const OTHER_ME = { ...DEFAULT_SAJU_FORM, year: 1988, month: 7, day: 3, gender: "male" as const };
  /** The account's copy as the server keeps it: no partner birth, no token (lib/premium/adapters.ts MATCH_ADAPTER.chapter). */
  const copy = (flow: MatchFlow, more: Record<string, unknown> = {}) => ({ kind: "match", relation: flow.relation, relationLabel: "친구", me: { birth: flow.me }, reading: {}, chapterToken: "", ...more });

  it("two 궁합 of the same relation whose own births differ never cross", () => {
    const mine = READY;
    const theirs: MatchFlow = { ...READY, me: OTHER_ME };
    expect(matchesThisFlow(copy(mine), mine)).toBe(true);
    expect(matchesThisFlow(copy(theirs), mine)).toBe(false);
    expect(matchesThisFlow(copy(mine), theirs)).toBe(false);
    // the same birth written in another key order is the same birth
    const reordered = Object.fromEntries(Object.entries(DEFAULT_SAJU_FORM).reverse());
    expect(matchesThisFlow(copy(mine, { me: { birth: reordered } }), mine)).toBe(true);
  });

  it("asks the relation, label and concern too, and never the other person's birth (the account's copy has none)", () => {
    expect(matchesThisFlow(copy(READY, { partnerLabel: "민지" }), { ...READY, partnerLabel: "민지" })).toBe(true);
    expect(matchesThisFlow(copy(READY), { ...READY, partnerLabel: "민지" })).toBe(false);
    expect(matchesThisFlow(copy(READY, { concern: "연락" }), READY)).toBe(false);
    expect(matchesThisFlow(copy(READY, { relation: "lover" }), READY)).toBe(false);
    expect(matchesThisFlow(copy(READY, { kind: "newyear-2027" }), READY)).toBe(false);
    expect(matchesThisFlow(copy(READY), { ...READY, partner: { ...PARTNER, year: 2001 } })).toBe(true);
    expect(matchesThisFlow(copy(READY, { me: {} }), READY)).toBe(false);
    expect(matchesThisFlow(copy(READY), { ...READY, ack: undefined })).toBe(false);
  });
});
