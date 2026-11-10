// 올해의 사주 등급, rule v1 (spec docs/superpowers/specs/2026-11-11-saju-grade-card-design.md A2–A7): a rule card, no model.
// It reads only the visible glyphs (8, or 6 with the hour unknown; no 지장간), the five elements and their 상생 order, and the
// 세운 taken at 입춘. No 신강·신약, 용신, 격국, 조후, 합화, 대운, and no 합·충 (A8).
// Sources (zh.wikisource, read 2026-11-11; docs/research/saju-tables-sources-2026-11.md):
// - element of each glyph: labels.ts, as 五行大義 卷二 第五 論配支幹 ("戊己辰戌丑未。土也").
// - 상생·상극: 五行大義 卷二 第四 論相生 ("木生火。火生土"), 第十 論相剋.
// - 월간 오호둔, 시간 오서둔: 三命通會 卷二 論遁月時 ("甲己之年丙作首", "甲己還加甲").
// - 흐름 looks at neighbours, after 滴天髓 地支論 "上下貴乎情協" (… "左右貴乎志同"); scoring 상생 pairs is our reading.
// - 고르기 (an even spread) is our simplification of 中和, which the classics judge by the day master's strength.
// - the 입춘 year boundary and the 23:00 split (야자시) are the engine's policy (P2, P4); 출처 미확인.
// - ranking a year within the chart's own 60 years is our rule; no classical source.

import { getSolarTerm } from "manseryeok";
import type { SajuChart } from "./chart";
import { BRANCHES, BRANCH_ELEMENTS, STEMS, STEM_ELEMENTS, type SajuElement } from "./labels";

export const SAJU_GRADE_RULE = { id: "starlog-grade-v1", date: "2026-11-11" } as const;

export const GRADE_LETTERS = ["S", "A", "B", "C"] as const;
export type GradeLetter = (typeof GRADE_LETTERS)[number];
/** Where A, B and C begin: the share of the population strictly above a score, in percent (S top 8, A to 30, B to 70). */
export const GRADE_TOP_PERCENT = [8, 30, 70] as const;
/** [lowest S score, lowest S-or-A score, lowest S-to-B score] for one 세운 */
export type GradeCuts = readonly [number, number, number];

/** The combinations counted with the same weight (A6): 연 60 × 월 12 × 일 60 × 시 13 (야자시 included), and without the hour. */
export const GRADE_POPULATION = { hourKnown: 60 * 12 * 60 * 13, hourUnknown: 60 * 12 * 60 } as const;

/** 甲子 … 癸亥: a 세운 is indexed by its place here. */
export const SIXTY_GANZHI: readonly string[] = Array.from({ length: 60 }, (_, i) => STEMS[i % 10]! + BRANCHES[i % 12]!);

/** The year pillar of a Gregorian year (the 세운 from its 입춘). */
export const ganzhiOfYear = (year: number): string => SIXTY_GANZHI[(((year - 1984) % 60) + 60) % 60]!;

/** The glyphs the rule reads, pillar order year, month, day(, hour). */
export interface GradeChart {
  stems: string[];
  branches: string[];
}

export function gradeChartOf(chart: Pick<SajuChart, "pillars">): GradeChart {
  const { year, month, day, hour } = chart.pillars;
  const pillars = hour ? [year, month, day, hour] : [year, month, day];
  return { stems: pillars.map((p) => p.stem), branches: pillars.map((p) => p.branch) };
}

const ELEMENTS: readonly SajuElement[] = ["목", "화", "토", "금", "수"];
const STEM_EL = STEM_ELEMENTS.map((e) => ELEMENTS.indexOf(e));
const BRANCH_EL = BRANCH_ELEMENTS.map((e) => ELEMENTS.indexOf(e));
const stemEl = (stem: string) => STEM_EL[STEMS.indexOf(stem as (typeof STEMS)[number])]!;
const branchEl = (branch: string) => BRANCH_EL[BRANCHES.indexOf(branch as (typeof BRANCHES)[number])]!;

export function elementCountsOf(chart: GradeChart): Record<SajuElement, number> {
  const counts = countsOf(chart);
  return Object.fromEntries(ELEMENTS.map((e, i) => [e, counts[i]!])) as Record<SajuElement, number>;
}

