import { computeChart, type SajuElement } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { GAEUN as GAEUN_ROWS } from "@/lib/sajuEnrichment";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { SAJU_GAEUN_HEADING, SAJU_MAIN_SECTIONS, SAJU_NAMES_HEADING, SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { mockSajuEnrichment, mockSajuFollowUp, mockSajuMainReading, mockSajuReading } from "./mock";
import { mockMatchPartA, mockNewYearPartC } from "./mockPremium";
import { mockSajuTopicFollowUp, mockSajuTopicReading } from "./mockSajuTopics";
import { MATCH_SAJU_SYSTEM, buildMatchFacts, matchSajuShared } from "./prompts/match";
import { NEWYEAR_SYSTEM, buildNewYearFacts, newyearShared } from "./prompts/newyear";
import {
  ELEMENT_HANJA, ELEMENT_WORD, ORDER, SAJU_LOCKED_TOC, SAJU_SYSTEM, SINSAL_BASIS_LINE, buildFactSet, sajuFollowUpPrompt, sajuReadingPrompt, sajuTeaserPrompt, type SajuFactSet,
} from "./prompts/saju";
import { SAJU_ENRICHMENT_SYSTEM, sajuEnrichmentPrompt } from "./prompts/sajuEnrichment";
import { buildTopicFactSet } from "./prompts/sajuTopics";
import { SAJU_TOPIC_SYSTEM, topicFactsBlock } from "./prompts/sajuTopicPrompts";
import { sajuEnrichmentFallback } from "./sajuParts";
import type { SajuEnrichment, SajuReading } from "./schemas";
import { isSoftViolation } from "./style";
import { charCount, validateSajuEnrichment, validateSajuFollowUp, validateSajuMainReading, validateSajuReading } from "./validate";
import { validateMatchPartA, validateNewYearPartC } from "./validatePremium";
import { validateSajuTopicFollowUp, validateSajuTopicReading } from "./validateSajuTopics";

// docs/superpowers/specs/2026-10-08-saju-enrichment-design.md §3, §4, and the review of afd5498 (A1–A8, B)
const NOW = Date.parse("2026-10-08T12:00:00+09:00");
const chartOf = (patch: Partial<SajuForm>) => computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, ...patch }));
const factsOf = (patch: Partial<SajuForm>) => buildFactSet(chartOf(patch), NOW);
const DOBI: Partial<SajuForm> = { year: 1988, month: 8, day: 15, timeKnown: true, hour: 10, minute: 22 }; // 甲辰 壬寅 庚申 戊辰
const NO_NAME: Partial<SajuForm> = { year: 1987, month: 9, day: 9, timeKnown: true, hour: 9, minute: 30 }; // 壬辰 辛酉 己酉 丁卯
/** packages/core/tests/sinsal.test.ts's golden charts (the last has no name), and the sample chart. */
const GOLDEN: Array<readonly [string, Partial<SajuForm>]> = [
  ["도비", DOBI],
  ["도비 시 모름", { year: 1988, month: 8, day: 15 }],
  ["1975-03-07 09:00", { year: 1975, month: 3, day: 7, timeKnown: true, hour: 9, minute: 0 }],
  ["1983-09-09 01:00", { year: 1983, month: 9, day: 9, timeKnown: true, hour: 1, minute: 0 }],
  ["1960-02-14 01:30", { year: 1960, month: 2, day: 14, timeKnown: true, hour: 1, minute: 30 }],
  ["1995-07-05 02:30 (all six)", { year: 1995, month: 7, day: 5, timeKnown: true, hour: 2, minute: 30 }],
  ["1987-09-09 09:30 (no name)", NO_NAME],
  ["the sample, 시 모름", {}],
];
const hard = (found: string[]) => found.filter((v) => !isSoftViolation(v));
/** What `extra` adds to the hard findings of `before`. */
const added = (before: string[], after: string[]) => hard(after).filter((v) => !hard(before).includes(v));
const NAMES = SAJU_PROLOGUE_SECTIONS.indexOf(SAJU_NAMES_HEADING);
const GAEUN = SAJU_PROLOGUE_SECTIONS.indexOf(SAJU_GAEUN_HEADING);
const BASIS = SAJU_PROLOGUE_SECTIONS.length - 1;
const MAIN_BASIS = SAJU_MAIN_SECTIONS.length - 1;
const withExtra = (r: SajuReading, i: number, extra: string): SajuReading => ({ ...r, sections: r.sections.map((s, j) => (j === i ? { ...s, body: `${s.body} ${extra}` } : s)) });

