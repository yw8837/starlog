import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { assembleMatch, generateMatchPart, generateMatchTeaser, type MatchContext } from "./generatePremium";
import { mockProvider } from "./mock";
import { mockMatchFollowUp, mockMatchPartA, mockMatchPartB, mockMatchTeaser } from "./mockPremium";
import { MatchReadingSchema } from "./premiumSchemas";
import {
  MATCH_HEADINGS, MATCH_RELATIONS, MATCH_SAJU_SYSTEM, buildMatchFacts, matchLockedToc, matchPartBPrompt, matchSajuShared, type MatchRelation,
} from "./prompts/match";
import { MODEL_BLIND_RULE, STYLE_RULES } from "./style";
import { maskGanzhiReadings, validateMatchFollowUp, validateMatchPartA, validateMatchPartB, validateMatchTeaser } from "./validatePremium";

const chart = (y: number, m: number, d: number, extra: Partial<typeof DEFAULT_SAJU_FORM> = {}) =>
  computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, year: y, month: m, day: d, ...extra }));
const NOW = Date.parse("2026-10-20T12:00:00+09:00");
const PARTNERS: Array<[number, number, number]> = [[1992, 2, 26], [1992, 1, 26], [1988, 11, 20], [1995, 3, 10], [2000, 2, 5]];
const RELATIONS: MatchRelation[] = ["lover", "crush", "spouse", "friend", "coworker", "family"];
const hard = (v: string[]) => v.filter((x) => !x.startsWith("[문체]"));

function context(relation: MatchRelation, partner: [number, number, number], label = ""): MatchContext {
  return { facts: buildMatchFacts(chart(1990, 1, 1), chart(...partner), { relation, label, concern: "요즘 서로 바빠요" }, NOW) };
}

/** Deterministic PRNG (mulberry32), so a failing pair can be replayed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LABELS = ["", "민지", "팀장님", "엄마", "지훈"];
const CONCERNS = ["", "요즘 서로 바빠요", "요즘 대화가 줄었어요", "같이 일하는 방식이 달라요", "명절마다 어색해요", "결혼 준비로 자주 부딪혀요"];
const PROFILES = [undefined, { loveStatus: "연애 중", workStatus: "직장인" }, { loveStatus: "기혼" }, { workStatus: "학생" }, { loveStatus: "결혼 준비 중" }];

function randomForm(r: () => number): SajuForm {
  const known = r() < 0.5;
  return {
    ...DEFAULT_SAJU_FORM,
    calendar: r() < 0.2 ? "lunar" : "solar",
    year: 1955 + Math.floor(r() * 50), month: 1 + Math.floor(r() * 12), day: 1 + Math.floor(r() * 28),
    timeKnown: known, hour: known ? Math.floor(r() * 24) : null, minute: known ? Math.floor(r() * 60) : null,
    gender: r() < 0.5 ? "female" : "male", placeId: r() < 0.5 ? "seoul" : "busan",
  };
}

/** Random births for both people, a random relation, label, concern, profile and moment of reading. */
function randomContext(seed: number): MatchContext {
  const r = rng(seed);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(r() * items.length)]!;
  const relation = pick(MATCH_RELATIONS);
  const me = computeChart(toSajuInput(randomForm(r)));
  const partner = computeChart(toSajuInput(randomForm(r)));
  // any day of the next year or so, so the twelve months ahead start in every month
  const now = NOW + Math.floor(r() * 400) * 86_400_000;
  return { facts: buildMatchFacts(me, partner, { relation, label: pick(LABELS), concern: pick(CONCERNS), meProfile: pick(PROFILES) }, now) };
}

