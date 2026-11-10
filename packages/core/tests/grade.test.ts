import { describe, expect, it } from "vitest";
import {
  BRANCHES, GRADE_POPULATION, SAJU_GRADE_RULE, SIXTY_GANZHI, STEMS, adjacentPairs, computeChart, flowOf, forEachGradeChart, gradeChartOf,
  gradeCuts, gradeOf, gradeScore, seunAt, solarTermsOfYear, yearScores, type GradeChart,
} from "../src";

// spec 2026-11-11-saju-grade-card-design.md A3: score = 18×고르기 g + 12×흐름 f + 70×올해 순위 r, rounded to a whole number.
// Elements in 상생 order 목 화 토 금 수. With n glyphs, D = Σ|5·c − n| (five times the spec's dev, so it stays a whole number):
//   n=6: most even [2,1,1,1,1] D=8, all in one D=48 → g = 1 − (D−8)/40
//   n=8: most even [2,2,2,1,1] D=12, all in one D=64 → g = 1 − (D−12)/52
//   n=10: most even [2,2,2,2,2] D=0, all in one D=80 → g = 1 − D/80
// f: neighbouring glyphs (stems left-right, branches left-right, each pillar top-bottom), 상생 1, same element 0.5, 상극 0.
// m(Y) = 30·clamp((g' − g + 0.2)/0.5, 0, 1) + 20·(상생 고리 after − before)/2, g' with the 세운's two glyphs added; a 상생
// 고리 is two neighbouring elements of the cycle that both stand.
// r(Y) = (years with a smaller m + (years with the same m − 1)/2) / 59. A 세운's m depends only on its two elements, and over
// the 60 years each stem element meets branch 수 2, 목 2, 토 4, 화 2, 금 2 times (yang stems take yang branches), so stem
// element x with branch element y comes 4 times when y is 토, else 2.
const chart = (stems: string, branches: string): GradeChart => ({ stems: [...stems], branches: [...branches] });
const at = (gz: string) => SIXTY_GANZHI.indexOf(gz);
const seoul = { name: "서울", longitude: 126.978 };