describe("정통 사주: nine sections, the main call writing seven of them", () => {
  it("names 7절 and 8절 in code-owned headings, and the main call writes 1–6 and 계산 기준", () => {
    expect(SAJU_PROLOGUE_SECTIONS).toHaveLength(9);
    expect([NAMES, GAEUN, BASIS]).toEqual([6, 7, 8]);
    expect(SAJU_NAMES_HEADING).toBe("이름표 풀이 · 이 명식에 붙는 이름들");
    expect(SAJU_GAEUN_HEADING).toBe("기운 채우기 · 적은 기운을 곁에 두는 법");
    expect(SAJU_MAIN_SECTIONS).toEqual(SAJU_PROLOGUE_SECTIONS.filter((h) => h !== SAJU_NAMES_HEADING && h !== SAJU_GAEUN_HEADING));
    expect(SAJU_MAIN_SECTIONS.at(-1)).toMatch(/^계산 기준 · /);
    expect(SAJU_LOCKED_TOC).toHaveLength(11);
  });
});

describe("the facts", () => {
  const f = factsOf(DOBI);

  it("carry 도비's names with where they came from, and the scarce element with its row", () => {
    expect(f.sinsal).toEqual([
      { name: "문창귀인", basis: "일간", basisGlyph: "壬", hits: ["일간 壬 → 일지 寅"], meaning: "글과 말, 공부로 생각을 꺼내는 쪽에 붙는 이름" },
      { name: "학당귀인", basis: "일간", basisGlyph: "壬", hits: ["일간 壬 → 월지 申"], meaning: "배움이 자라기 쉬운 자리에 붙는 이름" },
      { name: "역마", basis: "연지", basisGlyph: "辰", hits: ["연지 辰 → 일지 寅", "일지 寅 → 월지 申"], meaning: "움직임과 변화에 열린 배치에 붙는 이름" },
      { name: "화개", basis: "연지", basisGlyph: "辰", hits: ["연지 辰 → 시지 辰"], meaning: "혼자 깊이 파고드는 몰입에 붙는 이름" },
    ]);
    expect(f.scarce).toEqual([
      { element: "불(火)", count: 0, hidden: true, colour: "빨강·주황", direction: "남쪽", habits: ["낮 햇볕 10분", "땀 나는 걷기", "먼저 인사하기"], environment: ["따뜻한 색 조명"] },
    ]);
  });

  it("carry no name and every tied element for a chart with none", () => {
    const none = factsOf(NO_NAME);
    expect(none.sinsal).toEqual([]);
    expect(none.scarce.map((s) => [s.element, s.count, s.hidden])).toEqual([["나무(木)", 1, false], ["불(火)", 1, false], ["물(水)", 1, false]]);
  });

  it("reach the 7·8절 call only, with the 일간, the counts and the pillars the hits name: not the main reading, the teaser, a follow-up, a 운, 신년운세 or 궁합", () => {
    const shown = sajuEnrichmentPrompt(f);
    expect(shown).toContain('"sinsal":[{"name":"문창귀인"');
    expect(shown).toContain('"scarce":[{"element":"불(火)"');
    expect(shown).toContain(f.dayMaster.display);
    expect(shown).toContain('"counts":{"목":2,"화":0,"토":3,"금":2,"수":1}');
    for (const p of f.pillars) expect(shown).toContain(`"gz":"${p.gz}"`);
    // nothing else of the chart: no 대운, 세운, 월건, relations, limits or user context
    expect(shown).not.toMatch(/"luck"|"annual"|"monthly"|"relations"|"limits"|<user_context>/);
    const elsewhere = [
      sajuReadingPrompt(f),
      sajuTeaserPrompt(f),
      sajuFollowUpPrompt(f, mockSajuReading(f), [], "더 알려 주세요"),
      topicFactsBlock(buildTopicFactSet(chartOf(DOBI), NOW, "career")),
      newyearShared(buildNewYearFacts(chartOf(DOBI))),
      matchSajuShared(buildMatchFacts(chartOf(DOBI), chartOf(NO_NAME), { relation: "lover" }, NOW)),
    ];
    for (const prompt of elsewhere) expect(prompt).not.toMatch(/"sinsal"|"scarce"/);
    expect(buildTopicFactSet(chartOf(DOBI), NOW, "career")).not.toHaveProperty("sinsal");
  });
});

