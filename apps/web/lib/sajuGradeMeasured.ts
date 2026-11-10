/**
 * What `pnpm grade:table` measured for 사주 등급 rule v1 (scripts/saju-grade-report.test.ts, run 2026-11-11), shown as they are on
 * /saju/grade/how (spec 2026-11-11 A7, 확정 사항 4). Copied from the run's output, never tuned; lib/sajuGradeMeasured.test.ts
 * scores both populations again and checks every number here.
 */

export type DayMasterElement = "목" | "화" | "토" | "금" | "수";
/** S, A, B, C shares of one day master's charts in one 세운, percent to one decimal */
export type GradeShares = readonly [number, number, number, number];

export interface MeasuredPopulation {
  size: number;
  /** fewest distinct scores in one 세운 */
  minDistinctScores: number;
  /** largest share of one score in one 세운, % (two decimals) */
  maxTie: number;
  /** largest gap between a grade's share and its target (8/22/40/30), %p (two decimals) */
  maxGapFromTarget: number;
  /** charts with C in all ten years of some 10-year window */
  allCTenYears: number;
  /** most charts, over every 10-year window, with no S or A in it, % */
  noBrightTenYears: number;
  /** fewest charts, over every 10-year window, with an S in it, % */
  someSTenYears: number;
  /** S share over all 60 세운, by day master 목화토금수, % */
  meanS: readonly [number, number, number, number, number];
  /** charts that get 1, 2, 3 or 4 different grades over the 60 세운, % */
  kinds: readonly [number, number, number, number];
  /** charts with no S or A in all 60 세운 */
  neverBright: number;
  /** 2026 丙午, 2027 丁未, 2028 戊申: S/A/B/C by day master */
  years: Readonly<Record<2026 | 2027 | 2028, Readonly<Record<DayMasterElement, GradeShares>>>>;
}

export const GRADE_MEASURED: Readonly<Record<"known" | "unknown", MeasuredPopulation>> = {
  known: {
    size: 561_600,
    minDistinctScores: 78,
    maxTie: 6.6,
    maxGapFromTarget: 2.79,
    allCTenYears: 0,
    noBrightTenYears: 8.4,
    someSTenYears: 39.0,
    meanS: [9.3, 9.4, 6.6, 8.9, 9.0],
    kinds: [0.0, 0.0, 23.9, 76.1],
    neverBright: 16,
    years: {
      2026: { 목: [10.0, 24.8, 40.0, 25.1], 화: [0.0, 9.9, 39.7, 50.4], 토: [9.8, 28.0, 39.7, 22.6], 금: [11.9, 25.2, 37.8, 25.1], 수: [14.1, 27.0, 34.2, 24.7] },
      2027: { 목: [12.0, 25.7, 41.9, 20.4], 화: [3.7, 11.9, 37.6, 46.8], 토: [3.5, 17.5, 43.1, 36.0], 금: [10.1, 26.6, 42.5, 20.7], 수: [13.9, 26.3, 39.9, 19.9] },
      2028: { 목: [13.3, 28.8, 38.1, 19.7], 화: [10.3, 26.7, 40.5, 22.5], 토: [3.2, 20.2, 42.1, 34.5], 금: [2.8, 10.6, 37.2, 49.5], 수: [10.8, 26.3, 41.5, 21.4] },
    },
  },
  unknown: {
    size: 43_200,
    minDistinctScores: 71,
    maxTie: 5.6,
    maxGapFromTarget: 3.1,
    allCTenYears: 0,
    noBrightTenYears: 11.6,
    someSTenYears: 39.7,
    meanS: [9.4, 9.6, 7.2, 9.7, 9.7],
    kinds: [0.0, 1.3, 31.5, 67.2],
    neverBright: 0,
    years: {
      2026: { 목: [10.8, 26.9, 41.7, 20.6], 화: [0.0, 2.2, 39.8, 57.9], 토: [8.2, 29.0, 43.4, 19.4], 금: [11.0, 26.7, 40.8, 21.5], 수: [11.6, 24.4, 43.4, 20.6] },
      2027: { 목: [12.3, 28.6, 41.9, 17.2], 화: [2.0, 10.3, 36.3, 51.4], 토: [2.4, 13.4, 43.2, 40.9], 금: [13.1, 27.3, 41.8, 17.8], 수: [12.7, 28.4, 39.0, 19.9] },
      2028: { 목: [12.6, 29.4, 37.7, 20.3], 화: [12.8, 26.8, 43.8, 16.6], 토: [2.6, 15.2, 41.1, 41.1], 금: [1.7, 12.2, 36.5, 49.6], 수: [12.1, 28.8, 41.9, 17.3] },
    },
  },
};
