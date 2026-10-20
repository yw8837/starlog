import { describe, expect, it } from "vitest";
import { advanceProgress, premiumFraction, premiumProgressPlans, premiumSteps, startProgress, timeFraction, waitLine } from "./progress";

const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
const POSITIONS = ["지금의 나", "가로막는 것", "바탕", "지나온 것", "바라는 것", "다가올 것", "나의 태도", "주변", "바람과 걱정", "결과의 방향"];

describe("premium progress", () => {
  it("names each part's stages and never moves backwards", () => {
    const plans = premiumProgressPlans("newyear-2027", { months: MONTHS });
    expect(plans).toHaveLength(3);
    let state = startProgress(plans[1]!);
    expect(state.caption).toBe("1월부터 6월까지 적고 있어요");
    state = advanceProgress(state, { type: "section", key: "firstHalf", index: 3 }, plans[1]!);
    expect(state.caption).toBe("4월을 적고 있어요");
    expect(advanceProgress(state, { type: "section", key: "firstHalf", index: 1 }, plans[1]!).caption).toBe("4월을 적고 있어요");
    expect(advanceProgress(startProgress(plans[2]!), { type: "section", key: "secondHalf", index: 0 }, plans[2]!).caption).toBe("7월을 적고 있어요");
  });

  it("has one plan per part, the ten positions in the deep reading's first, the five cards in the 궁합's second", () => {
    const deep = premiumProgressPlans("tarot-deep", { positions: POSITIONS });
    expect(deep).toHaveLength(2);
    expect(deep[0]!.stages.filter((s) => s.key === "positions")).toHaveLength(10);
    expect(advanceProgress(startProgress(deep[0]!), { type: "section", key: "positions", index: 9 }, deep[0]!).caption).toBe("결과의 방향 카드를 읽고 있어요");
    // saju only (owner 2026-10-17): part 2 is the year in four bands and how to treat each other, no cards
    const match = premiumProgressPlans("match");
    expect(match).toHaveLength(2);
    expect(match[1]!.stages.filter((s) => s.key === "periods")).toHaveLength(4);
    expect(match[1]!.stages.map((s) => s.key)).toEqual(["verdict", "periods", "periods", "periods", "periods", "together", "avoid", "action", "observation", "followUps"]);
    expect(JSON.stringify(match)).not.toContain("카드");
    expect(advanceProgress(startProgress(match[1]!), { type: "section", key: "periods", index: 3 }, match[1]!).caption).toBe("마지막 석 달을 적고 있어요");
    // the new year months default to 1월~12월
    expect(premiumProgressPlans("newyear-2027")[2]!.stages.filter((s) => s.key === "secondHalf")).toHaveLength(6);
  });

  it("fills the bar across parts and lists the parts as steps", () => {
    expect(premiumFraction(1, 3, { caption: "", fraction: 0.5, reached: 2 })).toBeCloseTo(0.5);
    expect(premiumFraction(3, 3, { caption: "", fraction: 1, reached: 2 })).toBe(1);
    expect(premiumSteps("newyear-2027", 1)).toEqual([
      { label: "한 해의 큰 흐름", state: "done" },
      { label: "1월~6월", state: "now" },
      { label: "7월~12월", state: "later" },
    ]);
  });

  it("keeps the whole reading's clock: the product's usual minutes, then twice that at most", () => {
    expect(waitLine("premium-newyear-2027", 30_000)).toBe("30초째 · 보통 4분 안팎");
    expect(waitLine("premium-tarot-deep", 4 * 60_000)).toBe("4분째 · 조금 더 걸리고 있어요. 길게는 6분까지 걸려요");
    expect(timeFraction("premium-match", 3 * 60_000)).toBeCloseTo(0.9);
  });
});
