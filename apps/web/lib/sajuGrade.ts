import {
  GRADE_POPULATION, SIXTY_GANZHI, adjacentPairs, elementCountsOf, ganzhiKo, ganzhiOfYear, gradeChartOf, gradeOf, seunAt, stemElement,
  branchElement, yearScores, type GradeChart, type GradeCuts, type GradeLetter, type PillarKey, type SajuChart, type SajuElement,
} from "@starlog/core";
import { withParticle, particle } from "./korean";
import { ELEMENTS, ELEMENT_WORD } from "./sajuBalance";
import cutsTable from "./sajuGradeCuts.generated.json";

/**
 * 올해의 사주 등급 card logic (spec docs/superpowers/specs/2026-11-11-saju-grade-card-design.md A4–A6, B.5, F C4).
 * Pure and browser-safe: the chart is computed on the device and nothing here leaves it. The score itself is never shown;
 * the cuts come from `pnpm grade:table` (sajuGradeCuts.generated.json), the rank table is loaded only when asked for.
 */

export const GRADE_NICKNAME: Readonly<Record<GradeLetter, string>> = {
  S: "보름달 사주주",
  A: "차오르는 달 사주주",
  B: "초승달 사주주",
  C: "달빛 모으는 사주주",
};

export interface GradeYear {
  year: number;
  gz: string;
  /** "병오" */
  ko: string;
  grade: GradeLetter;
  nickname: string;
}

const hourKnown = (chart: GradeChart) => chart.stems.length === 4;
const yearIndex = (year: number) => SIXTY_GANZHI.indexOf(ganzhiOfYear(year));
const cutsFor = (chart: GradeChart, y: number) => (hourKnown(chart) ? cutsTable.known : cutsTable.unknown)[y] as unknown as GradeCuts;

/** The year whose 세운 is in force now (it turns at 입춘, KST). */
export const currentGradeYear = (now = Date.now()): number => seunAt(now).year;

export function gradeForYear(chart: GradeChart, year: number): GradeYear {
  return gradesOf(chart, yearScores(chart), year);
}

function gradesOf(chart: GradeChart, scores: readonly number[], year: number): GradeYear {
  const y = yearIndex(year);
  const grade = gradeOf(scores[y]!, cutsFor(chart, y));
  const gz = SIXTY_GANZHI[y]!;
  return { year, gz, ko: ganzhiKo(gz), grade, nickname: GRADE_NICKNAME[grade] };
}

/** The 10-year chips from `fromYear` (A5). */
export function gradeChips(chart: GradeChart, fromYear: number, count = 10): GradeYear[] {
  const scores = yearScores(chart);
  return Array.from({ length: count }, (_, i) => gradesOf(chart, scores, fromYear + i));
}

/** The first S or A year after `afterYear` within one 60-year round, or null when the chart has none. */
export function nextBrightYear(chart: GradeChart, afterYear: number): GradeYear | null {
  const scores = yearScores(chart);
  for (let year = afterYear + 1; year <= afterYear + 60; year++) {
    const found = gradesOf(chart, scores, year);
    if (found.grade === "S" || found.grade === "A") return found;
  }
  return null;
}

// ---- observations (B.5): the grade's own ingredients in plain words, never the grade, a score or a share ----

/** "물(수)" */
const label = (e: SajuElement) => `${ELEMENT_WORD[e]}(${e})`;
/** Two joined with 과/와 ("물(수)과 쇠(금)"), more with "·"; the particle after reads the last plain word. */
const listOf = (els: readonly SajuElement[]) =>
  els.length === 2 ? `${label(els[0]!)}${particle(ELEMENT_WORD[els[0]!], "과/와")} ${label(els[1]!)}` : els.map(label).join("·");
const subject = (els: readonly SajuElement[]) => `${listOf(els)}${particle(ELEMENT_WORD[els.at(-1)!], "이/가")}`;
const HOW_MANY = ["", "하나", "둘", "셋", "넷"] as const;
const GLYPHS = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열"] as const;

/** 고르기: which of the five stand, or, with all five, which is most. */
export function balanceLine(counts: Readonly<Record<SajuElement, number>>): string {
  const empty = ELEMENTS.filter((e) => counts[e] === 0);
  if (empty.length) {
    return `다섯 기운 가운데 ${withParticle(HOW_MANY[5 - empty.length]!, "이/가")} 보여요. ${subject(empty)} 비어 있어요.`;
  }
  const most = Math.max(...ELEMENTS.map((e) => counts[e]));
  const top = ELEMENTS.filter((e) => counts[e] === most);
  return `다섯 기운이 모두 보여요. ${subject(top)} ${GLYPHS[most]} 글자${top.length > 1 ? "씩" : "로"} 가장 많아요.`;
}

/** 흐름: how many of the neighbouring pairs are 상생 (`total` is 10, or 7 with the hour unknown). */
export function flowLine(saengs: number, total: number): string {
  if (saengs === 0) return `이웃한 글자 ${total}쌍 가운데 서로 살려 주는 사이(상생)는 없어요.`;
  if (saengs === total) return `이웃한 글자 ${total}쌍이 모두 서로 살려 주는 사이(상생)예요.`;
  return `이웃한 글자 ${total}쌍 가운데 ${saengs}쌍이 서로 살려 주는 사이(상생)예요.`;
}

type Meets = "empty" | "most" | "some";
const MEETS_END: Readonly<Record<Meets, string>> = { empty: "비어 있던 칸을 채워요", most: "이미 가장 많은 쪽과 겹쳐요", some: "이미 있는 칸에 더해져요" };
const MEETS_AND: Readonly<Record<Meets, string>> = { empty: "비어 있던 칸을 채우고", most: "이미 가장 많은 쪽과 겹치고", some: "이미 있는 칸에 더해지고" };

