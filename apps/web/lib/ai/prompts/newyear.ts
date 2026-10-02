import "server-only";
import { BRANCHES, HIDDEN_STEMS, computeChart, ganzhiKo, type SajuChart, type SajuElement } from "@starlog/core";
import {
  ELEMENT_HANJA, ELEMENT_WORD, ORDER, PLACE_LABEL, branchRelations, buildFactSet, relationsTo, tenGod,
  type Placed, type Relation, type SajuFactSet, type SajuProfile,
} from "./saju";

/**
 * 2027 신년운세 (P5 spec §5.3). The FactSet is computed as of mid-2027 (세운 丁未, the 대운 that 2027
 * sits in); on top: January's 세운 (still 丙午 before 입춘), the twelve 월건 from the engine (the 15th
 * of each month, noon, Seoul) with their ten gods and relations, a 대운 change inside 2027, and one
 * light lucky element. Months are shown 양력 1–12월, each read by the 월건 that starts in it.
 */

export const NEWYEAR_YEAR = 2027;
export const NEWYEAR_REFERENCE_MS = Date.parse("2027-07-01T00:00:00+09:00");

/** The month probes only need the 월건 and the year pillar, so the place is Seoul (the 절 is an instant). */
const SEOUL = { name: "서울", longitude: 126.978 };

type Branch = (typeof BRANCHES)[number];
const KEYS = ["year", "month", "day", "hour"] as const;
const pad = (n: number) => String(n).padStart(2, "0");

export interface MonthFact {
  month: number;
  gz: string;
  ko: string;
  display: string;
  /** the 세운 in force on the 15th (丙午 in January, 丁未 after 입춘) */
  yearGz: string;
  stemTenGod: string;
  branchMainTenGod: string;
  relationsToNatal: Relation[];
  relationToYear: Relation[];
  /** the 절 that opens this 월건, KST "2월 4일 10:46" (headings only, never body text) */
  term: { name: string; kst: string } | null;
}

export interface YearFacts {
  schemaVersion: "year-facts/1";
  year: 2027;
  january: { gz: string; ko: string; stemTenGod: string; branchMainTenGod: string; relationsToNatal: Relation[] };
  months: MonthFact[];
  luckChange: string | null;
  lucky: { elementKey: SajuElement; element: string; color: string; habit: string; note: string };
}

export interface NewYearFacts {
  facts: SajuFactSet;
  year: YearFacts;
  allowed: SajuFactSet["allowed"];
}

const COLOR: Record<SajuElement, string> = { 목: "초록색", 화: "빨간색", 토: "노란색", 금: "흰색", 수: "남색" };
const HABIT: Record<SajuElement, string> = {
  목: "아침에 창을 열고 식물 하나를 돌보기",
  화: "햇볕 아래에서 10분 걷기",
  토: "주말마다 한 곳을 정해 정리하기",
  금: "하루 한 번 책상 위를 비우기",
  수: "물 한 컵으로 하루를 시작하기",
};

