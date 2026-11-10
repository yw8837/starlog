import { relationsWithin, type PillarKey, type Placed, type SajuChart } from "@starlog/core";

/**
 * 글자끼리 맺은 관계 on the free 명식 (spec 2026-11-11, 정통 사주에 충·합 … 안, F C13): which glyphs join (합) or face each other
 * (충), from core's relation tables (packages/core/src/saju/relations.ts; sources in docs/research/saju-tables-sources-2026-11.md),
 * named in plain words with the term in brackets and where they stand. Only 육합, 삼합, 방합, 천간합 and 충: 형·파·해 are held back
 * (their names alone read as punishment, breaking, harm, and the tables differ by school), and so are 반합 and 천간충. A chip
 * says a pattern is there, never what it will bring.
 */

export const RELATION_TITLE = "글자끼리 맺은 관계";
/** Names what the chips cover (SHOWN), so it stays true when only a held-back pair (반합, 천간충, 형·파·해) stands (review 7). */
export const RELATION_NONE = "육합·삼합·방합·천간합·충으로 맺은 글자 짝은 없어요.";
export const RELATION_NOT_EVENT = "사건으로 읽지 않아요. 이런 배치가 있다는 것만 보여 줘요.";

export interface RelationChip {
  /** the plain name: 묶이려는 짝 */
  name: string;
  /** the term, with the element for a group: 육합, 삼합 · 물 기운 */
  term: string;
  /** where its glyphs stand: 연주 아래 子 · 월주 아래 丑 */
  places: string;
  /** its pillars, short, to tell two chips of one name apart: 연주·월주 */
  pillars: string;
}

const KEYS: readonly PillarKey[] = ["year", "month", "day", "hour"];
const PILLAR: Readonly<Record<PillarKey, string>> = { year: "연주", month: "월주", day: "일주", hour: "시주" };

/** The relation types shown, by how core names them, with their plain names. */
const SHOWN: ReadonlyArray<readonly [prefix: string, name: string, term: string]> = [
  ["육합(", "묶이려는 짝", "육합"],
  ["삼합(", "세 글자가 모인 무리", "삼합"],
  ["방합(", "계절이 모인 무리", "방합"],
  ["천간합(", "위 글자끼리 묶이려는 짝", "천간합"],
  ["충(", "정면으로 마주 보는 짝", "충"],
];

/** "子(연주 아래)" → "연주 아래 子" */
const place = (member: string) => member.replace(/^(.)\((.+)\)$/, "$2 $1");

export function relationChips(chart: Pick<SajuChart, "pillars">): RelationChip[] {
  const stems: Placed[] = [];
  const branches: Placed[] = [];
  for (const key of KEYS) {
    const pillar = chart.pillars[key];
    if (!pillar) continue;
    stems.push({ glyph: pillar.stem, at: `${PILLAR[key]} 위` });
    branches.push({ glyph: pillar.branch, at: `${PILLAR[key]} 아래` });
  }
  return relationsWithin(stems, branches).flatMap((relation) => {
    const shown = SHOWN.find(([prefix]) => relation.type.startsWith(prefix));
    if (!shown) return [];
    const element = /, (.+ 기운)\)$/.exec(relation.type)?.[1];
    const pillars = [...new Set(relation.members.flatMap((m) => [...m.matchAll(/(연주|월주|일주|시주)/g)].map((x) => x[1]!)))].join("·");
    return [{ name: shown[1], term: element ? `${shown[2]} · ${element}` : shown[2], places: relation.members.map(place).join(" · "), pillars }];
  });
}