describe("the prompts", () => {
  it("bring the main format back to seven sections and 2,100~3,200자: 1–6 and 계산 기준 with its basis sentence, nothing of 7·8절", () => {
    // since owner 2026-10-16 two halves write them at once, each its own <headings> (sajuReadingHalves.test.ts)
    expect(SAJU_SYSTEM).toContain("sections: <headings>의 절만, 그 순서와 문구 그대로.");
    expect(SAJU_SYSTEM).toContain("합계 2,100~3,200자");
    expect(SAJU_SYSTEM).toMatch(/1~6절은[^\n]*300~450자\. 7절은 300~550자\./);
    expect(SAJU_SYSTEM).toMatch(/\n {2}7\. 계산 기준: [^\n]*귀인은 일간을, 도화·역마·화개는 태어난 해와 날의 지지를 기준으로 찾았고, 이 기준은 유파마다 달라요/);
    expect(SAJU_SYSTEM).not.toMatch(/이름표 풀이:|기운 채우기:|sinsal|scarce|280~420|250~380/);
    expect(SINSAL_BASIS_LINE).toBe("귀인은 일간을, 도화·역마·화개는 태어난 해와 날의 지지를 기준으로 찾았고, 이 기준은 유파마다 달라요.");
    const numbered = (heading: string) => `${SAJU_MAIN_SECTIONS.indexOf(heading) + 1}. ${heading}`;
    expect(sajuReadingPrompt(factsOf(DOBI), "a")).toContain(`<headings>\n${SAJU_MAIN_SECTIONS.filter((_, i) => i < 3 || i === 6).map(numbered).join("\n")}\n</headings>`);
    expect(sajuReadingPrompt(factsOf(DOBI), "b")).toContain(`<headings>\n${SAJU_MAIN_SECTIONS.slice(3, 6).map(numbered).join("\n")}\nobservation: `);
  });

  it("let a 정통 follow-up name the reading's own names, never as an event, and no other 살", () => {
    expect(SAJU_SYSTEM).toMatch(/- 살·귀인 이름은 <reading>의 이름표 풀이에 나온 것만[^\n]*예고나 까닭[^\n]*백호·원진·삼재/);
  });

  it("give 7·8절 their own short system prompt: the voice, the names of the facts only, the strict bans in 7절, and 8절's choices and exceptions", () => {
    expect(SAJU_ENRICHMENT_SYSTEM.length).toBeLessThan(SAJU_SYSTEM.length * 0.75);
    for (const rule of [
      "# 풀이 목소리",
      "<facts>의 sinsal에 있는 이름만",
      "부정문으로도 쓰지 않아요",
      "280~420자",
      "250~380자",
      '"여덟 글자 가운데 불 기운이 0개"',
      "이사·해외·머리 방향",
      "행운의 숫자",
      // 8절 is the exception to the voice's one action and to the make-up rule the main prompt keeps (review A6)
      "행동이 3~4개",
      '"적은 기운을 채워 준다"',
    ]) expect(SAJU_ENRICHMENT_SYSTEM, rule).toContain(rule);
  });

  it("keep the 신살 ban as it was in the 운, 신년운세 and 궁합 prompts", () => {
    for (const system of [SAJU_TOPIC_SYSTEM, NEWYEAR_SYSTEM]) {
      expect(system).toContain("신강·신약, 용신, 격국, 신살(도화, 역마, 공망, 귀인 등), 삼재·원진·백호 같은 라벨은 쓰지 않아요.");
      expect(system).not.toMatch(/sinsal|이름표 풀이|scarce/);
    }
    expect(MATCH_SAJU_SYSTEM).toContain("신강·신약, 용신, 격국, 신살(도화, 역마, 원진, 귀인 같은 것) 라벨을 쓰지 않아요.");
  });
});