function countsOf(chart: GradeChart): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const s of chart.stems) counts[stemEl(s)]!++;
  for (const b of chart.branches) counts[branchEl(b)]!++;
  return counts;
}

/** Σ|5·c − n| over the five elements: five times the spec's dev, kept whole so equal spreads compare equal. */
const spread = (counts: readonly number[], n: number) => counts.reduce((sum, c) => sum + Math.abs(5 * c - n), 0);
const evenSpread = (n: number) => spread(ELEMENTS.map((_, i) => Math.floor(n / 5) + (i < n % 5 ? 1 : 0)), n);

/** 고르기 g (0–1): 1 for the most even split of the glyphs, 0 when they all share one element. */
function balanceOfCounts(counts: readonly number[]): number {
  const n = counts.reduce((a, b) => a + b, 0);
  const min = evenSpread(n);
  return 1 - (spread(counts, n) - min) / (8 * n - min);
}

export const balanceOf = (chart: GradeChart): number => balanceOfCounts(countsOf(chart));

/** 상생 고리: neighbouring elements of the cycle (목화, 화토, 토금, 금수, 수목) that both stand. */
const rings = (counts: readonly number[]) => counts.filter((c, i) => c > 0 && counts[(i + 1) % 5]! > 0).length;

export type PairLink = "상생" | "같은 기운" | "상극";
export interface GradePair {
  /** "천간" (left-right), "지지" (left-right) or "기둥" (top-bottom) */
  row: "천간" | "지지" | "기둥";
  glyphs: [string, string];
  link: PairLink;
}

const linkOf = (a: number, b: number): PairLink => (a === b ? "같은 기운" : (a + 1) % 5 === b || (b + 1) % 5 === a ? "상생" : "상극");
const LINK_VALUE: Readonly<Record<PairLink, number>> = { 상생: 1, "같은 기운": 0.5, 상극: 0 };

/** The neighbouring pairs 흐름 reads: stems 3 and branches 3 left-right, 4 pillars top-bottom (2, 2 and 3 without the hour). */
export function adjacentPairs(chart: GradeChart): GradePair[] {
  const { stems, branches } = chart;
  const out: GradePair[] = [];
  for (let i = 0; i + 1 < stems.length; i++) out.push({ row: "천간", glyphs: [stems[i]!, stems[i + 1]!], link: linkOf(stemEl(stems[i]!), stemEl(stems[i + 1]!)) });
  for (let i = 0; i + 1 < branches.length; i++) out.push({ row: "지지", glyphs: [branches[i]!, branches[i + 1]!], link: linkOf(branchEl(branches[i]!), branchEl(branches[i + 1]!)) });
  for (let i = 0; i < stems.length; i++) out.push({ row: "기둥", glyphs: [stems[i]!, branches[i]!], link: linkOf(stemEl(stems[i]!), branchEl(branches[i]!)) });
  return out;
}

/** 흐름 f (0–1): the mean of the pairs, 상생 1, same element 0.5, 상극 0. */
export function flowOf(chart: GradeChart): number {
  const pairs = adjacentPairs(chart);
  return pairs.reduce((sum, p) => sum + LINK_VALUE[p.link], 0) / pairs.length;
}

/** m(Y) for each of the 25 (stem element, branch element) a 세운 can bring, index 5·stem + branch. */
function fitsByElements(counts: readonly number[]): number[] {
  const balance = balanceOfCounts(counts);
  const before = rings(counts);
  const out: number[] = [];
  for (let s = 0; s < 5; s++) {
    for (let b = 0; b < 5; b++) {
      const next = [...counts];
      next[s]!++;
      next[b]!++;
      const evener = Math.min(1, Math.max(0, (balanceOfCounts(next) - balance + 0.2) / 0.5));
      out.push(30 * evener + (20 * (rings(next) - before)) / 2);
    }
  }
  return out;
}

const yearElements = (i: number) => 5 * STEM_EL[i % 10]! + BRANCH_EL[i % 12]!;

/** m(Y) of every 세운, by its place in SIXTY_GANZHI. */
function yearFits(chart: GradeChart): number[] {
  const fits = fitsByElements(countsOf(chart));
  return SIXTY_GANZHI.map((_, i) => fits[yearElements(i)]!);
}