describe("match prompts (saju only, owner 2026-10-17)", () => {
  it("blinds the model once, keeps partner feelings out, bans verdicts and never mentions cards", () => {
    expect(MATCH_SAJU_SYSTEM).toContain(MODEL_BLIND_RULE);
    expect(MATCH_SAJU_SYSTEM.split(MODEL_BLIND_RULE)).toHaveLength(2);
    expect(MATCH_SAJU_SYSTEM).toMatch(/마음.*사실로 말하지 않아요/);
    expect(MATCH_SAJU_SYSTEM).not.toMatch(/켈틱|셀틱|celtic/i);
    expect(MATCH_SAJU_SYSTEM).not.toContain("베타");
    // its own text (the shared style rules, written for every reading, speak of cards as an example)
    expect(MATCH_SAJU_SYSTEM.replace(STYLE_RULES, "")).not.toMatch(/카드|(?<!스)타로/); // 스타로그 holds 타로
    for (const task of ["## match-teaser", "## match-a", "## match-b", "## match-followup"]) expect(MATCH_SAJU_SYSTEM).toContain(task);
  });

  it("tells part 2 the words its checks refuse, even in a negation, and how to speak of a period instead (real eval 2026-10-20: both cases regenerated)", () => {
    const partB = MATCH_SAJU_SYSTEM.slice(MATCH_SAJU_SYSTEM.indexOf("## match-b"), MATCH_SAJU_SYSTEM.indexOf("## match-followup"));
    for (const word of ["점수", "좋은 달", "나쁜 달", "반드시", "무조건", "확실히", "확률", "부정문으로도"]) expect(partB, word).toContain(word);
    for (const way of ["움직이기 편한 때", "다지기 좋은 때"]) expect(partB, way).toContain(way);
  });

  it("puts my chart, the other person's day master and tilt, the pair facts and the label (as data) in the shared block", () => {
    const shared = matchSajuShared(context("lover", PARTNERS[0]!, "민지").facts);
    for (const tag of ["<me>", "<partner>", "<pair_facts>", "<relation>", "<user_context>"]) expect(shared).toContain(tag);
    expect(shared).toContain("상대를 부르는 말: 민지");
    expect(shared).not.toContain("allowed");
    expect(shared).not.toMatch(/카드|cardId/);
  });

  it("asks part 2 with what part 1 already said, and no card block", () => {
    const { facts } = context("lover", PARTNERS[0]!);
    const prompt = matchPartBPrompt(facts, mockMatchPartA(facts));
    expect(prompt).toContain("<task>match-b</task>");
    expect(prompt).toContain("<earlier>");
    expect(prompt).toContain(MATCH_HEADINGS.dayMasters);
    expect(prompt).not.toMatch(/카드|<cards>/);
  });

  it("keeps the locked TOC 1:1 with the paid sections: the saju part, the four bands of the year, and how to treat each other", () => {
    const { facts } = context("lover", PARTNERS[0]!);
    expect(facts.pair.year).toHaveLength(4);
    expect(matchLockedToc(facts)).toEqual([
      MATCH_HEADINGS.verdict, MATCH_HEADINGS.dayMasters, MATCH_HEADINGS.elements, MATCH_HEADINGS.pillars, MATCH_HEADINGS.luck,
      ...facts.pair.year.map((band) => band.label),
      MATCH_HEADINGS.together, MATCH_HEADINGS.avoid, MATCH_HEADINGS.action, MATCH_HEADINGS.observation,
    ]);
  });
});