describe("v1 rule, three charts worked by hand", () => {
  it("names the rule", () => {
    expect(SAJU_GRADE_RULE).toEqual({ id: "starlog-grade-v1", date: "2026-11-11" });
  });

  it("A: 甲子 丁卯 己巳 辛未 (time known), evenly spread and every neighbour 상생", () => {
    // counts 목2(甲卯) 화2(丁巳) 토2(己未) 금1(辛) 수1(子): the most even split of 8, D=12 → g = 1.
    // pairs: stems 甲丁 丁己 己辛, branches 子卯 卯巳 巳未, pillars 甲子 丁卯 己巳 辛未: all ten 상생 → f = 10/10 = 1.
    // natal part 18·1 + 12·1 = 30. All five elements stand, so a 세운 never adds a 상생 고리: m is the g' term only.
    //   금 and 수 raised once each → [2,2,2,2,2] D'=0, g'=1, (0+0.2)/0.5 = 0.4 → m = 12. Years: 금 stem·수 branch 2 + 수·금 2 = 4.
    //   one 1 raised twice, or a 1 and a 2 → D'=10, g'=0.875, (−0.125+0.2)/0.5 = 0.15 → m = 4.5.
    //     Years: 금금 2, 수수 2, stem 금/수 × branch 목화토 2·(2+2+4) = 16, stem 목화토 × branch 금/수 3·(2+2) = 12 → 32.
    //   two of 목화토 raised → D'=20, g'=0.75, (−0.25+0.2) < 0 → m = 0. Years: 3·(2+2+4) = 24.
    // ranks: m=0 → (0+11.5)/59, m=4.5 → (24+15.5)/59, m=12 → (56+1.5)/59.
    // scores: 30 + 70·11.5/59 = 43.64 → 44; 30 + 70·39.5/59 = 76.86 → 77; 30 + 70·57.5/59 = 98.22 → 98.
    const a = chart("甲丁己辛", "子卯巳未");
    expect(flowOf(a)).toBe(1);
    const scores = yearScores(a);
    expect(scores[at("丙午")]).toBe(44); // 2026: 화화, two 2s raised
    expect(scores[at("丁未")]).toBe(44); // 2027: 화토
    expect(scores[at("戊申")]).toBe(77); // 2028: 토금
    expect(scores[at("庚子")]).toBe(98); // 2020: 금수
    expect([44, 77, 98].map((s) => scores.filter((x) => x === s).length)).toEqual([24, 32, 4]);
    expect(gradeScore(a, "庚子")).toEqual({ score: 98, balance: 1, flow: 1, fit: 12, rank: 57.5 / 59 });
  });

  it("B: 丙午 甲午 丙寅 (time unknown), fire-heavy with no 토금수", () => {
    // counts 목2(甲寅) 화4(丙午午丙), n=6: D = |10−6| + |20−6| + 6+6+6 = 36 → g = 1 − 28/40 = 0.3.
    // 7 pairs: 丙甲 1, 甲丙 1, 午午 0.5, 午寅 1, 丙午 0.5, 甲午 1, 丙寅 1 → f = 6/7. natal part 5.4 + 72/7 = 15.6857.
    // 상생 고리 before: only 목화 → 1. n'=8, g' = 1 − (D'−12)/52.
    //   목목·목화·화화: D'=48, g'=0.3077, 30·(0.0077+0.2)/0.5 = 12.46, no new 고리 → 12.46. Years 2+4+2 = 8.
    //   목금·화금: D'=38, g'=0.5 → 24, no new 고리 → 24. Years 4+4 = 8.
    //   금금: D'=32, g'=0.6154 → clamp → 30, no new 고리 → 30. Years 2.
    //   목토·화토·목수·화수: D'=38 → 24, one new 고리 → +10 = 34. Years 6+6+4+4 = 20.
    //   토토·수수: D'=32 → 30, one new 고리 → 40. Years 4+2 = 6.
    //   토금·토수·금수: D'=28 → 30, two new 고리 → +20 = 50. Years 6+6+4 = 16.
    // ranks /59: 3.5, 11.5, 16.5, 27.5, 40.5, 51.5 → scores 15.6857 + 70·rank:
    //   19.84 → 20, 29.33 → 29, 35.26 → 35, 48.31 → 48, 63.74 → 64, 76.79 → 77.
    const b = chart("丙甲丙", "午午寅");
    expect(adjacentPairs(b)).toHaveLength(7);
    expect(flowOf(b)).toBeCloseTo(6 / 7, 12);
    const scores = yearScores(b);
    expect(scores[at("丙午")]).toBe(20); // 2026 화화
    expect(scores[at("甲寅")]).toBe(20); // 2034 목목
    expect(scores[at("庚午")]).toBe(29); // 금화
    expect(scores[at("庚申")]).toBe(35); // 금금
    expect(scores[at("丁未")]).toBe(48); // 2027 화토
    expect(scores[at("壬子")]).toBe(64); // 2032 수수
    expect(scores[at("戊申")]).toBe(77); // 2028 토금
    expect([20, 29, 35, 48, 64, 77].map((s) => scores.filter((x) => x === s).length)).toEqual([8, 8, 2, 20, 6, 16]);
  });

  it("C: 庚申 己丑 戊子 丁巳 (time known), no 목 and two 상극 neighbours", () => {
    // counts 목0 화2(丁巳) 토3(己丑戊) 금2(庚申) 수1(子): D = 8+2+7+2+3 = 22 → g = 1 − 10/52 = 21/26 = 0.8077.
    // pairs: stems 庚己 1, 己戊 0.5, 戊丁 1; branches 申丑 1, 丑子 0 (토剋수), 子巳 0 (수剋화);
    //        pillars 庚申 0.5, 己丑 0.5, 戊子 0, 丁巳 0.5 → f = 5/10 = 0.5. natal part 18·21/26 + 6 = 20.5385.
    // 상생 고리 before: 화토 토금 금수 → 3. n'=10, g' = 1 − D'/80.
    //   목목·목수: D'=10, g'=0.875, 30·(0.0673+0.2)/0.5 = 16.04, 목 completes the ring (+2 고리) → 36.04. Years 2+4 = 6.
    //   목화·목토·목금: D'=20, g'=0.75 → 8.54, +2 고리 → 28.54. Years 4+6+4 = 14.
    //   화수·토수·금수·수수: D'=20 → 8.54, no new 고리 → 8.54. Years 4+6+4+2 = 16.
    //   화화·화토·화금·토토·토금·금금: D'=30, g'=0.625 → 1.04, no new 고리 → 1.04. Years 2+6+4+4+6+2 = 24.
    // ranks /59: 11.5, 31.5, 46.5, 56.5 → scores 20.5385 + 70·rank: 34.18 → 34, 57.91 → 58, 75.71 → 76, 87.57 → 88.
    const c = chart("庚己戊丁", "申丑子巳");
    expect(flowOf(c)).toBe(0.5);
    const scores = yearScores(c);
    expect(scores[at("丙午")]).toBe(34); // 2026
    expect(scores[at("丁未")]).toBe(34); // 2027
    expect(scores[at("戊申")]).toBe(34); // 2028
    expect(scores[at("壬子")]).toBe(58); // 2032
    expect(scores[at("甲辰")]).toBe(76); // 2024 목토
    expect(scores[at("甲寅")]).toBe(88); // 2034 목목
    expect([34, 58, 76, 88].map((s) => scores.filter((x) => x === s).length)).toEqual([24, 16, 14, 6]);
  });
});