/** 올해 만남: where the 세운's two glyphs land in the chart (an empty element, the most, or one in between). */
export function yearLine(counts: Readonly<Record<SajuElement, number>>, year: number): string {
  const gz = ganzhiOfYear(year);
  const head = `${year} ${ganzhiKo(gz)}년의`;
  const most = Math.max(...ELEMENTS.map((e) => counts[e]));
  const meets = (e: SajuElement): Meets => (counts[e] === 0 ? "empty" : counts[e] === most ? "most" : "some");
  const stem = stemElement(gz[0]!);
  const branch = branchElement(gz[1]!);
  if (stem === branch) return `${head} ${label(stem)} 기운 두 글자가 ${MEETS_END[meets(stem)]}.`;
  if (meets(stem) === meets(branch)) return `${head} ${listOf([stem, branch])} 기운이 둘 다 ${MEETS_END[meets(stem)]}.`;
  return `${head} ${label(stem)} 기운은 ${MEETS_AND[meets(stem)]}, ${label(branch)} 기운은 ${MEETS_END[meets(branch)]}.`;
}

/** 고르기, 흐름 and 올해 만남 for `year`, in that order. */
export function gradeObservations(chart: GradeChart, year: number): [string, string, string] {
  const counts = elementCountsOf(chart);
  const pairs = adjacentPairs(chart);
  return [balanceLine(counts), flowLine(pairs.filter((p) => p.link === "상생").length, pairs.length), yearLine(counts, year)];
}

// ---- 상위 % (A6): only inside "등급은 어떻게 나와요?", never on the card or a shared image ----

export interface GradePercentile {
  /** within the top this many percent of the combinations (rounded up, at least 1) */
  topPercent: number;
  text: string;
}

export async function gradePercentile(chart: GradeChart, year: number): Promise<GradePercentile> {
  const ranks = (await import("./sajuGradeRanks.generated.json")).default;
  const y = yearIndex(year);
  const known = hourKnown(chart);
  const population = known ? GRADE_POPULATION.hourKnown : GRADE_POPULATION.hourUnknown;
  const atOrAbove = (known ? ranks.known : ranks.unknown)[y]![yearScores(chart)[y]!]!;
  const topPercent = Math.max(1, Math.ceil((100 * atOrAbove) / population));
  const text = known
    ? `가능한 사주 조합 ${population.toLocaleString("ko-KR")}개 가운데 위에서 ${topPercent}% · 연 60 × 월 12 × 일 60 × 시 13(밤 11시대를 다음 날 천간으로 세는 스타로그 기준)을 하나씩 같은 무게로 센 순위예요. 인구 통계가 아니에요.`
    : `시를 모르는 사주 조합 ${population.toLocaleString("ko-KR")}개 가운데 위에서 ${topPercent}% · 연 60 × 월 12 × 일 60을 하나씩 같은 무게로 센 순위예요. 인구 통계가 아니에요.`;
  return { topPercent, text };
}

// ---- birth time at a boundary (A5) ----

export interface GradeBoundaryNotice {
  grade: GradeLetter;
  /** the pillars a few minutes away, as the engine names them */
  pillars: Partial<Record<PillarKey, string>>;
  chart: GradeChart;
  message: string;
}

/** The warnings that name the reading a few minutes away: 시주 (HOUR_BOUNDARY, 23:00) or 일주 (00:00). */
const NEIGHBOUR_CODES = new Set(["HOUR_BOUNDARY", "DAY_BOUNDARY", "JASI_DAY_PILLAR"]);
const KEYS: readonly PillarKey[] = ["year", "month", "day", "hour"];
const PILLAR_KO: Readonly<Record<PillarKey, string>> = { year: "연주", month: "월주", day: "일주", hour: "시주" };

/** When the time sits within the engine's boundary window and the pillars across it give `year` another grade. */
export function boundaryNotice(chart: SajuChart, year: number): GradeBoundaryNotice | null {
  const own = gradeChartOf(chart);
  const grade = gradeForYear(own, year);
  for (const warning of chart.warnings) {
    if (!NEIGHBOUR_CODES.has(warning.code) || !warning.pillars) continue;
    const pillars = Object.fromEntries(Object.entries(warning.pillars).map(([k, list]) => [k, list[0]!])) as Partial<Record<PillarKey, string>>;
    const other: GradeChart = { stems: [...own.stems], branches: [...own.branches] };
    for (const [k, gz] of Object.entries(pillars) as [PillarKey, string][]) {
      const i = KEYS.indexOf(k);
      if (i >= other.stems.length) continue;
      other.stems[i] = gz[0]!;
      other.branches[i] = gz[1]!;
    }
    const theirs = gradeForYear(other, year);
    if (theirs.grade === grade.grade) continue;
    const turns = pillars.day ? "일주" : "시주";
    const becomes = (Object.entries(pillars) as [PillarKey, string][])
      .sort(([a], [b]) => KEYS.indexOf(a) - KEYS.indexOf(b))
      .map(([k, gz]) => `${PILLAR_KO[k]}가 ${ganzhiKo(gz)}(${gz})${particle(ganzhiKo(gz), "이/가")}`)
      .join(", ");
    return {
      grade: theirs.grade,
      pillars,
      chart: other,
      message: `태어난 시각이 ${turns}가 바뀌는 때와 몇 분 차이예요. 몇 분 차이로 ${becomes} 되면 ${year} ${theirs.ko}년 등급은 ${theirs.grade}(${theirs.nickname})예요.`,
    };
  }
  return null;
}
