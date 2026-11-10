// 합·충·형·파·해 between glyphs (existence only; no strength, no outcome). Moved unchanged from
// apps/web/lib/ai/prompts/saju.ts (spec 2026-11-11-saju-grade-card-design.md F, C1) so the browser can use them.
// Sources, read on zh.wikisource 2026-11-11 (table by table, with the cross-checks and school differences):
// docs/research/saju-tables-sources-2026-11.md. 五行大義 = 蕭吉, 隋 (卷二: zh.wikisource.org/wiki/五行大義/2);
// 三命通會 = 萬民英, 明 (卷二: zh.wikisource.org/wiki/三命通會/卷二).

import type { SajuElement } from "./labels";

/** Plain words for the elements, as the readings write them (쇠, not 금). */
const ELEMENT_WORD: Record<SajuElement, string> = { 목: "나무", 화: "불", 토: "흙", 금: "쇠", 수: "물" };

const pairs = (list: string[][]) => list.map(([a, b]) => new Set([a!, b!]));
/** 육합. 五行大義 卷二 第八 論合 ("故寅與亥合" …, six pairs); 三命通會 卷二 論支元六合 ("子合丑，寅合亥"). Schools agree. */
export const SIX_COMBINE = pairs([["子", "丑"], ["寅", "亥"], ["卯", "戌"], ["辰", "酉"], ["巳", "申"], ["午", "未"]]);
/** 충. 五行大義 卷二 第十三 論衝破 ("子午衝破。丑未衝破" …, six pairs); 三命通會 卷二 論沖擊 ("地支取七位為沖"). Schools agree. */
export const SIX_CLASH = pairs([["子", "午"], ["丑", "未"], ["寅", "申"], ["卯", "酉"], ["辰", "戌"], ["巳", "亥"]]);
/** 해. 五行大義 卷二 第十二 論害 ("名爲六害"); 三命通會 卷二 論六害 ("子未相害" …). Schools agree. */
export const HARM = pairs([["子", "未"], ["丑", "午"], ["寅", "巳"], ["卯", "辰"], ["申", "亥"], ["酉", "戌"]]);
/**
 * 파. Not in 五行大義 or 三命通會: 五行大義's 衝破 is the 충 above. The pairs are 六壬大全 冲破課's ("午卯破、子酉破" …,
 * 亥寅·申巳 "先破後合"), a 六壬 book, and today's 명리 lists'. School difference: the 子平 classics read here have no 파
 * table, and 寅亥·巳申 are 육합 and 파 at once.
 */
export const BREAK = pairs([["子", "酉"], ["午", "卯"], ["巳", "申"], ["寅", "亥"], ["辰", "丑"], ["戌", "未"]]);
/**
 * 삼형 (any two of a trio count, as both books spell them pair by pair). 五行大義 卷二 第十一 論刑 ("寅刑在巳。巳刑在申");
 * 三命通會 卷二 論三刑 (寅巳申 無恩, 丑戌未 恃勢, 子卯 無禮). Whether two of three already make 형 is a school difference
 * (the spec's A8; hence the note "유파에 따라 형으로 봄"); we did not check other books on it.
 */
export const PUNISH_TRIOS = [["寅", "巳", "申"], ["丑", "戌", "未"]];
/**
 * 삼합 and its 왕지 (center). 三命通會 卷二 論支元三合 ("故申子辰為水局", the others "皆然"; 子 is 水 at its 旺). The
 * 반합 rule below (two of three, one of them the center) has no source we could confirm (출처 미확인); bonds/score.ts
 * counts any two of a trio, a school difference kept on purpose (see there).
 */