/** r(Y): (years with a smaller m + (years with the same m − 1)/2) / 59, among the chart's own 60 세운. */
function ranksOf(fits: readonly number[]): number[] {
  return fits.map((m) => {
    let below = 0;
    let same = 0;
    for (const other of fits) {
      if (other < m) below++;
      else if (other === m) same++;
    }
    return (below + (same - 1) / 2) / 59;
  });
}

const scoreOf = (balance: number, flow: number, rank: number) => Math.round(18 * balance + 12 * flow + 70 * rank);

/** The whole-number score (0–100, never shown) of every 세운, by its place in SIXTY_GANZHI. */
export function yearScores(chart: GradeChart): number[] {
  const balance = balanceOf(chart);
  const flow = flowOf(chart);
  return ranksOf(yearFits(chart)).map((rank) => scoreOf(balance, flow, rank));
}

export interface GradeScore {
  score: number;
  balance: number;
  flow: number;
  /** m(Y) */
  fit: number;
  /** r(Y) */
  rank: number;
}

export function gradeScore(chart: GradeChart, yearGz: string): GradeScore {
  const y = SIXTY_GANZHI.indexOf(yearGz);
  if (y < 0) throw new Error(`not a ganzhi: ${yearGz}`);
  const balance = balanceOf(chart);
  const flow = flowOf(chart);
  const fits = yearFits(chart);
  const rank = ranksOf(fits)[y]!;
  return { score: scoreOf(balance, flow, rank), balance, flow, fit: fits[y]!, rank };
}

/**
 * The cuts of one 세운 from its population's score counts (`counts[score]`): a score's grade is the number of
 * GRADE_TOP_PERCENT lines the share strictly above it has reached, so a tie never splits.
 */
export function gradeCuts(counts: readonly number[]): GradeCuts {
  const total = counts.reduce((a, b) => a + b, 0);
  const cuts = [Infinity, Infinity, Infinity];
  let above = 0;
  let grade = 0;
  for (let score = counts.length - 1; score >= 0; score--) {
    const n = counts[score] ?? 0;
    if (!n) continue;
    while (grade < 3 && above * 100 >= GRADE_TOP_PERCENT[grade]! * total) grade++;
    for (let g = grade; g < 3; g++) cuts[g] = score;
    above += n;
  }
  return [cuts[0]!, cuts[1]!, cuts[2]!];
}

export function gradeOf(score: number, cuts: GradeCuts): GradeLetter {
  return score >= cuts[0] ? "S" : score >= cuts[1] ? "A" : score >= cuts[2] ? "B" : "C";
}

/**
 * Every combination of A6 once, as the rule reads it: 60 year pillars, the 12 months each takes (오호둔), 60 day pillars
 * and, with the hour, the day's 12 hour pillars (오서둔) plus 23:00–24:00 on the next day's stem (SPLIT_NEXT_DAY_STEM).
 */
export function forEachGradeChart(hourKnown: boolean, visit: (chart: GradeChart) => void): void {
  for (let y = 0; y < 60; y++) {
    const ys = y % 10;
    for (let k = 0; k < 12; k++) {
      const month = STEMS[(((ys % 5) * 2 + 2 + k) % 10)]! + BRANCHES[(2 + k) % 12]!;
      for (let d = 0; d < 60; d++) {
        const ds = d % 10;
        const base = { stems: [STEMS[ys]!, month[0]!, STEMS[ds]!], branches: [BRANCHES[y % 12]!, month[1]!, BRANCHES[d % 12]!] };
        if (!hourKnown) {
          visit(base);
          continue;
        }
        for (let h = 0; h < 13; h++) {
          // h = 12: the 子 hour from 23:00, on the next day's stem
          const stem = h < 12 ? ((ds % 5) * 2 + h) % 10 : (((ds + 1) % 5) * 2) % 10;
          visit({ stems: [...base.stems, STEMS[stem]!], branches: [...base.branches, BRANCHES[h % 12]!] });
        }
      }
    }
  }
}

const KST_MS = 9 * 3_600_000;

/** The 세운 in force at an instant: the Korean (KST) year once its 입춘 has passed, else the year before. */
export function seunAt(ms: number): { year: number; gz: string } {
  const kstYear = new Date(ms + KST_MS).getUTCFullYear();
  const ipchun = getSolarTerm(kstYear, 2).date.getTime(); // 0 소한, 1 대한, 2 입춘
  const year = ms >= ipchun ? kstYear : kstYear - 1;
  return { year, gz: ganzhiOfYear(year) };
}
