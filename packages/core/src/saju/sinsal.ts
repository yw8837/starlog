// 살·귀인 name tables (saju enrichment spec 2026-10-08 §1): pure lookups on a computed chart. A name is found when the
// branch its table names stands in another visible pillar's 지지: the basis pillar itself does not count, and with the
// hour unknown the hour pillar is not searched. Only the names a reading may show are computed (천을·문창·학당귀인,
// 도화·역마·화개); the held ones (공망, 홍염, 양인, 괴강) and the hidden ones (백호, 원진, 삼재 …) never are.
// Sources, read on zh.wikisource 2026-11-11, cross-checks and school differences: docs/research/saju-tables-sources-2026-11.md.
// 三命通會 = 萬民英, 明 (zh.wikisource.org/wiki/三命通會/卷二, /卷三).

import type { PillarKey, SajuChart } from "./chart";

/** The order a screen lists them in: the three 귀인, then 도화, 역마, 화개. */
export const SINSAL_NAMES = ["천을귀인", "문창귀인", "학당귀인", "도화", "역마", "화개"] as const;
export type SinsalName = (typeof SINSAL_NAMES)[number];
/** What a name is looked up by: the day stem for the 귀인, the year and the day branch for 도화·역마·화개. */
export type SinsalBasis = "일간" | "연지" | "일지";

export interface SinsalHit {
  pillar: PillarKey;
  branch: string;
  /** what found this one (도화·역마·화개 may be found by 연지 and by 일지) */
  basis: SinsalBasis;
  basisGlyph: string;
}

export interface Sinsal {
  name: SinsalName;
  /** the basis of the first hit (연지 before 일지) */
  basis: SinsalBasis;
  basisGlyph: string;
  hits: SinsalHit[];
}

/**
 * 천을귀인 by 일간: 甲戊庚→丑未 · 乙己→子申 · 丙丁→亥酉 · 辛→寅午 · 壬癸→卯巳. 三命通會 卷三 論天乙貴人 gives every one
 * ("所以牛羊為貴" for 甲戊庚; 辛 "故以馬虎為貴"). School difference: a 庚→寅午 variant is said to exist; not confirmed here.
 */
export const CHEONEUL: Readonly<Record<string, readonly string[]>> = {
  甲: ["丑", "未"], 戊: ["丑", "未"], 庚: ["丑", "未"],
  乙: ["子", "申"], 己: ["子", "申"],
  丙: ["亥", "酉"], 丁: ["亥", "酉"],
  辛: ["寅", "午"],
  壬: ["卯", "巳"], 癸: ["卯", "巳"],
};

/**
 * 문창귀인 by 일간. 출처 미확인: no classical passage for this table was found. Two modern tables agree entry for entry
 * (research doc). School difference: 三命通會 卷三 論太極貴 has a "文昌貴" verse that gives other branches for most stems.
 */
export const MUNCHANG: Readonly<Record<string, string>> = { 甲: "巳", 乙: "午", 丙: "申", 丁: "酉", 戊: "申", 己: "酉", 庚: "亥", 辛: "子", 壬: "寅", 癸: "卯" };

/**
 * 학당귀인 by 일간: the 장생 branch of the readings' 12운성 (양간 forward, 음간 backward, 戊己 follow 丙丁). The 장생 are
 * 三命通會 卷二 論天干陰陽生死's ("乙木生於午地" …, all ten agree). School difference: 三命通會 卷三 論學堂詞館 looks 學堂 up
 * by the 납음 element's 장생 ("長生乃學堂之正位"), not by 일간.
 */
export const HAKDANG: Readonly<Record<string, string>> = { 甲: "亥", 乙: "午", 丙: "寅", 丁: "酉", 戊: "寅", 己: "酉", 庚: "巳", 辛: "子", 壬: "申", 癸: "卯" };

/**
 * 도화·역마·화개 by the 삼합 a 연지 or 일지 belongs to. 三命通會 卷二 論咸池 (도화 = 咸池: "寅午戌卯" …), 卷三 論驛馬
 * ("申子辰人，馬在寅" …), 卷二 論將星華蓋 (화개 = the 삼합's 庫: "三合底處得庫謂之華蓋"). Every entry agrees. School
 * difference: the book reads them from the birth year (生人); also reading them from 일지 is today's practice.
 */
export const TRINE_SINSAL: ReadonlyArray<{ members: string; 도화: string; 역마: string; 화개: string }> = [
  { members: "申子辰", 도화: "酉", 역마: "寅", 화개: "辰" },
  { members: "寅午戌", 도화: "卯", 역마: "申", 화개: "戌" },
  { members: "巳酉丑", 도화: "午", 역마: "亥", 화개: "丑" },
  { members: "亥卯未", 도화: "子", 역마: "巳", 화개: "未" },
];

const PILLAR_ORDER: readonly PillarKey[] = ["year", "month", "day", "hour"];

/** The names this chart carries, each once, in SINSAL_NAMES order; each hit in pillar order, 연지's before 일지's. */
export function sinsalOf(chart: Pick<SajuChart, "pillars">): Sinsal[] {
  const { pillars } = chart;
  const visible = PILLAR_ORDER.filter((k) => pillars[k] !== null);
  const find = (targets: readonly string[], basis: SinsalBasis, basisGlyph: string, self: PillarKey | null): SinsalHit[] =>
    visible
      .filter((k) => k !== self && targets.includes(pillars[k]!.branch))
      .map((k) => ({ pillar: k, branch: pillars[k]!.branch, basis, basisGlyph }));

  const out: Sinsal[] = [];
  const add = (name: SinsalName, hits: SinsalHit[]) => {
    if (hits.length) out.push({ name, basis: hits[0]!.basis, basisGlyph: hits[0]!.basisGlyph, hits });
  };

  const dayStem = pillars.day.stem;
  add("천을귀인", find(CHEONEUL[dayStem]!, "일간", dayStem, null));
  add("문창귀인", find([MUNCHANG[dayStem]!], "일간", dayStem, null));
  add("학당귀인", find([HAKDANG[dayStem]!], "일간", dayStem, null));

  const bases = [["연지", "year"], ["일지", "day"]] as const;
  for (const name of ["도화", "역마", "화개"] as const) {
    const hits = bases.flatMap(([basis, key]) => {
      const glyph = pillars[key].branch;
      const group = TRINE_SINSAL.find((t) => t.members.includes(glyph))!;
      return find([group[name]], basis, glyph, key);
    });
    // a pillar both bases find counts once, by the first
    add(name, hits.filter((hit, i) => hits.findIndex((other) => other.pillar === hit.pillar) === i));
  }
  return out;
}
