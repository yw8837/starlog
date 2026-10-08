import { HAKDANG, STEMS, computeChart, sinsalOf } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { twelveStage } from "@/lib/ai/prompts/saju";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { GAEUN, GAEUN_NOTE, SAJU_NAMES_NONE, SINSAL_MEANINGS, gaeunLine, scarceElements, sinsalBasisLine } from "./sajuEnrichment";

// docs/superpowers/specs/2026-10-08-saju-enrichment-design.md §2, §5
const chartOf = (patch: Partial<SajuForm>) => computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch }));
const DOBI = chartOf({ year: 1988, month: 8, day: 15, timeKnown: true, hour: 10, minute: 22 }); // 甲辰 壬寅 庚申 戊辰

describe("name chips: the code-owned lines", () => {
  it("keeps the spec's one-line meanings word for word", () => {
    expect(SINSAL_MEANINGS).toEqual({
      천을귀인: "막힐 때 도움을 청하고 받는 데 마음이 열린 배치에 붙는 이름",
      문창귀인: "글과 말, 공부로 생각을 꺼내는 쪽에 붙는 이름",
      학당귀인: "배움이 자라기 쉬운 자리에 붙는 이름",
      도화: "사람의 시선을 끄는 매력과 표현에 붙는 이름",
      역마: "움직임과 변화에 열린 배치에 붙는 이름",
      화개: "혼자 깊이 파고드는 몰입에 붙는 이름",
    });
    for (const line of [...Object.values(SINSAL_MEANINGS), SAJU_NAMES_NONE]) expect(line).not.toMatch(/만나|나타나|생겨|조심|흉|운이|반드시/);
  });

  it("says where each of 도비's names was found, in plain words", () => {
    expect(sinsalOf(DOBI).map((s) => [s.name, sinsalBasisLine(s)])).toEqual([
      ["문창귀인", "일간 壬 기준 → 태어난 날 寅"],
      ["학당귀인", "일간 壬 기준 → 태어난 달 申"],
      ["역마", "태어난 해 辰 기준 → 태어난 날 寅 · 태어난 날 寅 기준 → 태어난 달 申"],
      ["화개", "태어난 해 辰 기준 → 태어난 시 辰"],
    ]);
  });

  it("finds 학당귀인 on the 장생 of the readings' own 12운성 (戊己 follow 丙丁)", () => {
    for (const stem of STEMS) expect([stem, twelveStage(stem, HAKDANG[stem]!)]).toEqual([stem, "장생"]);
  });
});

describe("개운: the scarcest element of the visible glyphs", () => {
  it("도비: 불 0, hidden in 寅 (丙), and the free line from the table", () => {
    expect(DOBI.elements).toEqual({ 목: 2, 화: 0, 토: 3, 금: 2, 수: 1 });
    expect(scarceElements(DOBI)).toEqual([{ element: "화", count: 0, hidden: true }]);
    expect(gaeunLine(scarceElements(DOBI))).toBe("곁에 두면 좋은 것: 빨강 포인트 · 낮 햇볕 10분");
  });

  it("two at 0 and in no 지장간 either (1975-03-07 09:00: 甲辰 壬子 己卯 乙卯): both candidates, neither hidden", () => {
    const c = chartOf({ year: 1975, month: 3, day: 7, timeKnown: true, hour: 9, minute: 0 });
    expect(scarceElements(c)).toEqual([{ element: "화", count: 0, hidden: false }, { element: "금", count: 0, hidden: false }]);
    expect(gaeunLine(scarceElements(c))).toBe("곁에 두면 좋은 것: 빨강·흰색 포인트 · 낮 햇볕 10분");
  });

  it("a tie at 1 (1987-09-09 09:30: 壬辰 辛酉 己酉 丁卯): all three, and hidden only ever for a 0", () => {
    const c = chartOf({ year: 1987, month: 9, day: 9, timeKnown: true, hour: 9, minute: 30 });
    expect(c.elements).toEqual({ 목: 1, 화: 1, 토: 2, 금: 3, 수: 1 });
    expect(scarceElements(c)).toEqual([{ element: "목", count: 1, hidden: false }, { element: "화", count: 1, hidden: false }, { element: "수", count: 1, hidden: false }]);
    expect(gaeunLine(scarceElements(c))).toBe("곁에 두면 좋은 것: 초록·빨강·검정 포인트 · 화분 가꾸기");
  });

  it("counts the six glyphs when the hour is unknown (the sample chart: 쇠 0, 庚 inside 巳)", () => {
    expect(scarceElements(chartOf({}))).toEqual([{ element: "금", count: 0, hidden: true }]);
    expect(gaeunLine(scarceElements(chartOf({})))).toBe("곁에 두면 좋은 것: 흰색 포인트 · 비우기·청소");
  });

  it("encodes the spec's table, and the fixed note", () => {
    expect(GAEUN).toEqual({
      목: { colours: ["초록", "청록"], direction: "동쪽", habits: ["화분 가꾸기", "숲길 산책", "스트레칭"], environment: ["창가에 식물 한 개"] },
      화: { colours: ["빨강", "주황"], direction: "남쪽", habits: ["낮 햇볕 10분", "땀 나는 걷기", "먼저 인사하기"], environment: ["따뜻한 색 조명"] },
      토: { colours: ["노랑", "베이지"], direction: "집 안 가운데", habits: ["정해진 시간 식사", "책상 정리"], environment: ["책상 위 한 칸 비우기"] },
      금: { colours: ["흰색", "은색", "회색"], direction: "서쪽", habits: ["비우기·청소", "정해 둔 마감", "천천히 호흡"], environment: ["물건 줄인 한 구역"] },
      수: { colours: ["검정", "남색"], direction: "북쪽", habits: ["물 자주 마시기", "반신욕", "충분한 잠"], environment: ["조용한 시간 한 칸"] },
    });
    expect(GAEUN_NOTE).toBe("오행 개수로 고른 재미로 보는 생활 제안이에요. 해 보고 안 맞으면 그만둬도 돼요.");
  });
});