export const TRINES = [
  { members: ["申", "子", "辰"], element: "수" as SajuElement, center: "子" },
  { members: ["亥", "卯", "未"], element: "목" as SajuElement, center: "卯" },
  { members: ["寅", "午", "戌"], element: "화" as SajuElement, center: "午" },
  { members: ["巳", "酉", "丑"], element: "금" as SajuElement, center: "酉" },
];
/**
 * 방합: the three branches of one season. 滴天髓 方局論 ("方是方兮局是局", 寅卯辰 東方); the four groups as 三命通會 卷二
 * 論三刑 lines them up (寅卯辰·巳午未·申酉戌·亥子丑). 滴天髓 calls 방 mixed with 국 混局; we only name each that stands.
 */
export const SEASONS = [
  { members: ["寅", "卯", "辰"], element: "목" as SajuElement },
  { members: ["巳", "午", "未"], element: "화" as SajuElement },
  { members: ["申", "酉", "戌"], element: "금" as SajuElement },
  { members: ["亥", "子", "丑"], element: "수" as SajuElement },
];
/** Named only when all three branches stand (existence; 化 is never judged). */
const TRIOS = [
  ...TRINES.map((t) => ({ glyphs: t.members, type: `삼합(三合, ${ELEMENT_WORD[t.element]} 기운)` })),
  ...SEASONS.map((s) => ({ glyphs: s.members, type: `방합(方合, ${ELEMENT_WORD[s.element]} 기운)` })),
];
/** 천간합. 五行大義 卷二 第八 論合 ("故甲與己合" …); 三命通會 卷二 論十干合 ("所以乙與庚合" …). Whether it 化s is never judged. */
export const STEM_COMBINE = pairs([["甲", "己"], ["乙", "庚"], ["丙", "辛"], ["丁", "壬"], ["戊", "癸"]]);
/**
 * 천간충, four pairs (戊己 meet none). 五行大義 卷二 第十三 論衝破 ("干衝破者。甲庚衝破"). A second independent source was not
 * found (see the research doc); other 천간충 lists are not checked here.
 */
export const STEM_CLASH = pairs([["甲", "庚"], ["乙", "辛"], ["丙", "壬"], ["丁", "癸"]]);

/** One glyph in two layers (원국, 대운, 세운, 월건) or two charts; a whole pillar is 같은 간지. Neutral words, not 自刑·伏吟. */
export const SAME_GLYPH = "같은 글자";
export const SAME_PILLAR = "같은 간지";

const hasPair = (list: Set<string>[], a: string, b: string) => a !== b && list.some((set) => set.has(a) && set.has(b));

export interface Relation {
  type: string;
  members: string[];
  note?: string;
}

export interface Placed {
  glyph: string;
  /** "년지", "월간", "세운 지지" … */
  at: string;
}

const SAME_NOTE = "같은 글자가 겹침";

/**
 * `sameChart`: both glyphs stand in one chart, the only place 자형 is read; elsewhere an identical glyph is 같은 글자.
 * 자형 辰午酉亥: 五行大義 卷二 第十一 論刑 ("辰午酉亥各自刑"); 三命通會 卷二 論三刑. Reading it only inside one chart is our rule.
 */
export function branchRelations(a: Placed, b: Placed, sameChart = false): Relation[] {
  const members = [`${a.glyph}(${a.at})`, `${b.glyph}(${b.at})`];
  const out: Relation[] = [];
  if (hasPair(SIX_COMBINE, a.glyph, b.glyph)) out.push({ type: "육합(六合)", members, note: "묶이려는 짝" });
  if (hasPair(SIX_CLASH, a.glyph, b.glyph)) out.push({ type: "충(沖)", members, note: "정면으로 맞서는 짝" });
  if (hasPair(HARM, a.glyph, b.glyph)) out.push({ type: "해(害)", members });
  if (hasPair(BREAK, a.glyph, b.glyph)) out.push({ type: "파(破)", members });
  const trio = PUNISH_TRIOS.find((t) => a.glyph !== b.glyph && t.includes(a.glyph) && t.includes(b.glyph));
  if (trio) out.push({ type: "형(刑)", members, note: `${trio.join("")} 삼형 가운데 두 글자라 유파에 따라 형으로 봄` });
  if (hasPair(pairs([["子", "卯"]]), a.glyph, b.glyph)) out.push({ type: "형(刑)", members, note: "子卯 상형" });
  if (a.glyph === b.glyph) {
    if (!sameChart) out.push({ type: SAME_GLYPH, members, note: SAME_NOTE });
    else if (["辰", "午", "酉", "亥"].includes(a.glyph)) out.push({ type: "자형(自刑)", members });
  }
  const trine = TRINES.find((t) => a.glyph !== b.glyph && t.members.includes(a.glyph) && t.members.includes(b.glyph) && [a.glyph, b.glyph].includes(t.center));
  if (trine) out.push({ type: `반합(半合, ${ELEMENT_WORD[trine.element]} 기운)`, members, note: "세 글자 가운데 두 글자" });
  return out;
}