describe("the 7·8절 validator", () => {
  const f = factsOf(DOBI);
  const clean = mockSajuEnrichment(f);
  const in7 = (extra: string): SajuEnrichment => ({ ...clean, nameplate: `${clean.nameplate} ${extra}` });
  const in8 = (extra: string): SajuEnrichment => ({ ...clean, gaeun: `${clean.gaeun} ${extra}` });
  const findings = (e: SajuEnrichment) => hard(validateSajuEnrichment(e, f)).join("\n");

  it("passes the mock, which names 도비's names in 7절 and her 불 in 8절", () => {
    expect(validateSajuEnrichment(clean, f)).toEqual([]);
    for (const name of ["문창귀인", "학당귀인", "역마", "화개"]) expect(clean.nameplate).toContain(name);
    expect(clean.nameplate).not.toMatch(/천을귀인|도화/);
    expect(clean.gaeun).toMatch(/여덟 글자 가운데 불 기운이 0개/);
  });

  it("allows a name of the facts in 7절 and fails one the facts do not hold, even there", () => {
    expect(findings(in7("문창귀인은 생각을 글로 먼저 꺼내 보는 쪽에 붙는 이름이에요."))).toBe("");
    expect(findings(in7("도화라는 이름도 붙어 사람의 시선을 끌어요."))).toMatch(/붙지 않은 이름\(도화\)/);
    expect(findings(in7("천을귀인도 함께 붙어 도움을 청하기 쉬워요."))).toMatch(/붙지 않은 이름\(천을귀인\)/);
    expect(findings(in8("역마처럼 자리를 옮기며 걸어 보세요."))).toMatch(/'기운 채우기[^']*'에 살·귀인 이름\(역마\)/);
  });

  it("fails in 7절 a hidden or held name and an event or a cause, declined or not (A1, A4: strict there only)", () => {
    for (const extra of ["백호 같은 무서운 이름은 붙지 않았어요.", "삼재는 따지지 않았어요."]) expect(findings(in7(extra)), extra).toMatch(/숨기거나 보류한 살 이름/);
    for (const extra of [
      "귀인을 만나게 될 거예요.", "귀인이 나타난다는 뜻은 아니에요.", "귀인의 도움을 받기 쉬워요.", "역마살이 있어서 이사가 잦아요.", "문창귀인이 있으면 글을 잘 써요.",
      // the connective 있어, and 덕분·덕에·때문 after a name (review of v2, M1)
      "역마살이 있어 이사가 잦아요.", "귀인이 붙어 있어 도움을 받기 쉬워요.", "역마 때문에 이사가 잦아요.", "문창귀인 덕분에 글이 술술 풀려요.",
    ]) {
      expect(findings(in7(extra)), extra).toMatch(/사건이나 까닭/);
    }
    expect(findings(in7("이 이름들은 누가 나타난다는 예고가 아니에요."))).toBe("");
    // a fact is not a cause (A5: 있어서·있어 ·있으니·있으면·있기 때문 only)
    for (const extra of ["이 사주에는 학당귀인이 있어요.", "역마가 있어도 괜찮아요."]) expect(findings(in7(extra)), extra).toBe("");
  });

  it("8절: no luck number, no promise, no health, big moves never; what the review found harmless passes (A2)", () => {
    expect(findings(in8("행운의 숫자는 3이에요."))).toMatch(/행운의 숫자/);
    expect(findings(in8("좋은 번호를 골라 두세요."))).toMatch(/행운의 숫자/);
    // review of v2, LOW: an element's numbers, a pair of numbers, digestion, a bed's direction
    expect(findings(in8("1과 6이 물 기운의 숫자라 휴대폰 잠금 번호에 넣어 보세요."))).toMatch(/행운의 숫자/);
    for (const extra of ["빨강을 곁에 두면 운이 트여요.", "따뜻한 조명이 돈이 들어오는 효과가 있어요."]) expect(findings(in8(extra)), extra).toMatch(/효과를 약속/);
    for (const extra of ["햇볕을 쬐면 면역이 좋아져요.", "반신욕을 하면 몸이 가벼워져요.", "따뜻한 차를 곁에 두면 소화가 편해져요."]) expect(findings(in8(extra)), extra).toMatch(/몸이나 마음 건강/);
    for (const extra of ["남쪽으로 이사해 보세요.", "잘 때 머리를 남쪽으로 두세요.", "베개는 북쪽에 두세요.", "잠자리는 북쪽으로 두고 자 보세요."]) expect(findings(in8(extra)), extra).toMatch(/큰 방향/);
    for (const extra of [
      "행운의 색으로 초록을 곁에 둬 보세요.",
      "일하는 사이사이 창가에 들러 보세요.",
      "버스 번호를 외우듯 작은 습관으로 만들어 보세요.",
      "식사 뒤 소화가 될 즈음 걸어 보세요.",
      "하루의 순환을 생각해 보세요.",
      "침대를 북쪽 벽에 붙여 두었다면 그대로 둬도 괜찮아요.",
      "적은 불 기운을 채워 준다는 마음으로 곁에 두면 좋아요.",
      "숫자로 세면 불 기운은 0개예요.",
      "이사나 해외처럼 큰 결정과는 상관없는 제안이에요.",
    ]) expect(findings(in8(extra)), extra).toBe("");
  });

  it("asks 7절 for 280~420자 and 8절 for 250~380자", () => {
    const found = validateSajuEnrichment({ nameplate: "짧아요.", gaeun: "짧아요." }, f).join("\n");
    expect(found).toContain(`'${SAJU_NAMES_HEADING}' 절이 공백 제외 4자예요. 280~420자로 써 주세요.`);
    expect(found).toContain(`'${SAJU_GAEUN_HEADING}' 절이 공백 제외 4자예요. 250~380자로 써 주세요.`);
  });
});

