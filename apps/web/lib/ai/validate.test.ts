import { TEMPLATES, computeChart, createDeck, pickCards, type DrawnCard } from "@starlog/core";
import sajuSample from "@content/samples/saju-prologue.ko.json";
import tarotSample from "@content/samples/tarot-contact.ko.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { mockTarotFollowUp, mockTarotReading, mockTarotTeaser } from "./mock";
import { buildFactSet } from "./prompts/saju";
import { buildTarotContext, cardBrief, mentionsWord, tarotReadingPrompt, type TarotInput } from "./prompts/tarot";
import type { SajuReading, TarotReading } from "./schemas";
import { moneyPushSentences, validateSajuFollowUp, validateSajuReading, validateTarotFollowUp, validateTarotReading, validateTarotTeaser } from "./validate";

const MONEY_INPUT: TarotInput = {
  topicId: "money", whoId: "me", whenId: "week", question: "",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }, { label: "관심 방향", value: "지출 줄이기" }],
  note: "이번 달 카드값이 많이 나왔어요",
};
const moneyCtx = (seed = "money") => buildTarotContext("self-flow", pickCards(createDeck(seed, 0.3), TEMPLATES["self-flow"], [3, 30, 60]), MONEY_INPUT);
const withAlternatives = (r: TarotReading, extra: string): TarotReading => ({ ...r, alternatives: { ...r.alternatives, body: `${r.alternatives.body} ${extra}` } });

describe("money advice vs money pushing (review important 2)", () => {
  it.each([
    "무리한 투자보다는 지출 점검부터 해 보세요.",
    "대출 이자부터 확인해 보세요.",
    "공부에 시간을 투자해 보세요.",
    "큰 결정을 하기 전에 이번 달 카드값을 먼저 정리해 보세요.",
    "주식 앱을 여는 대신 가계부를 열어 보세요.",
  ])("passes advice the prompt asks for: %s", (sentence) => {
    expect(moneyPushSentences(sentence)).toEqual([]);
    const ctx = moneyCtx();
    expect(validateTarotReading(withAlternatives(mockTarotReading(ctx), sentence), ctx)).toEqual([]);
  });

  it.each([
    "지금 코인에 투자하세요.",
    "이번 주에 주식을 사 두세요.",
    "곧 수익이 날 거예요.",
    "대출을 받아도 돼요.",
    "투자하면 돈이 들어와요.",
  ])("fails a real buy/invest order or profit promise: %s", (sentence) => {
    expect(moneyPushSentences(sentence)).toHaveLength(1);
    const ctx = moneyCtx();
    expect(validateTarotReading(withAlternatives(mockTarotReading(ctx), sentence), ctx).join(" ")).toMatch(/투자·매수·대출/);
  });
});

describe("saju: forbidden topics may be named only while declining them (review important 2)", () => {
  const facts = buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.parse("2026-09-30T03:00:00Z"));
  const gold: SajuReading = { ...sajuSample.paid, story: sajuSample.story, followUps: ["지금 대운에서 해 볼 작은 실험은요?", "오행 지도를 일상에 어떻게 쓸까요?"] };
  const edit = (extra: string): SajuReading => ({ ...gold, sections: gold.sections.map((s, i) => (i === 5 ? { ...s, body: `${s.body} ${extra}` } : s)) });

  it.each([
    "결혼 시기는 이 풀이의 근거로는 말하기 어려워요.",
    "투자 판단은 이 풀이로는 하지 않아요.",
    "건강이나 질병은 이 풀이에서 다루지 않아요.",
    "재회 여부는 명식으로 말할 수 없어요.",
  ])("passes a declining sentence: %s", (sentence) => {
    expect(validateSajuReading(edit(sentence), facts)).toEqual([]);
  });

  it.each([
    "올해 결혼 운이 들어와요.",
    "투자하면 돈이 들어와요.",
    "재회할 수 있는 흐름이에요.",
    "수술을 조심하세요.",
  ])("fails an actual claim: %s", (sentence) => {
    expect(validateSajuReading(edit(sentence), facts).length).toBeGreaterThan(0);
  });

  it("lets a follow-up answer name the user's own topic while declining it", () => {
    const answer = "결혼 시기는 이 풀이의 근거로는 말하기 어려워요. 대신 일지 편인(偏印)의 자리를 보면, 혼자 정리하는 시간이 가까운 관계를 편하게 만드는 구조로 읽어요. 이번 주에 가까운 사람과 보낸 시간 뒤의 기분을 한 줄로 적어 보세요. 두세 번 쌓이면 이 자리가 내게 어떻게 닿는지 스스로 가늠해 볼 수 있어요. 결론은 그대로 두고 작은 기록부터 시작해 보면 좋아요.";
    expect(validateSajuFollowUp({ kind: "out_of_scope", answer }, facts, "저 결혼은 언제 해요?")).toEqual([]);
  });
});

