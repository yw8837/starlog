import { computeChart, type SajuInput } from "../saju/chart";
import { BRANCHES, STEMS, stemElement, type SajuElement } from "../saju/labels";

/**
 * 인연 점수 (spec §4): symmetric, deterministic and date-only. Both people's charts are read from the
 * birth date alone (three pillars), so a birth time can never change the score, and A with B always
 * scores the same as B with A.
 */

export interface BondBirth { calendar: "solar" | "lunar"; year: number; month: number; day: number; isLeapMonth?: boolean }

/** What the score needs from one person. Stored for the owner instead of the birth date. */
export interface BondBasis {
  dayStem: string;
  yearBranch: string;
  dayBranch: string;
  /** visible stems + branches of the three date pillars (6 characters) */
  elements: Record<SajuElement, number>;
  /** a year or month pillar changes during the birth day (입춘·절입일) */
  uncertain: boolean;
}

export type BondPartId =
  | "stem-combine" | "stem-generate" | "stem-same"
  | "year-six" | "year-three" | "year-same" | "year-clash" | "year-wonjin"
  | "day-six" | "day-three" | "day-clash"
  | "fill-mine" | "fill-theirs" | "uncertain";

export interface BondPart { id: BondPartId; points: number; text: string }
export interface BondScore { score: number; parts: BondPart[] }

export const BOND_BASE = 62;
export const BOND_MIN = 55;
export const BOND_MAX = 99;

const ELEMENT_ORDER: readonly SajuElement[] = ["목", "화", "토", "금", "수"];
/** 목→화→토→금→수→목 */
const GENERATES: Record<SajuElement, SajuElement> = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" };
/** 원진: 子未 丑午 寅酉 卯申 辰亥 巳戌 (branch indexes, low-high) */
const WONJIN = new Set(["0-7", "1-6", "2-9", "3-8", "4-11", "5-10"]);

/** Date-only basis: the chart is computed with time unknown, so birth time never changes the score. */
export function bondBasis(birth: BondBirth): BondBasis {
  const input: SajuInput = {
    calendar: birth.calendar, year: birth.year, month: birth.month, day: birth.day,
    isLeapMonth: birth.isLeapMonth, time: null, gender: "female",
    place: { name: "서울", longitude: 126.978 },
  };
  const chart = computeChart(input);
  return {
    dayStem: chart.pillars.day.stem,
    yearBranch: chart.pillars.year.branch,
    dayBranch: chart.pillars.day.branch,
    elements: { ...chart.elements },
    uncertain: chart.ambiguous.length > 0,
  };
}

const stemIdx = (s: string) => STEMS.indexOf(s as (typeof STEMS)[number]);
const branchIdx = (b: string) => BRANCHES.indexOf(b as (typeof BRANCHES)[number]);

function stemPart(a: string, b: string): BondPart | null {
  const i = stemIdx(a);
  const j = stemIdx(b);
  if (Math.abs(i - j) === 5) return { id: "stem-combine", points: 12, text: "두 분의 일간이 서로 합을 이루는 사이예요" };
  const ea = stemElement(a);
  const eb = stemElement(b);
  if (GENERATES[ea] === eb || GENERATES[eb] === ea) return { id: "stem-generate", points: 10, text: "두 분의 일간이 서로 살려 주는 사이예요" };
  if (ea === eb) return { id: "stem-same", points: 6, text: "두 분의 일간이 같은 결이에요" };
  return null;
}

type BranchKind = "six" | "three" | "same" | "clash" | "wonjin";

function branchKinds(a: string, b: string): BranchKind[] {
  const i = branchIdx(a);
  const j = branchIdx(b);
  const kinds: BranchKind[] = [];
  if (i === j) kinds.push("same");
  else {
    if ((i + j) % 12 === 1) kinds.push("six");
    if (i % 4 === j % 4) kinds.push("three");
    if (Math.abs(i - j) === 6) kinds.push("clash");
    if (WONJIN.has(`${Math.min(i, j)}-${Math.max(i, j)}`)) kinds.push("wonjin");
  }
  return kinds;
}

// Clash and 원진 never scare: they are read as friction that wakes each other up (spec §4).
const YEAR: Record<BranchKind, BondPart> = {
  six: { id: "year-six", points: 8, text: "띠가 짝을 이루는 사이예요" },
  three: { id: "year-three", points: 7, text: "띠가 같은 무리로 모이는 사이예요" },
  same: { id: "year-same", points: 4, text: "같은 띠라 통하는 게 많아요" },
  clash: { id: "year-clash", points: -5, text: "띠가 마주 보는 사이라, 부딪히면서 서로를 깨워요" },
  wonjin: { id: "year-wonjin", points: -3, text: "명리에서는 작은 서운함이 쌓이기 쉬운 띠로 읽어요. 말로 풀면 금방 풀려요" },
};
const DAY: Partial<Record<BranchKind, BondPart>> = {
  six: { id: "day-six", points: 6, text: "일지가 짝을 이뤄 곁에 있으면 편한 사이예요" },
  three: { id: "day-three", points: 5, text: "일지가 같은 무리라 함께할 때 힘이 모여요" },
  clash: { id: "day-clash", points: -4, text: "일지가 마주 보는 사이라, 거리를 조절하면 더 좋아요" },
};

/** The single largest applicable item (spec §4). */
function best<T extends { points: number }>(items: T[]): T | null {
  return items.reduce<T | null>((top, x) => (top === null || x.points > top.points ? x : top), null);
}

function weakest(e: Record<SajuElement, number>): SajuElement[] {
  const min = Math.min(...ELEMENT_ORDER.map((k) => e[k]));
  return ELEMENT_ORDER.filter((k) => e[k] === min);
}

/** The score of two people; `parts` explain it from `me`'s side (the score itself is symmetric). */
export function bondScore(me: BondBasis, friend: BondBasis): BondScore {
  const parts: BondPart[] = [];
  const stem = stemPart(me.dayStem, friend.dayStem);
  if (stem) parts.push(stem);
  const year = best(branchKinds(me.yearBranch, friend.yearBranch).map((k) => YEAR[k]));
  if (year) parts.push({ ...year });
  const day = best(branchKinds(me.dayBranch, friend.dayBranch).flatMap((k) => (DAY[k] ? [DAY[k]!] : [])));
  if (day) parts.push({ ...day });
  const mine = weakest(me.elements).find((k) => friend.elements[k] >= 2);
  if (mine) parts.push({ id: "fill-mine", points: 5, text: `내게 부족한 ${mine} 기운을 친구가 채워 줘요` });
  const theirs = weakest(friend.elements).find((k) => me.elements[k] >= 2);
  if (theirs) parts.push({ id: "fill-theirs", points: 5, text: `친구에게 부족한 ${theirs} 기운을 내가 채워 줘요` });
  if (me.uncertain || friend.uncertain) parts.push({ id: "uncertain", points: 0, text: "절기가 바뀌는 날이라 태어난 시각에 따라 달라질 수 있어요" });
  const raw = BOND_BASE + parts.reduce((n, p) => n + p.points, 0);
  return { score: Math.min(BOND_MAX, Math.max(BOND_MIN, raw)), parts };
}