describe("what the rule reads from a chart", () => {
  it("uses the visible glyphs only: 8 and 10 pairs with the hour, 6 and 7 pairs without", () => {
    const known = gradeChartOf(computeChart({ calendar: "solar", year: 1990, month: 5, day: 15, time: { hour: 14, minute: 30 }, gender: "female", place: seoul }));
    const unknown = gradeChartOf(computeChart({ calendar: "solar", year: 1990, month: 5, day: 15, time: null, gender: "female", place: seoul }));
    expect([known.stems.length, known.branches.length, adjacentPairs(known).length]).toEqual([4, 4, 10]);
    expect([unknown.stems.length, unknown.branches.length, adjacentPairs(unknown).length]).toEqual([3, 3, 7]);
    expect(unknown.stems).toEqual(known.stems.slice(0, 3));
  });

  it("is deterministic: the same chart gives the same 60 scores every time", () => {
    const c = chart("庚己戊丁", "申丑子巳");
    expect(yearScores(c)).toEqual(yearScores(chart("庚己戊丁", "申丑子巳")));
    expect(yearScores(c)).toHaveLength(60);
  });

  it("takes the 세운 at 입춘 (KST)", () => {
    const ipchun = Date.parse(solarTermsOfYear(2026).find((t) => t.name === "입춘")!.instantUTC);
    expect(seunAt(ipchun - 60_000)).toEqual({ year: 2025, gz: "乙巳" });
    expect(seunAt(ipchun)).toEqual({ year: 2026, gz: "丙午" });
    expect(seunAt(Date.parse("2026-12-31T23:00:00+09:00"))).toEqual({ year: 2026, gz: "丙午" });
    expect(seunAt(Date.parse("2027-01-01T00:30:00+09:00"))).toEqual({ year: 2026, gz: "丙午" });
  });
});

