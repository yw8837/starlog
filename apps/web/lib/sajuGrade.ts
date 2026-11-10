import {
  GRADE_LETTERS, GRADE_POPULATION, SIXTY_GANZHI, adjacentPairs, elementCountsOf, ganzhiKo, ganzhiOfYear, gradeChartOf, gradeOf, seunAt, stemElement,
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

/** "2026 병오년" */
export const yearName = (g: Pick<GradeYear, "year" | "ko">) => `${g.year} ${g.ko}년`;

// ---- card copy (A1, A4, E): fixed lines, never about a person's worth or what will happen ----

const LINE: Readonly<Record<GradeLetter, string>> = {
  S: "올해 들어오는 기운이 내 명식의 빈칸을 고르게 채워 주는 해예요.",
  A: "빈칸 대부분이 채워지는 해예요. 조금씩 다듬으면 고르게 돌아요.",
  B: "채워지는 칸과 겹치는 칸이 섞인 해예요. 하나씩 쌓아 가기 좋아요.",
  C: "올해 기운이 이미 많은 쪽과 겹치는 해예요. 빈칸을 새로 모으는 때예요.",
};

/** The card's line under the grade (A4); a chip's other year says 그해. */
export const gradeLine = (grade: GradeLetter, thisYear: boolean): string => (thisYear ? LINE[grade] : LINE[grade].replace(/^올해/, "그해"));

/** Under the card, always (A1). */
export const GRADE_FIXED_LINE =
  "등급은 사람이나 사주의 좋고 나쁨이 아니에요. 올해 들어오는 기운이 내 명식의 다섯 기운을 얼마나 고르게 채우고 잇는지를 스타로그 규칙으로 계산한 거예요. 해마다 다시 계산해요.";

/** The birth fields' consent on the grade screens (spec B). */
export const GRADE_CONSENT = "출생 정보를 등급 계산에 쓰는 데 동의해요";

/** The entertainment notice at the end (E). */
export const GRADE_NOTICE = "재미로 보는 계산이에요. 사람이나 사주의 좋고 나쁨, 앞으로 일어날 일을 정하지 않아요. 규칙은 '등급은 어떻게 나와요?'에 다 적어 두었어요.";

// ---- the share address (C): a year and a grade, nothing about the person ----

/**
 * The years a shared card may name (its page and its OG picture): 2026, the first card, through one whole 60-year round, so the
 * last of the ten chips keeps an address after every 입춘 (2036 from 입춘 2027).
 */
export const GRADE_YEARS = { first: 2026, last: 2085 } as const;

export const gradeSlug = (year: number, grade: GradeLetter) => `${year}-${grade.toLowerCase()}`;

/** The cards built ahead: the ten chips' years from the year in force at `now`, × S·A·B·C; the rest of GRADE_YEARS render on demand. */
export function gradeStaticSlugs(now = Date.now()): string[] {
  const from = currentGradeYear(now);
  return Array.from({ length: 10 }, (_, i) => from + i)
    .filter((year) => year >= GRADE_YEARS.first && year <= GRADE_YEARS.last)
    .flatMap((year) => GRADE_LETTERS.map((grade) => gradeSlug(year, grade)));
}

/** The 40 cards built ahead, from the year in force when this module loads (the build). */
export const GRADE_SLUGS: readonly string[] = gradeStaticSlugs();

/** A shared card's year and grade, or null for any other address. */
export function parseGradeSlug(slug: string): GradeYear | null {
  const m = /^(\d{4})-([sabc])$/.exec(slug);
  if (!m) return null;
  const year = Number(m[1]);
  if (year < GRADE_YEARS.first || year > GRADE_YEARS.last) return null;
  const grade = m[2]!.toUpperCase() as GradeLetter;
  const gz = ganzhiOfYear(year);
  return { year, gz, ko: ganzhiKo(gz), grade, nickname: GRADE_NICKNAME[grade] };
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

const ELEMENT_COUNT_WORD = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟"] as const;

const bright = (g: GradeYear) => g.grade === "S" || g.grade === "A";

/**
 * The end of the observations: the next S or A year after `year`, named while it is within the ten chips (to `lastChip`). Past
 * them (about 4.6% of charts get none in ten years, review 3) it first says, kindly, that the chips hold none (or none after
 * `year`), then the year the rule gives. For a chart that never gets one (16 of 561,600 with the hour known, every glyph 토; none
 * without it), that it does not and which grades it gets instead.
 */
export function nextBrightLine(chart: GradeChart, year: number, lastChip = year + 9): string {
  const next = nextBrightYear(chart, year);
  if (next && (next.year <= lastChip || year >= lastChip)) return `다음 S·A 해: ${yearName(next)}`;
  if (next) {
    const none = !gradeChips(chart, lastChip - 9).some(bright);
    return `${none ? "10년 칩 안에는" : `${year + 1}~${lastChip}년 칩에는`} S·A가 없어요. 규칙으로는 다음이 ${yearName(next)}이에요. 등급은 좋고 나쁨이 아니에요.`;
  }
  const got = new Set(gradeChips(chart, year, 60).map((g) => g.grade));
  const kinds = GRADE_LETTERS.filter((g) => got.has(g));
  const counts = elementCountsOf(chart);
  const only = ELEMENTS.find((e) => counts[e] === chart.stems.length * 2);
  const why = only ? ` ${ELEMENT_COUNT_WORD[chart.stems.length * 2]} 글자가 모두 ${label(only)}${particle(ELEMENT_WORD[only], "이/가") === "이" ? "이라" : "라"} 고르기 몫이 0으로 잡히는 규칙 때문이에요.` : "";
  return `60가지 해를 다 돌아도 이 명식에는 S·A가 나오는 해가 없어요.${why} 60가지 해 동안 등급은 ${kinds.join("와 ")}만 나와요.`;
}

/**
 * The line over a visitor's own card on a shared one (C): the friend's grade (from the address) and mine for the same year;
 * when the friend's is higher, the next year mine is at least as high: 나도 when it is the friend's very grade, 나는 when it is
 * above it (never "나도 S" to a friend's A, review 7).
 */
export function compareLine(friend: GradeLetter, chart: GradeChart, year: number): string {
  const mine = gradeForYear(chart, year).grade;
  const head = `친구 ${friend} · 나 ${mine}`;
  if (mine === friend) return `${head} — 같은 등급이에요`;
  if (GRADE_LETTERS.indexOf(mine) < GRADE_LETTERS.indexOf(friend)) return head;
  const scores = yearScores(chart);
  for (let y = year + 1; y <= year + 60; y++) {
    const then = gradesOf(chart, scores, y);
    if (GRADE_LETTERS.indexOf(then.grade) <= GRADE_LETTERS.indexOf(friend)) return `${head} — ${y}년엔 ${then.grade === friend ? "나도" : "나는"} ${then.grade}예요`;
  }
  return head;
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
  /** within the top this many percent of the combinations, ties counted with it (rounded up, at least 1) */
  topPercent: number;
  /** S·A·B: that number and the tie rule; C: its band, never a number (it read "위에서 100%" for 1.3% of chart-years, review 6) */
  text: string;
}

export async function gradePercentile(chart: GradeChart, year: number): Promise<GradePercentile> {
  const ranks = (await import("./sajuGradeRanks.generated.json")).default;
  const y = yearIndex(year);
  const known = hourKnown(chart);
  const population = known ? GRADE_POPULATION.hourKnown : GRADE_POPULATION.hourUnknown;
  const score = yearScores(chart)[y]!;
  const atOrAbove = (known ? ranks.known : ranks.unknown)[y]![score]!;
  const topPercent = Math.max(1, Math.ceil((100 * atOrAbove) / population));
  const head = known ? `가능한 사주 조합 ${population.toLocaleString("ko-KR")}개 가운데` : `시를 모르는 사주 조합 ${population.toLocaleString("ko-KR")}개 가운데`;
  const counted = known ? "연 60 × 월 12 × 일 60 × 시 13(밤 11시대를 다음 날 천간으로 세는 스타로그 기준)" : "연 60 × 월 12 × 일 60";
  const text =
    gradeOf(score, cutsFor(chart, y)) === "C"
      ? `${head} C 구간(아래쪽 30% 안팎) · ${counted}을 하나씩 같은 무게로 센 구간이에요. 인구 통계가 아니에요.`
      : `${head} 위에서 ${topPercent}% · ${counted}을 하나씩 같은 무게로 센 순위예요. 값이 같으면 같은 등급으로 묶어요. 인구 통계가 아니에요.`;
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