export function stemRelations(a: Placed, b: Placed, sameChart = false): Relation[] {
  const members = [`${a.glyph}(${a.at})`, `${b.glyph}(${b.at})`];
  const out: Relation[] = [];
  if (hasPair(STEM_COMBINE, a.glyph, b.glyph)) out.push({ type: "천간합(天干合)", members, note: "위 글자끼리 묶이려는 짝" });
  if (hasPair(STEM_CLASH, a.glyph, b.glyph)) out.push({ type: "천간충(天干沖)", members });
  if (!sameChart && a.glyph === b.glyph) out.push({ type: SAME_GLYPH, members, note: SAME_NOTE });
  return out;
}

/** A 삼합·방합 and every placed glyph it covers ("巳(시지)"), while its members name a glyph once with all its places ("巳(년지·시지)"). */
export interface Trio {
  relation: Relation;
  covers: string[];
}

/**
 * The 삼합·방합 that `natal` completes together with every one of `layers` (without any one layer it would
 * not); with no layers, the ones the natal chart completes alone.
 */
export function trios(natal: Placed[], layers: Placed[] = []): Trio[] {
  const all = [...natal, ...layers];
  const complete = (placed: Placed[], glyphs: readonly string[]) => glyphs.every((g) => placed.some((p) => p.glyph === g));
  return TRIOS
    .filter((t) => complete(all, t.glyphs) && layers.every((layer) => !complete(all.filter((p) => p !== layer), t.glyphs)))
    .map((t) => {
      const placed = all.filter((p) => t.glyphs.includes(p.glyph));
      const glyphs = [...new Set(placed.map((p) => p.glyph))];
      return {
        relation: {
          type: t.type,
          members: glyphs.map((g) => `${g}(${placed.filter((p) => p.glyph === g).map((p) => p.at).join("·")})`),
          note: layers.length ? "원국과 운의 글자가 함께 세 글자를 채움" : "세 글자가 모두 있음",
        },
        covers: placed.map((p) => `${p.glyph}(${p.at})`),
      };
    });
}

/** The trios in place of the 반합 pairs they cover (반합 is two of the three; with the third there it is the 삼합). */
export function withTrios(relations: Relation[], found: Trio[]): Relation[] {
  const covered = (r: Relation) => r.type.startsWith("반합") && found.some((t) => r.members.every((m) => t.covers.includes(m)));
  return [...relations.filter((r) => !covered(r)), ...found.map((t) => t.relation)];
}

export function relationsWithin(stems: Placed[], branches: Placed[]): Relation[] {
  const out: Relation[] = [];
  for (let i = 0; i < branches.length; i++) for (let j = i + 1; j < branches.length; j++) out.push(...branchRelations(branches[i]!, branches[j]!, true));
  for (let i = 0; i < stems.length; i++) for (let j = i + 1; j < stems.length; j++) out.push(...stemRelations(stems[i]!, stems[j]!, true));
  return withTrios(out, trios(branches));
}
