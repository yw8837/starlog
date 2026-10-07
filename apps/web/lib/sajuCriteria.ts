import type { SajuChart, SajuPolicy } from "@starlog/core";

/**
 * "적용한 기준" content for a computed chart, grouped for the disclosure. Built from the chart's
 * structure and warning codes, never by matching the engine's sentences.
 */

export const TIME_UNKNOWN_LINE = "태어난 시를 몰라 시주를 비웠어요. 시주가 다루는 해석은 하지 않아요.";

/** The calculation rules in plain words, from the policy the chart was computed with. */
export function policyLines(policy: SajuPolicy, place: { name: string; longitude: number }): string[] {
  const where = `태어난 곳(${place.name}, 동경 ${place.longitude}°)`;
  const clock: Record<SajuPolicy["clock"], string> = {
    LMT: `일주·시주는 ${where}의 평균 태양시로 봐요. 균시차는 넣지 않아요.`,
    LAT: `일주·시주는 ${where}의 실제 태양 시각으로 봐요.`,
    ERA_STANDARD: "일주·시주는 당시 표준시 그대로 보고, 경도 보정은 하지 않아요.",
    FIXED_127_5: "일주·시주는 동경 127.5° 기준 시각으로 봐요.",
    WALL: "일주·시주는 입력한 시각 그대로 봐요.",
  };
  return [
    "연주·월주는 태어난 순간과 절기가 바뀌는 시각(절입)을 비교해 정해요.",
    clock[policy.clock],
    policy.jasi === "SPLIT_NEXT_DAY_STEM" ? "밤 11시대(자시)는 일주를 그날로 두고, 시주만 다음 날 기준으로 봐요." : "밤 11시부터는 다음 날 일주로 봐요.",
    ...(policy.applyHistoricalDst ? ["서머타임과 옛 표준시 기간은 당시 시계를 되돌려 계산해요."] : []),
    "오행 개수는 천간과 지지에 보이는 글자만 세요. 지장간은 세지 않아요.",
    "태어난 시를 모르면 정오 같은 시각을 넣지 않고 시주 없이 봐요.",
  ];
}

export interface CriteriaGroups {
  /** What this chart assumed ("이 명식에서는"). */
  applied: string[];
  /** Where the chart could differ ("달라질 수 있는 점": the birth time, the DST tables, 윤달 모름), one per warning. */
  changes: string[];
  /** The policy in plain words ("계산 기준"). */
  rules: string[];
}

/**
 * With the time unknown, the engine's notes restate the missing hour and the day-pillar
 * windows; the windows already arrive as DAY_PILLAR_WINDOW warnings carrying the exact
 * alternative pillar, so the hour gets one line of its own and those notes are not repeated.
 * The one note kept is the date's: 윤달 '모름' on a day only the 윤달 has (the engine's first note).
 * With the time known, the notes are the corrections actually applied (윤달, longitude, DST, 1908 LMT).
 */
export function criteriaGroups(chart: SajuChart): CriteriaGroups {
  const { input } = chart;
  const leapOnly = input.calendar === "lunar" && input.isLeapMonth === "unknown" && chart.lunarDate.includes("윤");
  return {
    applied: chart.pillars.hour === null ? [...(leapOnly ? chart.notes.slice(0, 1) : []), TIME_UNKNOWN_LINE] : [...chart.notes],
    changes: chart.warnings.map((warning) => warning.message),
    rules: policyLines(chart.policy, chart.input.place),
  };
}
