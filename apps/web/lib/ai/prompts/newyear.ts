import "server-only";
import { BRANCHES, HIDDEN_STEMS, ganzhiKo, mainHiddenStem, type SajuChart, type SajuElement } from "@starlog/core";
import type { NewYearPartA, NewYearPartB } from "../premiumSchemas";
import { MODEL_BLIND_RULE } from "../style";
import {
  ELEMENT_HANJA, ELEMENT_WORD, ORDER, SAME_GLYPH, SAME_PILLAR, SAJU_PREAMBLE, buildFactSet, factsBlock, layerToNatal, monthPillarAt, natalPillars, tenGod,
  userContextBlock, type MonthPillar, type Relation, type SajuFactSet, type SajuProfile,
} from "./saju";

/**
 * 2027 신년운세 (P5 spec §5.3). The FactSet is computed as of mid-2027 (세운 丁未, the 대운 that 2027
 * sits in); on top: January's 세운 (still 丙午 before 입춘), the twelve 월건 from the engine (the 15th
 * of each month, noon, Seoul) with their ten gods and relations, a 대운 change inside 2027, and one
 * light lucky element. Months are shown 양력 1–12월, each read by the 월건 that starts in it.
 */

export const NEWYEAR_YEAR = 2027;
export const NEWYEAR_REFERENCE_MS = Date.parse("2027-07-01T00:00:00+09:00");

type Branch = (typeof BRANCHES)[number];

/**
 * A month of 2027 (the 15th, 12:00 KST). `yearGz` is the 세운 in force then (丙午 in January, 丁未 after
 * 입춘); `term.kst` ("2월 4일 10:46") is for headings only, never body text.
 */
