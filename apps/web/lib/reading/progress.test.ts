import { describe, expect, it } from "vitest";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { TOPIC_SECTIONS } from "@/lib/sajuTopics";
import { advanceProgress, checklist, progressPlan, startProgress, timeFraction, waitLine, type GenerationKind } from "./progress";

const KINDS: GenerationKind[] = ["saju-reading", "tarot-reading", "saju-teaser", "tarot-teaser", "daily"];
const positions = ["지금의 나", "필요한 것", "이 시기의 흐름"];

describe("time-based progress (the bar creeps while the model thinks)", () => {
  it("starts at zero, only grows, and never reaches the end on its own", () => {
    for (const kind of KINDS) {
      expect(timeFraction(kind, 0)).toBe(0);
      let last = 0;
      for (let second = 1; second <= 900; second++) {
        const now = timeFraction(kind, second * 1000);
        expect(now).toBeGreaterThanOrEqual(last);
        expect(now).toBeLessThan(1);
        last = now;
      }
      expect(timeFraction(kind, 3_600_000)).toBeLessThanOrEqual(0.95);
    }
  });

  it("sits near 0.9 at each kind's usual length (measured: saju ~2분, tarot ~1분, teasers and 오늘의 한 장 ~10초)", () => {
    expect(timeFraction("saju-reading", 150_000)).toBeCloseTo(0.9, 3);
    expect(timeFraction("tarot-reading", 65_000)).toBeCloseTo(0.9, 3);
    for (const kind of ["saju-teaser", "tarot-teaser", "daily"] as const) expect(timeFraction(kind, 15_000)).toBeCloseTo(0.9, 3);
    // the saju reading's first minute (the model thinking) no longer looks frozen
    expect(timeFraction("saju-reading", 45_000)).toBeGreaterThan(0.4);
  });
});

describe("the line under the bar", () => {
  it("counts the time in 초/분 and says the usual length", () => {
    expect(waitLine("saju-reading", 0)).toBe("보통 2분 안팎");
    expect(waitLine("saju-reading", 999)).toBe("보통 2분 안팎");
    expect(waitLine("saju-reading", 38_400)).toBe("38초째 · 보통 2분 안팎");
    expect(waitLine("saju-reading", 72_000)).toBe("1분 12초째 · 보통 2분 안팎");
    expect(waitLine("saju-reading", 120_000)).toBe("2분째 · 보통 2분 안팎");
    expect(waitLine("tarot-reading", 30_000)).toBe("30초째 · 보통 1분 안팎");
    for (const kind of ["saju-teaser", "tarot-teaser", "daily"] as const) expect(waitLine(kind, 9_000)).toBe("9초째 · 보통 10초 안팎");
  });

  it("past the usual length says calmly that it is taking a bit longer, and past the longest drops the promise", () => {
    expect(waitLine("saju-reading", 151_000)).toBe("2분 31초째 · 조금 더 걸리고 있어요. 길게는 3분까지 걸려요");
    expect(waitLine("saju-reading", 185_000)).toBe("3분 5초째 · 조금 더 걸리고 있어요");
    expect(waitLine("tarot-reading", 70_000)).toBe("1분 10초째 · 조금 더 걸리고 있어요. 길게는 2분까지 걸려요");
    expect(waitLine("tarot-reading", 125_000)).toBe("2분 5초째 · 조금 더 걸리고 있어요");
    for (const kind of ["saju-teaser", "tarot-teaser", "daily"] as const) {
      expect(waitLine(kind, 16_000)).toBe("16초째 · 조금 더 걸리고 있어요. 길게는 30초까지 걸려요");
      expect(waitLine(kind, 31_000)).toBe("31초째 · 조금 더 걸리고 있어요");
    }
  });
});

describe("the checklist of a full reading", () => {
  it("names the saju sections by their short names, then 한눈에 보기", () => {
    const steps = checklist(progressPlan("saju-reading", { sections: SAJU_PROLOGUE_SECTIONS }), -1);
    expect(steps.map((step) => step.label)).toEqual([
      "타고난 바탕",
      "많은 기운·적은 기운",
      "나를 움직이는 힘",
      "가까운 관계 속 나",
      "일할 때·쉴 때",
      "지금의 10년과 올해",
      "이름표 풀이",
      "기운 채우기",
      "계산 기준",
      "한눈에 보기",
    ]);
    const love = checklist(progressPlan("saju-reading", { sections: TOPIC_SECTIONS.love }), -1);
    expect(love.map((step) => step.label)).toEqual([...TOPIC_SECTIONS.love.map((heading) => heading.split(" · ")[0]), "한눈에 보기"]);
  });

  it("groups the tarot reading's many parts into a few readable steps, the cards by position", () => {
    const steps = checklist(progressPlan("tarot-reading", { positions }), -1);
    expect(steps.map((step) => step.label)).toEqual(["지금의 나 카드", "필요한 것 카드", "이 시기의 흐름 카드", "세 장의 연결과 시기", "흘러갈 갈래", "건넬 말과 피할 것", "오늘 해 볼 일"]);
  });

  it("ticks the steps written, lights the one being written, dims the rest; a retry never takes a tick back", () => {
    const plan = progressPlan("tarot-reading", { positions });
    const states = (reached: number) => checklist(plan, reached).map((step) => step.state);
    let state = startProgress(plan);
    // the model is thinking: the first step is the one coming
    expect(states(state.reached)).toEqual(["now", "later", "later", "later", "later", "later", "later"]);
    state = advanceProgress(state, { type: "section", key: "verdict", index: 0 }, plan);
    expect(states(state.reached)).toEqual(["now", "later", "later", "later", "later", "later", "later"]);
    state = advanceProgress(state, { type: "section", key: "cards", index: 1 }, plan);
    expect(states(state.reached)).toEqual(["done", "now", "later", "later", "later", "later", "later"]);
    state = advanceProgress(state, { type: "section", key: "avoid", index: 0 }, plan);
    const before = states(state.reached);
    expect(before).toEqual(["done", "done", "done", "done", "done", "now", "later"]);
    state = advanceProgress(state, { type: "retry" }, plan);
    state = advanceProgress(state, { type: "section", key: "verdict", index: 0 }, plan);
    expect(states(state.reached)).toEqual(before);
    // written to the end
    expect(new Set(states(plan.stages.length))).toEqual(new Set(["done"]));
  });

  it("has none for the teasers and 오늘의 한 장", () => {
    expect(checklist(progressPlan("tarot-teaser", { positions }), 0)).toEqual([]);
    expect(checklist(progressPlan("saju-teaser"), 0)).toEqual([]);
    expect(checklist(progressPlan("daily"), 0)).toEqual([]);
  });
});
