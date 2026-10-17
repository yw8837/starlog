import { DEFAULT_REVERSAL_RATE, TEMPLATES, computeChart, createDeck, pickCards } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { kbCard } from "@/lib/kb";
import { DEFAULT_SAJU_FORM, toSajuInput, type SajuForm } from "@/lib/sajuForm";
import { assembleMatch, generateMatchPart, generateMatchTeaser, type MatchContext } from "./generatePremium";
import { mockProvider } from "./mock";
import { mockMatchFollowUp, mockMatchPartA, mockMatchPartB, mockMatchTeaser } from "./mockPremium";
import {
  MATCH_HEADINGS, MATCH_RELATIONS, MATCH_SAJU_SYSTEM, MATCH_TAROT_SYSTEM, buildMatchFacts, matchCardsContext, matchLockedToc, matchSajuShared,
  type MatchRelation,
} from "./prompts/match";
import { MODEL_BLIND_RULE } from "./style";
import { maskGanzhiReadings, validateMatchFollowUp, validateMatchPartA, validateMatchPartB, validateMatchTeaser } from "./validatePremium";

const chart = (y: number, m: number, d: number, extra: Partial<typeof DEFAULT_SAJU_FORM> = {}) =>
  computeChart(toSajuInput({ ...DEFAULT_SAJU_FORM, year: y, month: m, day: d, ...extra }));
const NOW = Date.parse("2026-10-20T12:00:00+09:00");
const PARTNERS: Array<[number, number, number]> = [[1992, 2, 26], [1992, 1, 26], [1988, 11, 20], [1995, 3, 10], [2000, 2, 5]];
const RELATIONS: MatchRelation[] = ["lover", "crush", "spouse", "friend", "coworker", "family"];
const hard = (v: string[]) => v.filter((x) => !x.startsWith("[문체]"));

function context(seed: string, relation: MatchRelation, partner: [number, number, number], label = ""): MatchContext {
  const facts = buildMatchFacts(chart(1990, 1, 1), chart(...partner), { relation, label, concern: "요즘 서로 바빠요" }, NOW);
  const drawn = pickCards(createDeck(seed, DEFAULT_REVERSAL_RATE), TEMPLATES.match, [4, 18, 33, 51, 70]);
  return { facts, cards: matchCardsContext(relation, drawn) };
}

/** Deterministic PRNG (mulberry32), so a failing draw can be replayed. */
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

/** Random births for both people, a random relation, label, concern, profile and five random picks. */
function randomContext(seed: number): MatchContext {
  const r = rng(seed);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(r() * items.length)]!;
  const relation = pick(MATCH_RELATIONS);
  const me = computeChart(toSajuInput(randomForm(r)));
  const partner = computeChart(toSajuInput(randomForm(r)));
  const facts = buildMatchFacts(me, partner, { relation, label: pick(LABELS), concern: pick(CONCERNS), meProfile: pick(PROFILES) }, NOW);
  const picks = new Set<number>();
  while (picks.size < 5) picks.add(Math.floor(r() * 78));
  return { facts, cards: matchCardsContext(relation, pickCards(createDeck(`match-${seed}`, DEFAULT_REVERSAL_RATE), TEMPLATES.match, [...picks])) };
}

describe("match prompts", () => {
  it("blinds the model, keeps partner feelings out and bans verdicts", () => {
    for (const system of [MATCH_SAJU_SYSTEM, MATCH_TAROT_SYSTEM]) {
      expect(system).toContain(MODEL_BLIND_RULE);
      expect(system.split(MODEL_BLIND_RULE)).toHaveLength(2);
      expect(system).toMatch(/마음.*사실로 말하지 않아요/);
      expect(system).not.toMatch(/켈틱|셀틱|celtic/i);
      expect(system).not.toContain("베타");
    }
    expect(MATCH_SAJU_SYSTEM).toContain("## match-a");
    expect(MATCH_TAROT_SYSTEM).toContain("## match-b");
  });

  it("bans romance words for friends, coworkers and family, not for couples", () => {
    expect(context("r1", "friend", PARTNERS[0]!).cards.bannedWords).toContain("연인");
    expect(context("r1", "lover", PARTNERS[0]!).cards.bannedWords).toEqual([]);
  });

  it("puts both charts, the pair facts and the label (as data) in the saju block", () => {
    const shared = matchSajuShared(context("s", "lover", PARTNERS[0]!, "민지").facts);
    for (const tag of ["<me>", "<partner>", "<pair_facts>", "<relation>", "<user_context>"]) expect(shared).toContain(tag);
    expect(shared).toContain("상대를 부르는 말: 민지");
    expect(shared).not.toContain("allowed");
  });

  it("keeps the locked TOC 1:1 with the paid sections", () => {
    const ctx = context("t", "lover", PARTNERS[0]!);
    expect(matchLockedToc(ctx.cards)).toEqual([
      MATCH_HEADINGS.verdict, MATCH_HEADINGS.dayMasters, MATCH_HEADINGS.elements, MATCH_HEADINGS.pillars, MATCH_HEADINGS.luck,
      ...ctx.cards.cards.map((c) => `${c.position} · ${c.name}`),
      MATCH_HEADINGS.connection, MATCH_HEADINGS.bridge, MATCH_HEADINGS.action, MATCH_HEADINGS.observation,
    ]);
  });
});

