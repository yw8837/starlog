import "server-only";
import { BRANCHES, HIDDEN_STEMS, ganzhiKo, type SajuChart, type SajuElement } from "@starlog/core";
import {
  ELEMENT_HANJA, ELEMENT_WORD, ORDER, PLACE_LABEL, PRODUCES, branchRelations, buildFactSet, elementOf, stemRelations, tenGod, yearGanzhi,
  type Placed, type Relation, type SajuFactSet, type SajuProfile,
} from "./saju";

/**
 * 우리 사이 궁합 (P5 spec §5.2): two FactSets computed by the engine, and the facts that lie between
 * them. Existence only (합·충 are never events), no score, no verdict. The model interprets.
 */

export const MATCH_RELATIONS = ["lover", "crush", "spouse", "friend", "coworker", "family"] as const;
export type MatchRelation = (typeof MATCH_RELATIONS)[number];
export const RELATION_KO: Record<MatchRelation, string> = { lover: "연인", crush: "썸", spouse: "부부", friend: "친구", coworker: "동료", family: "가족" };
export const ROMANTIC_RELATIONS: ReadonlySet<MatchRelation> = new Set(["lover", "crush", "spouse"]);

type Branch = (typeof BRANCHES)[number];
const KEYS = ["year", "month", "day", "hour"] as const;
const pad = (n: number) => String(n).padStart(2, "0");
const kstYm = (ms: number) => {
  const d = new Date(ms + 9 * 3_600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const kstYear = (ms: number) => new Date(ms + 9 * 3_600_000).getUTCFullYear();

export interface PairFacts {
  schemaVersion: "pair-facts/1";
  dayMasters: {
    me: string;
    partner: string;
    /** "하늘의 해 × 큰 강과 바다" */
    images: string;
    /** what the other's day stem is to me, and what mine is to them */
    partnerIsToMe: string;
    meIsToPartner: string;
    meeting: string;
    stems: Relation[];
  };
  elements: {
    basis: string;
    me: Record<SajuElement, number>;
    partner: Record<SajuElement, number>;
    partnerFillsMine: string[];
    mineFillsPartner: string[];
    bothMost: string[];
    bothMissing: string[];
  };
  /** 일지 × 일지 (the closest seats) */
  dayBranches: Relation[];
  /** every cross pair of branches and of stems */
  pillars: Relation[];
  luck: { me: string | null; partner: string | null; currentKo: string[]; changes: string[]; sharedYears: string[] };
  limits: string[];
}

export interface MatchFacts {
  me: SajuFactSet;
  partner: SajuFactSet;
  pair: PairFacts;
  relation: MatchRelation;
  /** how the user calls the other person, cleaned ("" → "그 사람") */
  label: string;
  /** the user's one-line concern, cleaned */
  concern: string;
  /** what the validator allows across both charts and the pair (never sent to the model) */
  allowed: SajuFactSet["allowed"];
}

function placed(chart: SajuChart, owner: string): { stems: Placed[]; branches: Placed[] } {
  const keys = KEYS.filter((k) => chart.pillars[k]);
  return {
    stems: keys.map((k) => ({ glyph: chart.pillars[k]!.stem, at: `${owner} ${PLACE_LABEL[k]}간` })),
    branches: keys.map((k) => ({ glyph: chart.pillars[k]!.branch, at: `${owner} ${PLACE_LABEL[k]}지` })),
  };
}

const glyphsOf = (chart: SajuChart) => KEYS.flatMap((k) => (chart.pillars[k] ? [chart.pillars[k]!.stem, ...chart.pillars[k]!.hidden] : []));
const element = (e: SajuElement, n?: number) => `${ELEMENT_WORD[e]}(${ELEMENT_HANJA[e]})${n === undefined ? "" : ` ${n}`}`;

/** How the two day masters' elements meet, written with the element hanja (生 helps, 剋 trims). */
export function elementMeeting(mine: SajuElement, theirs: SajuElement): string {
  const a = ELEMENT_HANJA[mine];
  const b = ELEMENT_HANJA[theirs];
  if (mine === theirs) return `두 일간이 같은 ${element(mine)} 기운이에요`;
  if (PRODUCES[mine] === theirs) return `${a}生${b}: 내 일간이 그 사람의 일간을 돕는 쪽이에요`;
  if (PRODUCES[theirs] === mine) return `${b}生${a}: 그 사람의 일간이 내 일간을 돕는 쪽이에요`;
  if (PRODUCES[PRODUCES[mine]] === theirs) return `${a}剋${b}: 내 일간이 그 사람의 일간을 다듬는(누르는) 쪽이에요`;
  return `${b}剋${a}: 그 사람의 일간이 내 일간을 다듬는(누르는) 쪽이에요`;
}

function luckNow(f: SajuFactSet, who: string): string | null {
  const c = f.luck?.current;
  return c ? `${who}: ${c.from}~${c.to} ${c.ko}(${c.gz}) 대운 · 천간 ${c.stemTenGod} · 지지 대표 글자 ${c.branchMainTenGod}` : null;
}

function luckChanges(f: SajuFactSet, who: string, now: number): Array<{ year: number; line: string }> {
  const from = kstYm(now);
  const until = kstYm(now + 3 * 365 * 86_400_000);
  return (f.luck?.cycles ?? [])
    .filter((c) => c.from !== null && c.from > from && c.from <= until)
    .map((c) => ({ year: Number(c.from!.slice(0, 4)), line: `${who}: ${c.from} 무렵 ${c.ko}(${c.gz}) 대운으로 바뀌어요` }));
}

/** This year and the next two: the 세운 that meets both day branches (함께 움직임이 커지는 해). */
function sharedYears(myDay: string, theirDay: string, now: number): Array<{ year: number; gz: string; line: string }> {
  const out: Array<{ year: number; gz: string; line: string }> = [];
  for (let year = kstYear(now); year <= kstYear(now) + 2; year++) {
    const gz = yearGanzhi(year);
    const at: Placed = { glyph: gz.charAt(1), at: `${year}년 세운 지지` };
    const mine = branchRelations(at, { glyph: myDay, at: "나의 일지" });
    const theirs = branchRelations(at, { glyph: theirDay, at: "그 사람의 일지" });
    if (mine.length && theirs.length) {
      out.push({ year, gz, line: `${year}년 ${ganzhiKo(gz)}(${gz}): 나의 일지와 ${mine.map((r) => r.type).join("·")}, 그 사람의 일지와 ${theirs.map((r) => r.type).join("·")}` });
    }
  }
  return out;
}

export function buildMatchFacts(
  meChart: SajuChart,
  partnerChart: SajuChart,
  input: { relation: MatchRelation; label?: string; concern?: string; meProfile?: SajuProfile },
  now: number,
): MatchFacts {
  const a = buildFactSet(meChart, now, input.meProfile);
  const b = buildFactSet(partnerChart, now);
  const myDay = meChart.pillars.day;
  const theirDay = partnerChart.pillars.day;
  const mine = placed(meChart, "나의");
  const theirs = placed(partnerChart, "그 사람의");

  const pillars: Relation[] = [];
  for (const x of mine.branches) for (const y of theirs.branches) pillars.push(...branchRelations(x, y));
  for (const x of mine.stems) for (const y of theirs.stems) pillars.push(...stemRelations(x, y));

  const ce = a.elements.counts;
  const pe = b.elements.counts;
  const maxA = Math.max(...ORDER.map((e) => ce[e]));
  const maxB = Math.max(...ORDER.map((e) => pe[e]));
  const years = sharedYears(myDay.branch, theirDay.branch, now);
  const changes = [...luckChanges(a, "나", now), ...luckChanges(b, "그 사람", now)];

  const pair: PairFacts = {
    schemaVersion: "pair-facts/1",
    dayMasters: {
      me: a.dayMaster.display,
      partner: b.dayMaster.display,
      images: `${a.dayMaster.image} × ${b.dayMaster.image}`,
      partnerIsToMe: tenGod(myDay.stem, theirDay.stem),
      meIsToPartner: tenGod(theirDay.stem, myDay.stem),
      meeting: elementMeeting(elementOf(myDay.stem), elementOf(theirDay.stem)),
      stems: stemRelations({ glyph: myDay.stem, at: "나의 일간" }, { glyph: theirDay.stem, at: "그 사람의 일간" }),
    },
    elements: {
      basis: a.elements.basis,
      me: { ...ce },
      partner: { ...pe },
      partnerFillsMine: ORDER.filter((e) => ce[e] === 0 && pe[e] > 0).map((e) => element(e, pe[e])),
      mineFillsPartner: ORDER.filter((e) => pe[e] === 0 && ce[e] > 0).map((e) => element(e, ce[e])),
      bothMost: ORDER.filter((e) => ce[e] === maxA && pe[e] === maxB).map((e) => element(e)),
      bothMissing: ORDER.filter((e) => ce[e] === 0 && pe[e] === 0).map((e) => element(e)),
    },
    dayBranches: branchRelations({ glyph: myDay.branch, at: "나의 일지" }, { glyph: theirDay.branch, at: "그 사람의 일지" }),
    pillars,
    luck: {
      me: luckNow(a, "나"),
      partner: luckNow(b, "그 사람"),
      currentKo: [a.luck?.current?.ko, b.luck?.current?.ko].filter((ko): ko is string => Boolean(ko)),
      changes: changes.map((c) => c.line),
      sharedYears: years.map((y) => y.line),
    },
    limits: [
      ...(a.input.timeKnown ? [] : ["나는 태어난 시를 몰라 시주 없이 여섯 글자로 읽었어요."]),
      ...(b.input.timeKnown ? [] : ["그 사람은 태어난 시를 몰라 시주 없이 여섯 글자로 읽었어요."]),
      // No 점수 or 궁합 wording: the model copies this line, and those words are hard violations.
      "두 사람을 좋고 나쁨으로 가르거나 수치로 매기지 않았어요.",
    ],
  };

  const glyphs = new Set([...a.allowed.glyphs, ...b.allowed.glyphs]);
  for (const y of years) {
    for (const g of y.gz) glyphs.add(g);
    HIDDEN_STEMS[y.gz.charAt(1) as Branch].forEach((g) => glyphs.add(g));
  }
  const tenGods = new Set([...a.allowed.tenGods, ...b.allowed.tenGods]);
  for (const g of glyphsOf(partnerChart)) tenGods.add(tenGod(myDay.stem, g));
  for (const g of glyphsOf(meChart)) tenGods.add(tenGod(theirDay.stem, g));
  const allowedYears = new Set([...a.allowed.years, ...b.allowed.years, ...years.map((y) => y.year), ...changes.map((c) => c.year)]);

  return {
    me: a,
    partner: b,
    pair,
    relation: input.relation,
    label: input.label ?? "",
    concern: input.concern ?? "",
    allowed: {
      glyphs: [...glyphs],
      tenGods: [...tenGods],
      stages: [...new Set([...a.allowed.stages, ...b.allowed.stages])],
      years: [...allowedYears].sort((x, y) => x - y),
    },
  };
}