describe("the main and the merged validators", () => {
  const f = factsOf(DOBI);
  const main = mockSajuMainReading(f);
  const merged = mockSajuReading(f);

  it("pass the main mock (seven sections) and the merged reading (nine), the basis sentence in 계산 기준", () => {
    expect(main.sections.map((s) => s.heading)).toEqual([...SAJU_MAIN_SECTIONS]);
    expect(validateSajuMainReading(main, f)).toEqual([]);
    expect(merged.sections.map((s) => s.heading)).toEqual([...SAJU_PROLOGUE_SECTIONS]);
    expect(validateSajuReading(merged, f)).toEqual([]);
    expect(merged.sections[BASIS]!.body).toContain(SINSAL_BASIS_LINE);
  });

  it("fail a name in the main sections, the card or the observation, and let 계산 기준 name them as its sentence does", () => {
    const found = (r: SajuReading) => hard(validateSajuMainReading(r, f)).join("\n");
    expect(found(withExtra(main, 2, "문창귀인이라는 이름처럼 글로 생각을 꺼내는 쪽이에요."))).toMatch(/'나를 움직이는 힘[^']*'에 살·귀인 이름\(문창귀인\)/);
    expect(found({ ...main, glance: { ...main.glance, goesWell: "역마라는 이름처럼 움직이며 생각을 정리할 때 잘 풀려요." } })).toMatch(/살·귀인 이름\(역마\)/);
    expect(found({ ...main, observation: { ...main.observation, body: `${main.observation.body} 화개의 몰입이 늘어나는지도 보세요.` } })).toMatch(/살·귀인 이름\(화개\)/);
    expect(found(withExtra(main, MAIN_BASIS, "도화·역마·화개는 태어난 해와 날의 지지로 찾았어요."))).toBe("");
  });

  it("ask 300~550자 of 계산 기준 and 2,100~3,200자 of the main sections: their minimums add up (A8)", () => {
    const short = validateSajuMainReading(withExtra({ ...main, sections: main.sections.map((s, i) => (i === MAIN_BASIS ? { ...s, body: "" } : s)) }, MAIN_BASIS, "짧아요."), f).join("\n");
    expect(short).toContain(`'${SAJU_MAIN_SECTIONS[MAIN_BASIS]}' 절이 공백 제외 4자예요. 300~550자로 써 주세요.`);
    expect(validateSajuMainReading({ ...main, sections: main.sections.map((s) => ({ ...s, body: s.body.slice(0, 160) })) }, f).join("\n")).toMatch(/2,100~3,200자로 맞춰 주세요/);
  });

  it("catches a merged reading short of a section", () => {
    expect(validateSajuReading({ ...merged, sections: merged.sections.slice(0, 8) }, f).join(" ")).toMatch(/정확히 9개/);
  });
});

