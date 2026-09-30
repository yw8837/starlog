import { BRANCHES, BRANCHES_KO, type SajuChart, type SajuElement } from "@starlog/core";
import { SAJU_SAMPLE } from "./fixtures";

/**
 * What the saju screens may say before P3 writes real prologues. The gold sample text belongs to
 * one chart only; every other chart gets a teaser built from its own computed facts and the
 * generic section list.
 */

/** True when the sample prologue describes this chart: same four pillars (no hour) and same gender. */
export function isSampleChart(chart: SajuChart): boolean {
  const sample = SAJU_SAMPLE.chart.pillars;
  const same = (p: { stem: string; branch: string }, s: { stem: string; branch: string }) => p.stem === s.stem && p.branch === s.branch;
  return (
    chart.pillars.hour === null &&
    sample.hour === null &&
    same(chart.pillars.year, sample.year) &&
    same(chart.pillars.month, sample.month) &&
    same(chart.pillars.day, sample.day) &&
    chart.input.gender === SAJU_SAMPLE.input.gender
  );
}

/** The paid prologue's sections, worded so they hold for any chart (the sample's headings with its specifics removed). */
export const SAJU_PROLOGUE_SECTIONS: readonly string[] = Object.freeze([
  "월령과 뿌리 · 태어난 계절과 일간의 힘",
  "오행 지도 · 많은 기운과 적은 기운, 숨은 기운",
  "십성 · 명식에 놓인 역할과 관계",
  "일지 · 나와 가장 가까운 자리",
  "일하는 결과 쉬는 결 · 두 장면으로 확인하기",
  "지금의 10년 · 대운의 흐름",
  "계산 기준 · 보지 않은 것과 달라질 수 있는 것",
]);

const HANJA: Record<SajuElement, string> = { 목: "木", 화: "火", 토: "土", 금: "金", 수: "水" };

// Native names with the particles they take (나무/쇠 end in a vowel; 불/흙/물 in a consonant).
const ELEMENT_WORD: Record<SajuElement, { word: string; subject: string; topic: string }> = {
  목: { word: "나무", subject: "가", topic: "는" },
  화: { word: "불", subject: "이", topic: "은" },
  토: { word: "흙", subject: "이", topic: "은" },
  금: { word: "쇠", subject: "가", topic: "는" },
  수: { word: "물", subject: "이", topic: "은" },
};

const ORDER: readonly SajuElement[] = ["목", "화", "토", "금", "수"];
const COUNT_WORD = ["영", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟"] as const;

// Month branch → where the month sits in its season (months start at the 절, so 寅 opens spring).
const SEASON: Record<string, string> = {
  寅: "봄이 시작되는 달이에요",
  卯: "봄의 한가운데예요",
  辰: "봄이 끝나 가는 달이에요",
  巳: "여름이 시작되는 달이에요",
  午: "여름의 한가운데예요",
  未: "여름이 끝나 가는 달이에요",
  申: "가을이 시작되는 달이에요",
  酉: "가을의 한가운데예요",
  戌: "가을이 끝나 가는 달이에요",
  亥: "겨울이 시작되는 달이에요",
  子: "겨울의 한가운데예요",
  丑: "겨울이 끝나 가는 달이에요",
};

/** True when the Hangul syllable ends in a final consonant (받침). */
function hasFinal(syllable: string): boolean {
  const code = syllable.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

/** "나무(木)·흙(土)·물(水)이": names joined by a middle dot, particle chosen by the last one. */
function joinElements(elements: SajuElement[], particle: "subject" | "topic"): string {
  const last = elements[elements.length - 1]!;
  return `${elements.map((el) => `${ELEMENT_WORD[el].word}(${HANJA[el]})`).join("·")}${ELEMENT_WORD[last][particle]}`;
}

/**
 * The free teaser for a chart without a written prologue: only facts the engine computed.
 * 일간, the season of the month branch (skipped when the month pillar is uncertain), the visible
 * element counts, and the missing hour. 2-4 sentences in 해요체, no interpretation.
 */
export function composeChartTeaser(chart: SajuChart): string {
  const sentences: string[] = [];

  const { dayMaster } = chart;
  const copula = hasFinal(dayMaster.ko.slice(-1)) ? "이에요" : "예요";
  sentences.push(`일간은 ${dayMaster.ko}(${dayMaster.stem}${HANJA[dayMaster.element]})${copula}.`);

  if (!chart.ambiguous.some((a) => a.pillar === "month")) {
    const branch = chart.pillars.month.branch;
    const ko = BRANCHES_KO[BRANCHES.indexOf(branch as (typeof BRANCHES)[number])];
    const season = SEASON[branch];
    if (ko && season) sentences.push(`태어난 달은 ${ko}월(${branch}月)로, ${season}.`);
  }

  const total = ORDER.reduce((sum, el) => sum + chart.elements[el], 0);
  const max = Math.max(...ORDER.map((el) => chart.elements[el]));
  const top = ORDER.filter((el) => chart.elements[el] === max);
  const missing = ORDER.filter((el) => chart.elements[el] === 0);
  const amount = `${COUNT_WORD[max]}${top.length > 1 ? "씩" : ""}`;
  const lead = `보이는 ${COUNT_WORD[total]} 글자 가운데 ${joinElements(top, "subject")} ${amount}`;
  sentences.push(missing.length > 0 ? `${lead}이고, ${joinElements(missing, "topic")} 하나도 없어요.` : `${lead}이에요.`);

  if (chart.pillars.hour === null) sentences.push("태어난 시를 몰라 시주 없이 여섯 글자로 봤어요.");

  return sentences.join(" ");
}