describe("population (A6)", () => {
  it("the engine gives 13 hour pillars a day: 23:00–24:00 takes the next day's stem (SPLIT_NEXT_DAY_STEM)", () => {
    // Seoul LMT is about 32 minutes behind KST: 23:50 KST is 23:17 on the corrected clock.
    const late = computeChart({ calendar: "solar", year: 2024, month: 3, day: 10, time: { hour: 23, minute: 50 }, gender: "female", place: seoul });
    const early = computeChart({ calendar: "solar", year: 2024, month: 3, day: 10, time: { hour: 0, minute: 50 }, gender: "female", place: seoul });
    expect(late.policy.jasi).toBe("SPLIT_NEXT_DAY_STEM");
    expect([late.pillars.day.stem + late.pillars.day.branch, late.pillars.hour!.stem + late.pillars.hour!.branch]).toEqual(["癸酉", "甲子"]);
    expect([early.pillars.day.stem + early.pillars.day.branch, early.pillars.hour!.stem + early.pillars.hour!.branch]).toEqual(["癸酉", "壬子"]);
  });

  it("counts 60 × 12 × 60 × 13 = 561,600 charts with the hour and 43,200 without, each once, the 야자시 ones included", () => {
    const key = (g: GradeChart) => g.stems.map((s, i) => s + g.branches[i]).join(" ");
    const known = new Set<string>();
    forEachGradeChart(true, (g) => known.add(key(g)));
    const unknown = new Set<string>();
    forEachGradeChart(false, (g) => unknown.add(key(g)));
    expect([known.size, unknown.size]).toEqual([GRADE_POPULATION.hourKnown, GRADE_POPULATION.hourUnknown]);
    expect([GRADE_POPULATION.hourKnown, GRADE_POPULATION.hourUnknown]).toEqual([561_600, 43_200]);
    expect(known.has("甲辰 丁卯 癸酉 甲子")).toBe(true); // 2024-03-10 23:50, the engine's 야자시
    expect(known.has("甲辰 丁卯 癸酉 壬子")).toBe(true);
    // every chart the engine computes is in the population (month stems by 오호둔, hour stems by 오서둔 and 야자시)
    for (let i = 0; i < 300; i++) {
      const time = i % 4 === 0 ? null : { hour: (i * 7) % 24, minute: (i * 13) % 60 };
      const c = computeChart({ calendar: "solar", year: 1901 + ((i * 37) % 199), month: 1 + (i % 12), day: 1 + ((i * 11) % 28), time, gender: "male", place: seoul });
      expect((time ? known : unknown).has(key(gradeChartOf(c))), key(gradeChartOf(c))).toBe(true);
    }
  });
});

describe("grade cuts (A3: top 8% S, to 30% A, to 70% B, the rest C; ties share a grade)", () => {
  it("cuts a score histogram by the share strictly above each score", () => {
    const counts = Array<number>(101).fill(0);
    // 100 charts: 5 at 90, 5 at 80 (10 above 70 … ), 20 at 70, 40 at 50, 30 at 10
    counts[90] = 5; counts[80] = 5; counts[70] = 20; counts[50] = 40; counts[10] = 30;
    // above 90: 0% → S; above 80: 5% → S; above 70: 10% → A; above 50: 30% → B; above 10: 70% → C
    expect(gradeCuts(counts)).toEqual([80, 70, 50]);
    expect([95, 80, 79, 70, 50, 49, 10].map((s) => gradeOf(s, [80, 70, 50]))).toEqual(["S", "S", "A", "A", "B", "C", "C"]);
  });

  it("lets a tie that crosses a line keep the higher grade", () => {
    const counts = Array<number>(101).fill(0);
    counts[60] = 50; counts[40] = 50; // above 60: 0% → all 50 are S; above 40: 50% → B; no A this time
    expect(gradeCuts(counts)).toEqual([60, 60, 40]);
    expect([60, 59, 40].map((s) => gradeOf(s, [60, 60, 40]))).toEqual(["S", "B", "B"]);
  });

  it("each stem pairs only with its own parity of branch", () => {
    expect(SIXTY_GANZHI.slice(0, 3)).toEqual(["甲子", "乙丑", "丙寅"]);
    expect(SIXTY_GANZHI[42]).toBe("丙午");
    expect(new Set(SIXTY_GANZHI).size).toBe(60);
    expect(SIXTY_GANZHI.every((gz) => STEMS.indexOf(gz[0] as never) % 2 === BRANCHES.indexOf(gz[1] as never) % 2)).toBe(true);
  });
});
