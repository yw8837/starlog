// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { advanceProgress, premiumTeaserPlan, startProgress } from "./progress";
import { SAJU_TEASERS_KEY, clearTeasers, readTeaser, saveTeaser } from "./teaserCache";
import { isDeepTarotPreview, isMatchPreview, isNewYearPreview } from "./validate";

const card = { position: "지금의 나", cardId: "major-09-hermit", orientation: "upright", keyword: "멈춤" };
const section = { heading: "지금의 나", body: "본문이에요." };
const chart = { pillars: [{ label: "일주", gz: "甲子", ko: "갑자" }], elements: { 목: 2, 화: 1 }, dayMaster: { display: "甲 갑목", image: "큰 나무" } };
const DEEP = { cards: [card], now: section, lockedToc: ["한 줄 결론"] };
const MATCH = { facts: ["두 사람의 일간은 …"], charts: { me: chart, partner: chart }, cards: [card], summary: section, lockedToc: ["사주로 본 두 사람"] };
const YEAR = { title: "차근차근 쌓아 가는 해", facts: ["2027년은 丁未년이에요."], summary: section, lockedToc: ["1월"] };

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("premium previews in the browser", () => {
  it("checks each preview's shape before it is shown or kept", () => {
    expect(isDeepTarotPreview(DEEP)).toBe(true);
    expect(isDeepTarotPreview({ ...DEEP, cards: [{ ...card, cardId: "no-such-card" }] })).toBe(false);
    expect(isDeepTarotPreview({ ...DEEP, now: { body: "x" } })).toBe(false);
    expect(isMatchPreview(MATCH)).toBe(true);
    expect(isMatchPreview({ ...MATCH, charts: { me: chart } })).toBe(false);
    expect(isMatchPreview({ ...MATCH, charts: { me: chart, partner: { ...chart, elements: { 목: "둘" } } } })).toBe(false);
    expect(isNewYearPreview(YEAR)).toBe(true);
    expect(isNewYearPreview({ ...YEAR, facts: "x" })).toBe(false);
  });

  it("keeps the last premium preview for this tab apart from the standard tarot one, and forgets it with the rest", () => {
    saveTeaser("tarot", "t-key", { firstCard: section });
    saveTeaser("premium", "match|key", MATCH);
    expect(readTeaser("premium", "match|key", isMatchPreview)).toEqual(MATCH);
    // In this tab only (a 궁합's partner birth is in its key), never the device-wide saju list.
    expect(sessionStorage.getItem("starlog.teaser.premium")).toContain("match|key");
    expect(localStorage.getItem(SAJU_TEASERS_KEY)).toBeNull();
    expect(readTeaser("premium", "match|other", isMatchPreview)).toBeNull();
    expect(readTeaser("tarot", "t-key", (v): v is object => typeof v === "object")).toEqual({ firstCard: section });
    clearTeasers();
    expect(readTeaser("premium", "match|key", isMatchPreview)).toBeNull();
  });

  it("names what a preview is writing while it waits", () => {
    const plan = premiumTeaserPlan("tarot-deep");
    expect(advanceProgress(startProgress(plan), { type: "section", key: "now", index: 0 }, plan).caption).toBe("지금의 나를 적고 있어요");
    expect(premiumTeaserPlan("match").stages.map((s) => s.key)).toEqual(["summary"]);
    expect(premiumTeaserPlan("newyear-2027").stages.map((s) => s.key)).toEqual(["title", "summary"]);
  });
});