export interface MonthFact extends MonthPillar {
  month: number;
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

export function buildNewYearFacts(chart: SajuChart, profile?: SajuProfile): NewYearFacts {
  // the twelve 월건 below take the place of the standard reading's this and next month
  const facts = buildFactSet(chart, NEWYEAR_REFERENCE_MS, profile, undefined, { monthly: false });
  const day = chart.pillars.day.stem;
  const natal = natalPillars(chart);

  const months: MonthFact[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    ...monthPillarAt(Date.UTC(NEWYEAR_YEAR, i, 15, 3), `${i + 1}월 월건`, day, natal), // the 15th, 12:00 KST
  }));

  const jan = months[0]!.yearGz;
  const january = {
    gz: jan,
    ko: ganzhiKo(jan),
    stemTenGod: tenGod(day, jan.charAt(0)),
    branchMainTenGod: tenGod(day, mainHiddenStem(jan.charAt(1))),
    relationsToNatal: layerToNatal({ at: "1월 세운", stem: { glyph: jan.charAt(0), at: "1월 세운 천간" }, branch: { glyph: jan.charAt(1), at: "1월 세운 지지" } }, natal),
  };

  const change = (facts.luck?.cycles ?? []).find((c) => c.from !== null && c.from >= "2027-01" && c.from <= "2027-12");
  const least = ORDER.reduce<SajuElement>((min, e) => (chart.elements[e] < chart.elements[min] ? e : min), ORDER[0]!);

  const glyphs = new Set(facts.allowed.glyphs);
  const tenGods = new Set(facts.allowed.tenGods);
  for (const gz of [jan, ...months.map((m) => m.gz)]) {
    for (const g of gz) glyphs.add(g);
    tenGods.add(tenGod(day, gz.charAt(0)));
    for (const h of HIDDEN_STEMS[gz.charAt(1) as Branch]) {
      glyphs.add(h.stem);
      tenGods.add(tenGod(day, h.stem));
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

// ---- prompts ----

const NEWYEAR_FORMATS = `# 작업별 형식 (2027 신년운세)

이 풀이는 2027년 한 해를 다뤄요. <facts>는 2027년 7월 기준으로 계산한 명식 사실(2027 세운 정미년과 그해의 대운)이고, <year_facts>는 1월(아직 병오년)의 세운, 열두 달의 월건과 그 십성·원국과의 관계, 2027년 안의 대운 변화, 가벼운 행운 요소예요. 모두 계산된 사실이에요.
- 위 규칙 가운데 프롤로그의 절을 가리키는 말은 이 풀이에서 이렇게 옮겨 읽어요: 한 줄 고민은 overview의 앞부분에서 먼저 답하고, 연애 상태에 따른 결혼 이야기는 areas.relations에서, luck.changeSoon은 luck 절에서 먼저 다루고, limits의 문장은 luck 절 끝에 짧게 담아요.
- 달은 양력 1월부터 12월로 말하고, 각 달은 <year_facts>의 그 달 월건으로 읽어요. 1월은 아직 병오년이라는 점을 1월 문단에서 한 번 밝혀요.
- 좋은 달·나쁜 달·조심할 달 같은 등급을 쓰지 않아요. 달마다 어떤 성격의 기운이 실리는지, 그때 무엇을 하면 좋은지 조건으로 말해요.
- 날짜·요일·시각을 지정하지 않아요. 달과 국면으로만 말해요.
- 건강은 수면, 식사, 몸을 움직이는 습관, 쉬는 리듬 같은 생활 습관으로만 말해요. 장기·질병·증상 이름을 쓰지 않아요.
- 돈은 흐름과 습관, 점검할 것까지만 말해요. 투자·매수·대출 권유와 금액 예측은 쓰지 않아요.
- 행운 요소는 "재미로 보는" 가벼운 제안이라는 점을 밝히고, 숫자·방위·복권 이야기는 쓰지 않아요.

## newyear-teaser (무료 미리보기)
- title: 2027년 한 해의 테마, 4~14자(예: "불씨를 옮겨 심는 해").
- summary: 300~400자. 2027 정미년 세운이 내 일간에게 어떤 십성인지(해석임을 드러내는 말로) → 원국과 관계가 있으면 그 사실 → 2027년 안에 대운이 바뀌면 그 사실 → <user_context>가 있으면 그에 닿는 한 문장 → 1월에 해 볼 작은 일 하나. 달별 이야기는 쓰지 않아요.

## newyear-a (한 해의 큰 흐름)
- title: teaser의 title 규칙과 같아요.
- overview.body (500~700자): 2027 세운(정미)의 천간·지지 십성, 원국과의 관계, 이것이 한 해에 만드는 국면. 그 경향이 드러나는 장면을 묻는 질문 하나.
- luck.body (300~450자): 2027년이 속한 대운(간지·기간·십성)과 세운의 접점. 2027년 안에 대운이 바뀌면 그 시점과 앞뒤 차이를 분명하게.
- areas.work / money / relations / health (각 280~400자): 영역마다 그 사람의 상태(<user_context>)에 맞는 장면 하나와 작은 실험 하나. 영역마다 다른 장면을 써요.
- lucky.body (120~220자): <year_facts>의 행운 요소(색과 작은 습관)를 재미로 보는 제안으로.

## newyear-b (1월~6월)
- <earlier>는 이미 쓴 한 해의 큰 흐름의 첫 문장들이에요. 되풀이하지 말고 달마다 새 장면을 써요.
- firstHalf: 1월부터 6월까지 정확히 6개, 순서대로. body는 달마다 280~380자: 그 달 월건(display 표기)이나 그 십성을 한 번 이상 부르고 → 그 달의 국면 → 그 사람 상황의 장면 하나 → 그 달에 해 볼 일 하나.

## newyear-c (7월~12월과 마무리)
- <earlier>는 이미 쓴 절들의 첫 문장이에요.
- secondHalf: 7월부터 12월까지 정확히 6개, firstHalf와 같은 규칙.
- closing.body (250~380자): 한 해를 보내는 방법. 열두 달 가운데 기억해 둘 두세 달을 이유와 함께 짚되 등급을 매기지 않아요.
- observation.body (80~180자): 1월(또는 지금 달)에 확인해 볼 신호 하나, 관찰로.
- followUps: 이어서 물어볼 만한 질문 2개(각 30자 이하).

## newyear-followup (이어서 물어보기)
- <reading_digest>는 사용자가 받은 풀이의 소제목·첫 문장과 질문에 맞는 절의 원문이에요. 표준 followup 규칙과 같아요(kind 하나, answer 150~450자, 같은 명식과 같은 읽기로 이어서). 특정 날짜를 묻는 질문에는 달과 국면으로 답해요.`;

// SAJU_PREAMBLE already carries the blind rule (Task A); either way it appears exactly once.
const sajuBlind = SAJU_PREAMBLE.includes(MODEL_BLIND_RULE) ? "" : `\n\n${MODEL_BLIND_RULE}`;
export const NEWYEAR_SYSTEM = `${SAJU_PREAMBLE}${sajuBlind}\n\n${NEWYEAR_FORMATS}`;

export const NEWYEAR_HEADINGS = {
  overview: "2027 정미년과 나의 명식",
  luck: "지금의 10년 속 2027년",
  areas: "영역별로 보면",
  work: "일",
  money: "돈",
  relations: "관계",
  health: "몸과 생활 리듬",
  lucky: "2027년을 가볍게 돕는 것",
  closing: "한 해를 보내는 방법",
  observation: "첫 달에 확인해 볼 신호",
} as const;

export function newyearLockedToc(n: NewYearFacts): string[] {
  const h = NEWYEAR_HEADINGS;
  return [h.overview, h.luck, h.work, h.money, h.relations, h.health, h.lucky, ...n.year.months.map((m) => monthHeading(m, n.year.january)), h.closing, h.observation];
}

export function newyearPreviewFacts(n: NewYearFacts): string[] {
  const a = n.facts.annual;
  // each relation once; 같은 글자·같은 간지 only repeat a glyph, they do not bind or clash
  const types = [...new Set(a.relationsToNatal.map((r) => r.type))].filter((t) => t !== SAME_GLYPH && t !== SAME_PILLAR);
  return [
    `2027년 세운 · ${a.ko}(${a.gz}) · 천간 ${a.stemTenGod} · 지지 ${a.branchMainTenGod}`,
    types.length ? `내 명식과 · ${types.join(", ")}` : "내 명식과 · 따로 묶이거나 부딪히는 글자는 없어요",
    n.year.luckChange ? `대운 · ${n.year.luckChange}` : "대운 · 2027년 안에는 바뀌지 않아요",
  ];
}

/** The chart, the year's facts and the user's context: shared by the preview and all three parts (cached). */
export function newyearShared(n: NewYearFacts): string {
  return [factsBlock(n.facts), `<year_facts>\n${JSON.stringify(n.year)}\n</year_facts>`, userContextBlock(n.facts)].join("\n");
}

export const newyearTeaserPrompt = () => "<task>newyear-teaser</task>";

const firstSentence = (text: string) => text.trim().split(/(?<=[.?!])\s+/)[0] ?? text.trim();

/** Part 0 (A), 1 (B, months 1–6) or 2 (C, months 7–12 + closing), with the earlier parts' first sentences. */
export function newyearPartPrompt(index: number, prior: { a?: NewYearPartA; b?: NewYearPartB }): string {
  if (index === 0) return "<task>newyear-a</task>";
  const h = NEWYEAR_HEADINGS;
  const earlier: string[] = [];
  if (prior.a) {
    earlier.push(`${h.overview}: ${firstSentence(prior.a.overview.body)}`, `${h.luck}: ${firstSentence(prior.a.luck.body)}`);
    for (const k of ["work", "money", "relations", "health"] as const) earlier.push(`${h[k]}: ${firstSentence(prior.a.areas[k].body)}`);
  }
  if (prior.b) prior.b.firstHalf.forEach((m, i) => earlier.push(`${i + 1}월: ${firstSentence(m.body)}`));
  return [`<task>${index === 1 ? "newyear-b" : "newyear-c"}</task>`, `<earlier>\n${earlier.join("\n")}\n</earlier>`].join("\n");
}
