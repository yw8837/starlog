import { describe, expect, it } from "vitest";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import {
  isDailyData,
  isDailyDeal,
  isFollowUpData,
  isSajuReadingResponse,
  isSajuTeaser,
  isTarotReading,
  isTarotReadingResponse,
  isTarotTeaser,
  partialTarotReading,
} from "./validate";

const SECTION = { heading: "h", body: "b" };
const READING = {
  verdict: "v",
  cards: [{ position: "나의 마음", cardId: "major-09-hermit", heading: "h", body: "b" }],
  connection: SECTION,
  timing: SECTION,
  observation: SECTION,
  scenarios: { heading: "h", items: [{ label: "l", body: "b" }] },
  messages: { heading: "h", items: ["m"], hint: "x" },
  avoid: { heading: "h", items: ["a"] },
  alternatives: SECTION,
  action: SECTION,
  followUps: ["q"],
};

describe("shape checks for what the reading API hands back (QA Q-02, Q-03)", () => {
  it("accepts whole answers, including the sample reading", () => {
    expect(isTarotReading(READING)).toBe(true);
    expect(isTarotReading({ ...TAROT_SAMPLE.paid, followUps: [] })).toBe(true);
    expect(isTarotReadingResponse({ reading: READING, chapterToken: "t" })).toBe(true);
    expect(isTarotTeaser({ cards: [{ position: "p", cardId: "major-17-star", keyword: "k" }], firstCard: SECTION, lockedToc: ["a"] })).toBe(true);
    expect(isSajuTeaser({ title: "t", summary: "s", lockedToc: [] })).toBe(true);
    expect(isSajuReadingResponse({ reading: { sections: [SECTION], observation: SECTION, followUps: [] }, chapterToken: "t" })).toBe(true);
    expect(isFollowUpData({ kind: "clarify", answer: "a", chapterToken: "t", remaining: 2 })).toBe(true);
    const daily = { card: { cardId: "major-19-sun", orientation: "upright", keyword: "k" }, summary: "s", body: "b", areas: { love: "", money: "", work: "" }, lucky: { color: "c", number: 3 }, tip: "t" };
    expect(isDailyData(daily)).toBe(true);
    expect(isDailyDeal({ deal: [{ index: 0 }, { index: 1 }, { index: 2 }] })).toBe(true);
  });

  it("takes a topic teaser's topic and freshUntil, and refuses an unknown topic", () => {
    expect(isSajuTeaser({ title: "t", summary: "s", lockedToc: [], topic: "money", freshUntil: "2026-11-01T03:00:00.000Z" })).toBe(true);
    expect(isSajuTeaser({ title: "t", summary: "s", lockedToc: [], topic: "health" })).toBe(false);
    expect(isSajuTeaser({ title: "t", summary: "s", lockedToc: [], freshUntil: 7 })).toBe(false);
  });

  it("refuses an empty done and every answer missing a part the screen needs", () => {
    for (const check of [isTarotReadingResponse, isTarotTeaser, isSajuTeaser, isSajuReadingResponse, isFollowUpData, isDailyData, isDailyDeal]) {
      expect(check({}), check.name).toBe(false);
      expect(check(null), check.name).toBe(false);
    }
    const { connection: _connection, ...noConnection } = READING;
    expect(isTarotReading(noConnection)).toBe(false);
    expect(isTarotReading({ ...READING, cards: [{ ...READING.cards[0], cardId: "major-99-nope" }] })).toBe(false);
    expect(isTarotReadingResponse({ reading: READING })).toBe(false);
    // A follow-up without a new token would make the stored reading unreadable.
    expect(isFollowUpData({ kind: "clarify", answer: "a", remaining: 2 })).toBe(false);
    expect(isFollowUpData({ kind: "clarify", answer: "", chapterToken: "t", remaining: 2 })).toBe(false);
  });

  it("reads what it can of a partial saved reading", () => {
    const parts = partialTarotReading({ verdict: "v", cards: [], action: SECTION });
    expect(parts).toMatchObject({ verdict: "v", cards: [], sections: [], action: SECTION, complete: false });
    expect(parts.scenarios).toBeUndefined();
    expect(partialTarotReading(READING).complete).toBe(true);
    expect(partialTarotReading(undefined)).toMatchObject({ cards: [], sections: [], complete: false });
  });
});