function kstMinute(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function natalPlaces(chart: SajuChart): { stems: Placed[]; branches: Placed[] } {
  const keys = KEYS.filter((k) => chart.pillars[k]);
  return {
    stems: keys.map((k) => ({ glyph: chart.pillars[k]!.stem, at: `${PLACE_LABEL[k]}간` })),
    branches: keys.map((k) => ({ glyph: chart.pillars[k]!.branch, at: `${PLACE_LABEL[k]}지` })),
  };
}

const mainHidden = (gz: string) => HIDDEN_STEMS[gz.charAt(1) as Branch][0]!;

export function buildNewYearFacts(chart: SajuChart, profile?: SajuProfile): NewYearFacts {
  const facts = buildFactSet(chart, NEWYEAR_REFERENCE_MS, profile);
  const day = chart.pillars.day.stem;
  const { stems, branches } = natalPlaces(chart);

  const months: MonthFact[] = Array.from({ length: 12 }, (_, i) => {
    const probe = computeChart({ calendar: "solar", year: NEWYEAR_YEAR, month: i + 1, day: 15, time: { hour: 12, minute: 0 }, gender: "female", place: SEOUL });
    const gz = probe.pillars.month.stem + probe.pillars.month.branch;
    const yearGz = probe.pillars.year.stem + probe.pillars.year.branch;
    return {
      month: i + 1,
      gz,
      ko: ganzhiKo(gz),
      display: `${ganzhiKo(gz)}(${gz})`,
      yearGz,
      stemTenGod: tenGod(day, gz.charAt(0)),
      branchMainTenGod: tenGod(day, mainHidden(gz)),
      relationsToNatal: relationsTo({ glyph: gz.charAt(0), at: `${i + 1}월 월건 천간` }, { glyph: gz.charAt(1), at: `${i + 1}월 월건 지지` }, stems, branches),
      relationToYear: branchRelations({ glyph: gz.charAt(1), at: `${i + 1}월 월건 지지` }, { glyph: yearGz.charAt(1), at: "세운 지지" }),
      term: probe.monthStartTerm ? { name: probe.monthStartTerm.name, kst: kstMinute(probe.monthStartTerm.instantUTC) } : null,
    };
  });

  const jan = months[0]!.yearGz;
  const january = {
    gz: jan,
    ko: ganzhiKo(jan),
    stemTenGod: tenGod(day, jan.charAt(0)),
    branchMainTenGod: tenGod(day, mainHidden(jan)),
    relationsToNatal: relationsTo({ glyph: jan.charAt(0), at: "1월 세운 천간" }, { glyph: jan.charAt(1), at: "1월 세운 지지" }, stems, branches),
  };

  const change = (facts.luck?.cycles ?? []).find((c) => c.from !== null && c.from >= "2027-01" && c.from <= "2027-12");
  const least = ORDER.reduce<SajuElement>((min, e) => (chart.elements[e] < chart.elements[min] ? e : min), ORDER[0]!);

  const glyphs = new Set(facts.allowed.glyphs);
  const tenGods = new Set(facts.allowed.tenGods);
  for (const gz of [jan, ...months.map((m) => m.gz)]) {
    for (const g of gz) glyphs.add(g);
    tenGods.add(tenGod(day, gz.charAt(0)));
    for (const g of HIDDEN_STEMS[gz.charAt(1) as Branch]) {
      glyphs.add(g);
      tenGods.add(tenGod(day, g));
    }
  }

  return {
    facts,
    year: {
      schemaVersion: "year-facts/1",
      year: 2027,
      january,
      months,
      luckChange: change ? `${change.from} 무렵 ${change.ko}(${change.gz}) 대운으로 바뀌어요` : null,
      lucky: { elementKey: least, element: `${ELEMENT_WORD[least]}(${ELEMENT_HANJA[least]})`, color: COLOR[least], habit: HABIT[least], note: "재미로 보는 가벼운 제안이에요" },
    },
    allowed: {
      glyphs: [...glyphs],
      tenGods: [...tenGods],
      stages: facts.allowed.stages,
      years: [...new Set([...facts.allowed.years, 2026, 2027, 2028])].sort((a, b) => a - b),
    },
  };
}

/** Code-owned month headings: "1월 · 신축월 (아직 병오년, 입춘 전)", "2월 · 임인월 (4일 입춘부터 정미년)", "3월 · 계묘월 (6일 경칩부터)". */
export function monthHeading(m: MonthFact, january: YearFacts["january"]): string {
  if (m.month === 1) return `1월 · ${m.ko}월 (아직 ${january.ko}년, 입춘 전)`;
  const day = m.term?.kst.match(/^\d+월 (\d+)일/)?.[1];
  if (m.month === 2) return `2월 · ${m.ko}월 (${day ?? ""}일 입춘부터 ${ganzhiKo(m.yearGz)}년)`;
  return `${m.month}월 · ${m.ko}월${m.term && day ? ` (${day}일 ${m.term.name}부터)` : ""}`;
}
