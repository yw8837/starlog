import { describe, expect, it } from "vitest";
import { DAY_MASTER_ARTICLES } from "@/lib/guide-articles/day-masters";
import { SAJU_CONCEPT_ARTICLES } from "@/lib/guide-articles/saju-concepts";
import { TAROT_BASICS_ARTICLES } from "@/lib/guide-articles/tarot-basics";
import { DAY_MASTER_TIPS, SAJU_CONCEPT_TIPS, TAROT_TIPS, TAROT_TIP_CARDS, sajuTipCards } from "./waitingTips";

const keyPointsOf = (articles: readonly { keyPoints?: readonly string[] }[]) => new Set(articles.flatMap((article) => article.keyPoints ?? []));

/**
 * The waiting screen's tips are copies of reviewed guide sentences (the guide modules stay out of the
 * client bundle): every line must still be a 핵심 정리 sentence of its article, word for word.
 */
describe("기다리는 동안 tips stay equal to the reviewed guide articles", () => {
  it("has each of the ten 일간 with exactly its article's three key points, in order", () => {
    const stems = ["갑목", "을목", "병화", "정화", "무토", "기토", "경금", "신금", "임수", "계수"];
    expect(Object.keys(DAY_MASTER_TIPS).sort()).toEqual([...stems].sort());
    for (const stem of stems) {
      const article = DAY_MASTER_ARTICLES.find((a) => a.title.startsWith(`${stem} 일간`));
      expect(article, stem).toBeDefined();
      expect(DAY_MASTER_TIPS[stem]).toEqual(article!.keyPoints);
      expect(DAY_MASTER_TIPS[stem]).toHaveLength(3);
    }
  });

  it("takes the saju concept lines from the saju concept articles only", () => {
    const reviewed = keyPointsOf(SAJU_CONCEPT_ARTICLES);
    expect(SAJU_CONCEPT_TIPS.length).toBeGreaterThan(5);
    for (const line of SAJU_CONCEPT_TIPS) expect(reviewed.has(line), line).toBe(true);
    expect(new Set(SAJU_CONCEPT_TIPS).size).toBe(SAJU_CONCEPT_TIPS.length);
  });

  it("takes the tarot lines from the tarot basics articles only", () => {
    const reviewed = keyPointsOf(TAROT_BASICS_ARTICLES);
    expect(TAROT_TIPS.length).toBeGreaterThan(5);
    for (const line of TAROT_TIPS) expect(reviewed.has(line), line).toBe(true);
    expect(new Set(TAROT_TIPS).size).toBe(TAROT_TIPS.length);
  });

  it("deals the saju cards with the user's own 일간 first (one key point a card, the stem as the title), then 사주 상식", () => {
    const concepts = SAJU_CONCEPT_TIPS.map((text) => ({ label: "사주 상식", text }));
    expect(sajuTipCards({ stem: "丙", ko: "병화" })).toEqual([...DAY_MASTER_TIPS["병화"]!.map((text) => ({ label: "내 일간", title: "丙 병화", text })), ...concepts]);
    expect(sajuTipCards(undefined)).toEqual(concepts);
  });

  it("deals one 타로 상식 card per tarot line", () => {
    expect(TAROT_TIP_CARDS).toEqual(TAROT_TIPS.map((text) => ({ label: "타로 상식", text })));
  });

  it("keeps few enough cards that their dots fit a 360px phone (24px each)", () => {
    // the 지금 적는 중 card, then the tips
    expect(1 + sajuTipCards({ stem: "甲", ko: "갑목" }).length).toBeLessThanOrEqual(12);
    expect(1 + TAROT_TIP_CARDS.length).toBeLessThanOrEqual(12);
  });
});