describe("match validators and mocks", () => {
  it("passes the mocks for every relation and many pairs", () => {
    for (const relation of RELATIONS) for (const [i, partner] of PARTNERS.entries()) {
      const { facts } = context(relation, partner, i % 2 ? "민지" : "");
      expect(hard(validateMatchTeaser(mockMatchTeaser(facts), facts)), `teaser ${relation}`).toEqual([]);
      expect(hard(validateMatchPartA(mockMatchPartA(facts), facts)), `A ${relation}`).toEqual([]);
      expect(hard(validateMatchPartB(mockMatchPartB(facts), facts)), `B ${relation} ${partner}`).toEqual([]);
    }
  });

  it("passes the mocks for random births, relations, labels, concerns and moments", () => {
    for (let i = 0; i < 40; i++) {
      const { facts } = randomContext(2000 + i);
      const label = `${i} ${facts.relation}`;
      expect(hard(validateMatchTeaser(mockMatchTeaser(facts), facts)), `teaser ${label}`).toEqual([]);
      expect(hard(validateMatchPartA(mockMatchPartA(facts), facts)), `A ${label}`).toEqual([]);
      expect(hard(validateMatchPartB(mockMatchPartB(facts), facts)), `B ${label}`).toEqual([]);
    }
  });

  it("asks part 2 for the four bands in order, each naming one of its months, and both ways of treating each other", () => {
    const { facts } = context("friend", PARTNERS[0]!, "민지");
    const b = mockMatchPartB(facts);
    expect(validateMatchPartB({ ...b, periods: b.periods.slice(0, 3) }, facts).join(" ")).toMatch(/4개/);
    const swapped = [b.periods[1]!, b.periods[0]!, ...b.periods.slice(2)];
    const first = facts.pair.year[0]!.months.map((m) => m.month.replace(/^\d+년 /, "")).join(", ");
    expect(first).toBe("10월, 11월, 12월");
    expect(validateMatchPartB({ ...b, periods: swapped }, facts).join(" ")).toContain(first);
    expect(validateMatchPartB({ ...b, together: { body: "짧아요." } }, facts).join(" ")).toContain(MATCH_HEADINGS.together);
    expect(validateMatchPartB({ ...b, avoid: { body: "짧아요." } }, facts).join(" ")).toContain(MATCH_HEADINGS.avoid);
  });

  it("catches a stated feeling, a reunion promise, a score and a romance word between coworkers", () => {
    const { facts } = context("coworker", PARTNERS[0]!, "민지");
    const a = mockMatchPartA(facts);
    const feelings = { ...a, dayMasters: { body: `${a.dayMasters.body} 민지는 이미 나를 좋아해요.` } };
    expect(validateMatchPartA(feelings, facts).join(" ")).toContain("상대의 마음");
    const reunion = { ...a, luck: { body: `${a.luck.body} 내년에는 다시 만나게 돼요.` } };
    expect(validateMatchPartA(reunion, facts).join(" ")).toContain("재회");
    const score = { ...a, elements: { body: `${a.elements.body} 궁합 점수로 치면 높은 편이에요.` } };
    expect(hard(validateMatchPartA(score, facts)).length).toBeGreaterThan(0);
    const b = mockMatchPartB(facts);
    const romance = { ...b, action: { body: `${b.action.body} 데이트를 신청해 보세요.` } };
    expect(validateMatchPartB(romance, facts).join(" ")).toContain("연애 어휘");
    const named = { ...b, together: { body: `${b.together.body} 이 풀이는 GPT가 썼어요.` } };
    expect(hard(validateMatchPartB(named, facts)).length).toBeGreaterThan(0);
    const feelingB = { ...b, avoid: { body: `${b.avoid.body} 민지는 사실 나를 싫어해요.` } };
    expect(validateMatchPartB(feelingB, facts).join(" ")).toContain("상대의 마음");
    const stray = [..."甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥"].find((g) => !facts.allowed.glyphs.includes(g))!;
    const glyph = { ...a, pillars: { body: `${a.pillars.body} 두 사람 사이에 ${stray}의 기운도 있어요.` } };
    expect(validateMatchPartA(glyph, facts).join(" ")).toMatch(/간지 글자/);
    const strayB = { ...b, periods: [{ body: `${b.periods[0]!.body} 이 무렵 ${stray}의 기운이 들어와요.` }, ...b.periods.slice(1)] };
    expect(validateMatchPartB(strayB, facts).join(" ")).toMatch(/간지 글자/);
  });

  it("passes the follow-up mock (and an identity question) and catches a stated feeling in a follow-up", () => {
    for (const relation of RELATIONS) {
      const { facts } = context(relation, PARTNERS[0]!, "민지");
      for (const question of ["민지는 저를 어떻게 생각할까요?", "너 무슨 AI야?"]) {
        expect(hard(validateMatchFollowUp(mockMatchFollowUp(facts, question), facts, question)), `${relation} ${question}`).toEqual([]);
      }
    }
    const { facts } = context("crush", PARTNERS[1]!, "민지");
    const answer = { kind: "clarify" as const, answer: `${"두 사람의 일간이 만나는 결을 앞에서 읽었어요. ".repeat(4)}민지는 사실 나를 좋아해요.` };
    expect(validateMatchFollowUp(answer, facts, "민지 마음이 궁금해요").some((v) => v.includes("상대의 마음"))).toBe(true);
  });

  it("reads 임신(壬申) as a pillar, not as pregnancy", () => {
    expect(maskGanzhiReadings("임신(壬申) 대운이에요. 그 사람은 임신 대운, 임신년에 있어요.")).toBe("壬申(壬申) 대운이에요. 그 사람은 壬申 대운, 壬申년에 있어요.");
    expect(maskGanzhiReadings("일주가 전날 일진인 壬申(임신)이 돼요.")).toBe("일주가 전날 일진인 壬申(壬申)이 돼요.");
    expect(maskGanzhiReadings("임신과 출산은 다루지 않아요. 임신 일정은 쓰지 않아요.")).toBe("임신과 출산은 다루지 않아요. 임신 일정은 쓰지 않아요.");
  });

  it("lets the user's own words through but not the same words from the model", () => {
    const mc = randomContext(7);
    const facts = { ...mc.facts, relation: "lover" as const, concern: "헤어지게 될까 봐 걱정이에요" };
    const a = mockMatchPartA(facts);
    expect(hard(validateMatchPartA(a, facts))).toEqual([]);
    const said = { ...a, luck: { body: `${a.luck.body} 이대로면 헤어지게 돼요.` } };
    expect(validateMatchPartA(said, facts).join(" ")).toContain("이별");
  });

  it("generates a preview without cards and both parts, then assembles the saju part, the year in four bands and how to treat each other", async () => {
    const mc = context("spouse", PARTNERS[1]!);
    const preview = (await generateMatchTeaser(mockProvider, mc)).data;
    expect(preview.facts.length).toBeGreaterThan(0);
    expect(preview.facts.length).toBeLessThanOrEqual(3);
    expect(preview).not.toHaveProperty("cards");
    expect(preview.charts.partner.pillars.length).toBeGreaterThanOrEqual(3);
    expect(preview.lockedToc).toEqual(matchLockedToc(mc.facts));
    const a = (await generateMatchPart(mockProvider, mc, 0, [])).data;
    const b = (await generateMatchPart(mockProvider, mc, 1, [a])).data;
    const reading = assembleMatch(mc, [a, b]);
    expect(MatchReadingSchema.safeParse(reading).success).toBe(true);
    expect(reading.saju.dayMasters.heading).toBe(MATCH_HEADINGS.dayMasters);
    expect(reading.periods.map((p) => p.heading)).toEqual(mc.facts.pair.year.map((band) => band.label));
    expect([reading.together.heading, reading.avoid.heading, reading.action.heading]).toEqual([MATCH_HEADINGS.together, MATCH_HEADINGS.avoid, MATCH_HEADINGS.action]);
    expect(JSON.stringify(reading)).not.toMatch(/cardId|"cards"/);
  });
});
