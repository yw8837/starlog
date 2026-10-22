import { STEMS, stemElement, type PillarKey, type SajuChart, type SajuElement } from "@starlog/core";

/**
 * 오행과 나의 힘 (the chart page's radar and donut): the numbers the readings already use, never new ones.
 * - 오행 글자 수: the engine's visible glyphs (8, or 6 when the hour is unknown), the day master included, as the
 *   한눈에 보기 facts count them (`chart.elements`).
 * - 십성 비율: the topic readings' 다섯 묶음 (lib/ai/prompts/sajuTopics.ts): each stem but the day master and each branch's
 *   본기, one glyph one share (7, or 5), by the engine's ten gods (`stemGod`, `branchGod`). 지장간 are not counted.
 * No 신강·신약 or 격국: the engine computes neither, and the readings leave them out on purpose.
 */

/** 목화토금수, the 상생 order: one step along it is the element a glyph produces. */
export const ELEMENTS: readonly SajuElement[] = ["목", "화", "토", "금", "수"];

/** Plain words for the elements, the readings' (쇠, not 금). */
export const ELEMENT_WORD: Readonly<Record<SajuElement, string>> = { 목: "나무", 화: "불", 토: "흙", 금: "쇠", 수: "물" };

/** The five ten-god groups, in 상생 steps from the day master: 0 비겁, 1 식상, 2 재성, 3 관성, 4 인성. */
export const TEN_GOD_GROUPS = ["비겁", "식상", "재성", "관성", "인성"] as const;
export type TenGodGroup = (typeof TEN_GOD_GROUPS)[number];

/** Each group's two ten gods: the same polarity as the day master first. */
const GROUP_GODS: Readonly<Record<TenGodGroup, readonly [string, string]>> = {
  비겁: ["비견", "겁재"],
  식상: ["식신", "상관"],
  재성: ["편재", "정재"],
  관성: ["편관", "정관"],
  인성: ["편인", "정인"],
};

const PLACE: Readonly<Record<PillarKey, string>> = { year: "연", month: "월", day: "일", hour: "시" };
const KEYS: readonly PillarKey[] = ["year", "month", "day", "hour"];

/** The group `element` is to a day master of `dayElement`. */
export function groupOfElement(dayElement: SajuElement, element: SajuElement): TenGodGroup {
  return TEN_GOD_GROUPS[(ELEMENTS.indexOf(element) - ELEMENTS.indexOf(dayElement) + 5) % 5]!;
}

/** The element that holds `group` for a day master of `dayElement`. */
export function elementOfGroup(dayElement: SajuElement, group: TenGodGroup): SajuElement {
  return ELEMENTS[(ELEMENTS.indexOf(dayElement) + TEN_GOD_GROUPS.indexOf(group)) % 5]!;
}

/** Ten god of a stem to the day stem (a branch is read by its 본기: pass `mainHiddenStem(branch)`). */
export function tenGodOf(dayStem: string, stem: string): string {
  const group = groupOfElement(stemElement(dayStem), stemElement(stem));
  const samePolarity = STEMS.indexOf(dayStem as (typeof STEMS)[number]) % 2 === STEMS.indexOf(stem as (typeof STEMS)[number]) % 2;
  return GROUP_GODS[group][samePolarity ? 0 : 1];
}

const groupOfGod = (god: string): TenGodGroup => TEN_GOD_GROUPS.find((g) => GROUP_GODS[g].includes(god))!;

export interface ElementAxis {
  element: SajuElement;
  word: string;
  group: TenGodGroup;
  count: number;
}

/** The radar's five axes, 목화토금수: the visible glyphs of each element and the group it is to the day master. */
export function elementAxes(chart: Pick<SajuChart, "elements" | "dayMaster">): ElementAxis[] {
  return ELEMENTS.map((element) => ({ element, word: ELEMENT_WORD[element], group: groupOfElement(chart.dayMaster.element, element), count: chart.elements[element] }));
}

/**
 * Whole percentages that add up to 100 (largest remainder): each count's share rounded down, then the points left over
 * go to the largest remainders, the earlier one on a tie.
 */
export function roundShares(counts: readonly number[]): number[] {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((n) => (n * 100) / total);
  const out = exact.map(Math.floor);
  const order = exact.map((x, i) => ({ i, rest: x - Math.floor(x) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0, left = 100 - out.reduce((sum, n) => sum + n, 0); k < left; k++) out[order[k]!.i]!++;
  return out;
}

export interface GroupShare {
  group: TenGodGroup;
  element: SajuElement;
  word: string;
  count: number;
  percent: number;
  /** "연간 甲 편재", "월지 寅 편재": where the group shows, as the reading lists it */
  places: string[];
  /** none on the surface, but a branch's 여기·중기 holds it (숨음) */
  hiddenOnly: boolean;
}

export interface GroupShares {
  /** the places counted: 7, or 5 when the hour is unknown */
  total: number;
  items: GroupShare[];
}

/** The donut: the five groups over the stems (the day master left out) and the branches' 본기. */
export function groupShares(chart: Pick<SajuChart, "pillars" | "dayMaster">): GroupShares {
  const places: Record<TenGodGroup, string[]> = { 비겁: [], 식상: [], 재성: [], 관성: [], 인성: [] };
  const inside = new Set<SajuElement>();
  for (const key of KEYS) {
    const p = chart.pillars[key];
    if (!p) continue;
    if (key !== "day") places[groupOfGod(p.stemGod)].push(`${PLACE[key]}간 ${p.stem} ${p.stemGod}`);
    places[groupOfGod(p.branchGod)].push(`${PLACE[key]}지 ${p.branch} ${p.branchGod}`);
    p.hidden.filter((h) => h.role !== "본기").forEach((h) => inside.add(stemElement(h.stem)));
  }
  const counts = TEN_GOD_GROUPS.map((g) => places[g].length);
  const percents = roundShares(counts);
  const items = TEN_GOD_GROUPS.map((group, i): GroupShare => {
    const element = elementOfGroup(chart.dayMaster.element, group);
    return { group, element, word: ELEMENT_WORD[element], count: counts[i]!, percent: percents[i]!, places: places[group], hiddenOnly: counts[i] === 0 && inside.has(element) };
  });
  return { total: counts.reduce((sum, n) => sum + n, 0), items };
}