describe("match validators and mocks", () => {
  it("passes the mocks for every relation and many pairs and draws", () => {
    let i = 0;
    for (const relation of RELATIONS) for (const partner of PARTNERS) {
      const mc = context(`m-${i++}`, relation, partner, i % 2 ? "민지" : "");
      expect(hard(validateMatchTeaser(mockMatchTeaser(mc.facts), mc.facts)), `teaser ${relation}`).toEqual([]);
      expect(hard(validateMatchPartA(mockMatchPartA(mc.facts), mc.facts)), `A ${relation}`).toEqual([]);
      expect(hard(validateMatchPartB(mockMatchPartB(mc.facts, mc.cards), mc.facts, mc.cards)), `B ${relation}`).toEqual([]);
    }
  });

  it("passes the mocks for random births, relations, labels, concerns and draws", () => {
    for (let i = 0; i < 40; i++) {
      const mc = randomContext(2000 + i);
      const label = `${i} ${mc.facts.relation}`;
      expect(hard(validateMatchTeaser(mockMatchTeaser(mc.facts), mc.facts)), `teaser ${label}`).toEqual([]);
      expect(hard(validateMatchPartA(mockMatchPartA(mc.facts), mc.facts)), `A ${label}`).toEqual([]);
      expect(hard(validateMatchPartB(mockMatchPartB(mc.facts, mc.cards), mc.facts, mc.cards)), `B ${label}`).toEqual([]);
    }
  });

  it("passes the card part's mock and validator with the Starlog deck's own pictures, the design most users see (owner 2026-10-17)", () => {
    for (let i = 0; i < 40; i++) {
      const { facts } = randomContext(3000 + i);
      const drawn = pickCards(createDeck(`match-starlog-${i}`, DEFAULT_REVERSAL_RATE), TEMPLATES.match, [4, 18, 33, 51, 70]);
      const cards = matchCardsContext(facts.relation, drawn, "starlog");
      for (const card of cards.cards) expect(card.kb.imagery.facts, card.cardId).toEqual(kbCard(card.cardId).imagery.decks?.starlog?.facts);
      expect(hard(validateMatchPartB(mockMatchPartB(facts, cards), facts, cards)), `B ${i} ${facts.relation}`).toEqual([]);
    }
  });

  it("catches a stated feeling, a reunion promise, a score and a romance word between coworkers", () => {
    const mc = context("bad", "coworker", PARTNERS[0]!, "민지");
    const a = mockMatchPartA(mc.facts);
    const feelings = { ...a, dayMasters: { body: `${a.dayMasters.body} 민지는 이미 나를 좋아해요.` } };
    expect(validateMatchPartA(feelings, mc.facts).join(" ")).toContain("상대의 마음");
    const reunion = { ...a, luck: { body: `${a.luck.body} 내년에는 다시 만나게 돼요.` } };
    expect(validateMatchPartA(reunion, mc.facts).join(" ")).toContain("재회");
    const score = { ...a, elements: { body: `${a.elements.body} 궁합 점수로 치면 높은 편이에요.` } };
    expect(hard(validateMatchPartA(score, mc.facts)).length).toBeGreaterThan(0);
    const b = mockMatchPartB(mc.facts, mc.cards);
    const romance = { ...b, action: { body: `${b.action.body} 데이트를 신청해 보세요.` } };
    expect(validateMatchPartB(romance, mc.facts, mc.cards).join(" ")).toContain("연애 어휘");
    const named = { ...b, bridge: { body: `${b.bridge.body} 이 풀이는 GPT가 썼어요.` } };
    expect(hard(validateMatchPartB(named, mc.facts, mc.cards)).length).toBeGreaterThan(0);
    const stray = [..."甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥"].find((g) => !mc.facts.allowed.glyphs.includes(g))!;
    const glyph = { ...a, pillars: { body: `${a.pillars.body} 두 사람 사이에 ${stray}의 기운도 있어요.` } };
    expect(validateMatchPartA(glyph, mc.facts).join(" ")).toMatch(/간지 글자/);
  });

  it("passes the follow-up mock (and an identity question) and catches a stated feeling in a follow-up", () => {
    for (const relation of RELATIONS) {
      const { facts, cards } = context(`followup-${relation}`, relation, PARTNERS[0]!, "민지");
      for (const question of ["민지는 저를 어떻게 생각할까요?", "너 무슨 AI야?"]) {
        expect(hard(validateMatchFollowUp(mockMatchFollowUp(facts, question), facts, cards, question)), `${relation} ${question}`).toEqual([]);
      }
    }
    const { facts, cards } = context("followup-feeling", "crush", PARTNERS[1]!, "민지");
    const answer = { kind: "clarify" as const, answer: `${"두 사람의 일간이 만나는 결을 앞에서 읽었어요. ".repeat(4)}민지는 사실 나를 좋아해요.` };
    expect(validateMatchFollowUp(answer, facts, cards, "민지 마음이 궁금해요").some((v) => v.includes("상대의 마음"))).toBe(true);
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

  it("generates a preview and both parts, then assembles with the saju group before the cards", async () => {
    const mc = context("gen", "spouse", PARTNERS[1]!);
    const preview = (await generateMatchTeaser(mockProvider, mc)).data;
    expect(preview.facts.length).toBeGreaterThan(0);
    expect(preview.facts.length).toBeLessThanOrEqual(3);
    expect(preview.cards).toHaveLength(5);
    expect(preview.charts.partner.pillars.length).toBeGreaterThanOrEqual(3);
    const a = (await generateMatchPart(mockProvider, mc, 0, [])).data;
    const b = (await generateMatchPart(mockProvider, mc, 1, [a])).data;
    const reading = assembleMatch(mc, [a, b]);
    expect(reading.saju.dayMasters.heading).toBe(MATCH_HEADINGS.dayMasters);
    expect(reading.cards.map((c) => c.cardId)).toEqual(mc.cards.cards.map((c) => c.cardId));
    expect(reading.bridge.body).toContain("사주");
  });
});