describe("word boundaries and the user's own words (review minors 1-4)", () => {
  it("does not read 우연인·필연인 as the banned 연인", () => {
    expect(mentionsWord("우연인지 필연인지 모르지만", "연인")).toBe(false);
    expect(mentionsWord("연인과 함께", "연인")).toBe(true);
    const ctx = moneyCtx();
    expect(validateTarotReading(withAlternatives(mockTarotReading(ctx), "우연인지 아닌지보다 이번 주 지출 기록이 먼저예요."), ctx)).toEqual([]);
  });

  it("keeps KB lines that use a banned word out of the prompt", () => {
    // wands-08 reversed, group angle: "연락이 엇갈리거나 공지가 늦어…"
    const drawn: DrawnCard[] = [
      { cardId: "wands-08", position: "모임의 분위기", orientation: "reversed", slot: 0 },
      { cardId: "cups-06", position: "나의 자리", orientation: "upright", slot: 1 },
      { cardId: "swords-03", position: "도움이 될 태도", orientation: "upright", slot: 2 },
    ];
    const ctx = buildTarotContext("group", drawn, { topicId: "people", whoId: "group", whenId: "month", question: "", conditions: [], note: "" });
    expect(ctx.bannedWords).toContain("연락");
    for (const card of ctx.cards) {
      const brief = cardBrief(card, ctx) as { positionLens: string | null; topicAngle: string[]; actionHints: string[]; combinations: string[] };
      const texts = [brief.positionLens ?? "", ...brief.topicAngle, ...brief.actionHints, ...brief.combinations];
      for (const word of ctx.bannedWords) expect([card.cardId, word, texts.some((t) => mentionsWord(t, word))]).toEqual([card.cardId, word, false]);
    }
    expect(tarotReadingPrompt(ctx)).not.toContain("연락이 엇갈리거나");
  });

  it("does not fail a reading for quoting the user's own words", () => {
    const ctx = buildTarotContext("self-flow", pickCards(createDeck("own-words", 0.3), TEMPLATES["self-flow"], [3, 30, 60]), { ...MONEY_INPUT, note: "이번 달엔 반드시 돈을 모으고 싶어요" });
    const reading = mockTarotReading(ctx);
    expect(JSON.stringify(reading)).toContain("반드시");
    expect(validateTarotReading(reading, ctx)).toEqual([]);
    expect(validateTarotTeaser(mockTarotTeaser(ctx), ctx)).toEqual([]);
  });

  it("checks follow-up answers for topic drift and invented imagery, allowing the question's own words", () => {
    const ctx = moneyCtx("follow");
    const base = mockTarotFollowUp(ctx).answer;
    expect(validateTarotFollowUp({ kind: "clarify", answer: base }, ctx, "지출은 어떻게 줄여요?")).toEqual([]);
    expect(validateTarotFollowUp({ kind: "clarify", answer: `${base} 연락을 먼저 해 보세요.` }, ctx, "지출은 어떻게 줄여요?").join(" ")).toMatch(/관계 어휘/);
    expect(validateTarotFollowUp({ kind: "new_question", answer: `${base} 연락 문제는 새 카드로 따로 보는 편이 좋아요.` }, ctx, "그 사람한테 연락해도 돼요?")).toEqual([]);
    const hermit = buildTarotContext("self-flow", [
      { cardId: "major-09-hermit", position: "지금의 나", orientation: "upright", slot: 0 },
      { cardId: "pentacles-03", position: "필요한 것", orientation: "upright", slot: 1 },
      { cardId: "cups-04", position: "이 시기의 흐름", orientation: "upright", slot: 2 },
    ], MONEY_INPUT);
    const answer = mockTarotFollowUp(hermit).answer;
    expect(validateTarotFollowUp({ kind: "clarify", answer }, hermit, "")).toEqual([]);
    expect(validateTarotFollowUp({ kind: "clarify", answer: `${answer} 노인은 등불을 낮게 들어 발밑을 비춰요.` }, hermit, "").join(" ")).toMatch(/그림에 없는 묘사/);
  });

  it("does not flag a blindfold in the story as 정의's misdescription when 검 2 is drawn", () => {
    const drawn: DrawnCard[] = [
      { cardId: "cups-12", position: "지금의 나", orientation: "reversed", slot: 0 },
      { cardId: "major-11-justice", position: "필요한 것", orientation: "upright", slot: 1 },
      { cardId: "swords-02", position: "이 시기의 흐름", orientation: "upright", slot: 2 },
    ];
    const ctx = buildTarotContext("self-flow", drawn, MONEY_INPUT);
    expect(validateTarotReading(mockTarotReading(ctx), ctx)).toEqual([]);
  });

  it("keeps mock money readings valid across many seeded draws", () => {
    for (let s = 0; s < 200; s++) {
      const ctx = moneyCtx(`sweep-${s}`);
      expect([s, validateTarotReading(mockTarotReading(ctx), ctx), validateTarotTeaser(mockTarotTeaser(ctx), ctx)]).toEqual([s, [], []]);
    }
  });

  it("still passes the gold relationship reading", () => {
    const draw: DrawnCard[] = tarotSample.cards.map((c, slot) => ({ cardId: c.cardId, position: c.position, orientation: "upright", slot }));
    const ctx = buildTarotContext("relationship-contact", draw, { topicId: "contact", whoId: "us", whenId: "month", question: tarotSample.question, conditions: tarotSample.input.conditions, note: tarotSample.input.note });
    expect(validateTarotReading({ ...tarotSample.paid, story: tarotSample.story, followUps: tarotSample.followUps }, ctx)).toEqual([]);
  });
});