describe("declining sentences stay negatable outside 7절 (review A1, A4)", () => {
  const DECLINED = [
    "귀인이 나타난다고 단정할 수는 없어요.",
    "귀인을 만난다는 예고는 이 풀이로는 말하기 어려워요.",
    "역마가 있으면 꼭 이사해야 한다는 뜻은 아니에요.",
    "삼재 같은 라벨은 쓰지 않았어요.",
  ];
  const f = factsOf(DOBI);

  it.each(DECLINED)("정통: the main sections (계산 기준) and a follow-up — %s", (sentence) => {
    const main = mockSajuMainReading(f);
    expect(added(validateSajuMainReading(main, f), validateSajuMainReading(withExtra(main, MAIN_BASIS, sentence), f))).toEqual([]);
    const answer = mockSajuFollowUp(f).answer;
    const question = "올해는 어때요?";
    expect(added(validateSajuFollowUp({ kind: "clarify", answer }, f, question), validateSajuFollowUp({ kind: "clarify", answer: `${answer} ${sentence}` }, f, question))).toEqual([]);
  });

  it.each(DECLINED)("운: a reading and a follow-up — %s", (sentence) => {
    const t = buildTopicFactSet(chartOf(DOBI), NOW, "career");
    const r = mockSajuTopicReading(t);
    expect(added(validateSajuTopicReading(r, t), validateSajuTopicReading(withExtra(r, 2, sentence), t))).toEqual([]);
    const answer = mockSajuTopicFollowUp(t).answer;
    expect(added(validateSajuTopicFollowUp({ kind: "clarify", answer }, t), validateSajuTopicFollowUp({ kind: "clarify", answer: `${answer} ${sentence}` }, t))).toEqual([]);
  });

  it.each(DECLINED)("신년운세 and 궁합 — %s", (sentence) => {
    const n = buildNewYearFacts(chartOf(DOBI));
    const c = mockNewYearPartC(n);
    expect(added(validateNewYearPartC(c, n), validateNewYearPartC({ ...c, closing: { body: `${c.closing.body} ${sentence}` } }, n))).toEqual([]);
    const m = buildMatchFacts(chartOf(DOBI), chartOf(NO_NAME), { relation: "lover" }, NOW);
    const a = mockMatchPartA(m);
    expect(added(validateMatchPartA(a, m), validateMatchPartA({ ...a, luck: { body: `${a.luck.body} ${sentence}` } }, m))).toEqual([]);
  });

  it("still fails an asserted name, hidden name or event outside 7절", () => {
    const main = mockSajuMainReading(f);
    const found = (extra: string) => hard(validateSajuMainReading(withExtra(main, 2, extra), f)).join("\n");
    expect(found("백호가 있어 부딪히기 쉬워요.")).toMatch(/숨기거나 보류한 살 이름/);
    expect(found("귀인을 만나게 될 거예요.")).toMatch(/사건이나 까닭/);
    // 임원진, "양인 물" and "양인지" are everyday words (A5); 양인 with a particle is the name (review of v2, LOW)
    expect(found("회의에서 임원진 앞에 서는 날을 떠올려 봐요.")).toBe("");
    expect(found("적은 양인 물을 자주 마셔도 좋아요.")).toBe("");
    expect(found("한 번에 먹기 알맞은 양인지 가늠해 봐요.")).toBe("");
    expect(found("양인이 있어 고집이 센 편이에요.")).toMatch(/숨기거나 보류한 살 이름/);
  });

  it("counts a real decline only: a 않·없 elsewhere in the sentence excuses nothing (review of v2, M2)", () => {
    const answer = mockSajuFollowUp(f).answer;
    const cause = "문창귀인이 있으니 글로 정리하면 막힌 일이 풀릴 거예요, 걱정하지 않아도 돼요.";
    expect(hard(validateSajuFollowUp({ kind: "clarify", answer: `${answer} ${cause}` }, f, "올해는 어때요?")).join("\n")).toMatch(/사건이나 까닭/);
    const asserted = "올해 삼재라서 큰 결정은 서두르지 않는 편이 좋아요.";
    const main = mockSajuMainReading(f);
    expect(added(validateSajuMainReading(main, f), validateSajuMainReading(withExtra(main, 2, asserted), f)).join("\n")).toMatch(/숨기거나 보류한 살 이름/);
    const t = buildTopicFactSet(chartOf(DOBI), NOW, "career");
    const r = mockSajuTopicReading(t);
    expect(added(validateSajuTopicReading(r, t), validateSajuTopicReading(withExtra(r, 2, asserted), t)).join("\n")).toMatch(/숨기거나 보류한 살 이름/);
    const n = buildNewYearFacts(chartOf(DOBI));
    const c = mockNewYearPartC(n);
    expect(added(validateNewYearPartC(c, n), validateNewYearPartC({ ...c, closing: { body: `${c.closing.body} ${asserted}` } }, n)).join("\n")).toMatch(/숨기거나 보류한 살 이름/);
    const m = buildMatchFacts(chartOf(DOBI), chartOf(NO_NAME), { relation: "lover" }, NOW);
    const a = mockMatchPartA(m);
    expect(added(validateMatchPartA(a, m), validateMatchPartA({ ...a, luck: { body: `${a.luck.body} ${asserted}` } }, m)).join("\n")).toMatch(/숨기거나 보류한 살 이름/);
    const e = mockSajuEnrichment(f);
    const lucky = { ...e, gaeun: `${e.gaeun} 행운의 숫자 3을 휴대폰에 두면 부담 없이 시작할 수 있어요.` };
    expect(hard(validateSajuEnrichment(lucky, f)).join("\n")).toMatch(/행운의 숫자/);
  });

  it("reads 바탕화면 as a screen, not 탕화, and names the word it flags (review of v2, M3)", () => {
    const wallpaper = "휴대폰 바탕화면을 초록빛 숲 사진으로 바꿔 보세요.";
    const e = mockSajuEnrichment(f);
    expect(hard(validateSajuEnrichment({ ...e, gaeun: `${e.gaeun} ${wallpaper}` }, f))).toEqual([]);
    const main = mockSajuMainReading(f);
    expect(added(validateSajuMainReading(main, f), validateSajuMainReading(withExtra(main, 2, wallpaper), f))).toEqual([]);
    expect(hard(validateSajuMainReading(withExtra(main, 2, "탕화가 붙어 불을 조심해야 해요."), f)).join("\n")).toMatch(/숨기거나 보류한 살 이름[^\n]*"탕화"/);
  });
});

describe("a 정통 follow-up names the reading's own names (A3)", () => {
  const f = factsOf(DOBI);
  const answer = "역마는 움직임과 변화에 열린 배치에 붙는 이름이에요. 같은 명식으로 이어서 보면 한자리에 오래 머무는 날보다 자리를 옮겨 가며 생각을 정리하는 날에 마음이 가벼워지기 쉬워요. 이번 주에는 늘 앉던 자리 말고 다른 자리에서 하루 한 번 일을 해 보세요. 그렇게 자리를 바꾼 날에 생각이 어떻게 풀리는지 떠올려 보면 이 이름이 내게 어떻게 닿는지 가늠할 수 있어요.";

  it("passes its own name on a generic question, and fails a name the reading does not hold or a hidden one", () => {
    expect(hard(validateSajuFollowUp({ kind: "clarify", answer }, f, "제 사주에 귀인 있어요?"))).toEqual([]);
    expect(hard(validateSajuFollowUp({ kind: "clarify", answer: answer.replace("역마는 움직임과 변화에", "도화는 사람의 시선을 끄는 매력에") }, f, "제 사주에 귀인 있어요?")).join("\n")).toMatch(/살·귀인 이름\(도화\)/);
    expect(hard(validateSajuFollowUp({ kind: "clarify", answer: `${answer} 백호가 붙어 있어 조심해야 해요.` }, f, "올해는 어때요?")).join("\n")).toMatch(/숨기거나 보류한 살 이름/);
  });
});

describe("the code-built 7·8절 (the fallback, and the mock)", () => {
  it.each(GOLDEN)("%s: passes the 7·8절 validator with no finding, 4~8 sentences in 7절 for four names or fewer", (_label, patch) => {
    const f = factsOf(patch);
    const e = sajuEnrichmentFallback(f);
    expect(validateSajuEnrichment(e, f)).toEqual([]);
    for (const body of [e.nameplate, e.gaeun]) {
      expect(body.split(/(?<=[.?!])\s+/)[0], body).toMatch(/\?$/);
      expect(body.match(/\*\*[^*]+\*\*/g)?.length, body).toBeGreaterThanOrEqual(1);
    }
    expect(charCount(e.gaeun), e.gaeun).toBeGreaterThanOrEqual(250);
    expect(charCount(e.gaeun), e.gaeun).toBeLessThanOrEqual(380);
    if (f.sinsal.length <= 4) {
      expect(charCount(e.nameplate), e.nameplate).toBeGreaterThanOrEqual(280);
      expect(charCount(e.nameplate), e.nameplate).toBeLessThanOrEqual(420);
      expect(e.nameplate.split(/(?<=[.?!])\s+/).length, e.nameplate).toBeLessThanOrEqual(8);
    }
    // every name with its place and meaning
    for (const s of f.sinsal) {
      expect(e.nameplate).toContain(s.name);
      expect(e.nameplate).toContain(s.meaning);
    }
  });

  it("says, for a chart with no name, that the common names were checked, without listing them", () => {
    const seven = sajuEnrichmentFallback(factsOf(NO_NAME)).nameplate;
    expect(seven).toMatch(/흔히 찾아보는/);
    expect(seven).not.toMatch(/귀인|도화|역마|화개/);
  });

  it("is what the mock answers for the 7·8절 call", () => {
    const f = factsOf(DOBI);
    expect(mockSajuEnrichment(f)).toEqual(sajuEnrichmentFallback(f));
  });
});

describe("the code-built 8절 for every scarce element, and 7절 for five or six names (review of v2, LOW)", () => {
  const base = factsOf(DOBI);
  /** The facts' scarce row for `e`, as buildFactSet writes it. */
  const rowOf = (e: SajuElement, count: number, hidden: boolean): SajuFactSet["scarce"][number] => ({
    element: `${ELEMENT_WORD[e]}(${ELEMENT_HANJA[e]})`, count, hidden,
    colour: GAEUN_ROWS[e].colours.join("·"), direction: GAEUN_ROWS[e].direction, habits: [...GAEUN_ROWS[e].habits], environment: [...GAEUN_ROWS[e].environment],
  });
  const next = (e: SajuElement) => ORDER[(ORDER.indexOf(e) + 1) % ORDER.length]!;
  const cases = ORDER.flatMap((e) => [
    [e, "0개, 지장간에 숨은", [rowOf(e, 0, true)]],
    [e, "0개, 숨은 것도 없는", [rowOf(e, 0, false)]],
    [e, "1개, 다른 기운과 같은 개수", [rowOf(e, 1, false), rowOf(next(e), 1, false)]],
  ] as const);

  it.each(cases)("%s (%s): passes the 7·8절 validator with no hard finding", (_e, _variant, scarce) => {
    const f: SajuFactSet = { ...base, scarce: [...scarce] };
    const e = sajuEnrichmentFallback(f);
    expect(hard(validateSajuEnrichment(e, f)), e.gaeun).toEqual([]);
    expect(charCount(e.gaeun), e.gaeun).toBeGreaterThanOrEqual(250);
    expect(charCount(e.gaeun), e.gaeun).toBeLessThanOrEqual(380);
  });

  it("asks 흙 to sit in the middle of the house without keeping that seat empty", () => {
    const gaeun = sajuEnrichmentFallback({ ...base, scarce: [rowOf("토", 0, true)] }).gaeun;
    expect(gaeun).toContain("집 안 가운데");
    expect(gaeun).not.toMatch(/비워 두/);
  });

  const six = factsOf({ year: 1995, month: 7, day: 5, timeKnown: true, hour: 2, minute: 30 });
  it.each(six.sinsal.map((s) => s.name))("five names (all but %s) pass the 7·8절 validator with no hard finding", (left) => {
    const f: SajuFactSet = { ...six, sinsal: six.sinsal.filter((s) => s.name !== left) };
    const e = sajuEnrichmentFallback(f);
    expect(hard(validateSajuEnrichment(e, f)), e.nameplate).toEqual([]);
    for (const s of f.sinsal) expect(e.nameplate).toContain(s.name);
  });

  it("six names pass too", () => {
    expect(six.sinsal).toHaveLength(6);
    expect(hard(validateSajuEnrichment(sajuEnrichmentFallback(six), six))).toEqual([]);
  });
});
