import { TEMPLATES, computeChart, createDeck, pickCards, type DrawnCard } from "@starlog/core";
import sajuSample from "@content/samples/saju-prologue.ko.json";
import tarotSample from "@content/samples/tarot-contact.ko.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { mockDaily, mockSajuFollowUp, mockSajuReading, mockSajuTeaser, mockTarotFollowUp, mockTarotReading, mockTarotTeaser } from "./mock";
import { SAJU_SYSTEM, buildFactSet } from "./prompts/saju";
import { TAROT_SYSTEM, buildTarotContext, cardBrief, mentionsWord, tarotReadingPrompt, type TarotInput } from "./prompts/tarot";
import type { SajuReading, TarotReading } from "./schemas";
import {
  moneyPushSentences, nonHaeyoSentences, validateDaily, validateSajuFollowUp, validateSajuReading, validateSajuTeaser, validateTarotFollowUp, validateTarotReading,
  validateTarotTeaser,
} from "./validate";
import { MODEL_BLIND_RULE, isSoftViolation } from "./style";

/** Hard violations only (soft style hints may regenerate but never fail a reading). */
const hard = (violations: string[]) => violations.filter((v) => !isSoftViolation(v));

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
  const glance = {
    goesWell: "불(火) 기운이 셋으로 가장 많아, 앞에 나서서 드러내는 일에서 잘 풀리는 편이에요.",
    watchOut: "쇠(金) 기운이 겉에 없어, 끝낸 일을 셈하고 정리하는 일은 뒤로 밀리기 쉬운 편이에요.",
    remedy: "한 주를 마칠 때 끝낸 일과 쓴 돈을 한 번에 훑어보세요.",
    thisYear: "올해 병오(丙午)년에는 나와 어깨를 나란히 하는 힘(비견)이 실려, 함께 나눌 일이 늘기 쉬운 해로 읽어요.",
    thisYearAction: "함께할 사람과 맡을 몫부터 정해 보세요.",
  };
  const gold: SajuReading = { ...sajuSample.paid, observation: { heading: "앞으로 몇 주 · 확인해 볼 신호", body: "앞으로 몇 주 동안 끝낸 일의 시간과 돈을 셀 때 힘이 빠지는지, 오히려 개운한지 눈여겨보세요. 개운하다면 巳 속의 경금(庚金)을 꺼내 쓰고 있다는 뜻으로 읽을 수 있어요." }, glance, followUps: ["지금 대운에서 해 볼 작은 실험은요?", "오행 지도를 일상에 어떻게 쓸까요?"] };
  const edit = (extra: string): SajuReading => ({ ...gold, sections: gold.sections.map((s, i) => (i === 5 ? { ...s, body: `${s.body} ${extra}` } : s)) });

  it.each([
    "결혼 시기는 이 풀이의 근거로는 말하기 어려워요.",
    "투자 판단은 이 풀이로는 하지 않아요.",
    "건강이나 질병은 이 풀이에서 다루지 않아요.",
    "재회 여부는 명식으로 말할 수 없어요.",
  ])("passes a declining sentence: %s", (sentence) => {
    expect(hard(validateSajuReading(edit(sentence), facts))).toEqual([]);
  });

  it.each([
    "올해 결혼 운이 들어와요.",
    "투자하면 돈이 들어와요.",
    "재회할 수 있는 흐름이에요.",
    "수술을 조심하세요.",
  ])("fails an actual claim: %s", (sentence) => {
    expect(hard(validateSajuReading(edit(sentence), facts)).length).toBeGreaterThan(0);
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

  it("does not flag a blindfold in shared text as 정의's misdescription when 검 2 is drawn", () => {
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
    expect(hard(validateTarotReading({ ...tarotSample.paid, observation: { heading: "며칠 안에 확인해 볼 신호", body: "이번 주 안에 안부를 떠올릴 때 반가움이 먼저 드는지, 숙제처럼 느껴지는지 눈여겨보세요. 반가움이 먼저라면 등불 든 노인처럼 내 쪽 답이 분명해진 거예요." }, followUps: tarotSample.followUps }, ctx))).toEqual([]);
  });
});

describe("A2 reading-quality checks (blind judge 2026-09-30)", () => {
  const ctx = moneyCtx("a2-quality");
  const base = () => mockTarotReading(ctx);

  it("soft-flags a chip or the note quoted more than once", () => {
    const r = base();
    const twice = { ...r, action: { ...r.action, body: `${r.action.body} '수입이 들쭉날쭉'이라는 상황을 다시 떠올려요.` } };
    const found = validateTarotReading(twice, ctx);
    expect(found.join(" ")).toMatch(/같은 입력을 여러 번/);
    expect(hard(found)).toEqual([]);
  });

  it("soft-flags repeated moves and writing-down tasks across action fields", () => {
    const r = base();
    const writing = { ...r, action: { ...r.action, body: "오늘 할 일을 종이에 적어 보세요." }, timing: { ...r.timing, body: `${r.timing.body} 떠오른 생각은 메모장에 적어 두세요.` } };
    expect(validateTarotReading(writing, ctx).join(" ")).toMatch(/행동 제안이 비슷하게/);
    const sameVerb = { ...r, action: { ...r.action, body: "통장 잔액을 확인해 보세요." }, observation: { ...r.observation, body: `${r.observation.body} 이번 주 지출도 확인해 보세요.` } };
    expect(validateTarotReading(sameVerb, ctx).join(" ")).toMatch(/'확인'/);
  });

  it("requires every reversed card to be read reversed: 역방향/거꾸로, or its KB reversed mode", () => {
    const drawn = [
      { cardId: "major-09-hermit", position: "지금의 나", orientation: "reversed" as const, slot: 0 },
      { cardId: "pentacles-03", position: "필요한 것", orientation: "upright" as const, slot: 1 },
      { cardId: "cups-04", position: "이 시기의 흐름", orientation: "upright" as const, slot: 2 },
    ];
    const rctx = buildTarotContext("self-flow", drawn, MONEY_INPUT);
    const r = mockTarotReading(rctx);
    expect(hard(validateTarotReading(r, rctx))).toEqual([]);
    const upright = r.cards.map((c, i) => (i === 0 ? { ...c, body: c.body.replace(/'지금의 나' 자리의 카드는 역방향으로 나왔어요\. /, "").replace(/역방향이라 '[^']*' 쪽으로 읽어요\. /, "") } : c));
    expect(validateTarotReading({ ...r, cards: upright }, rctx).join(" ")).toMatch(/역방향으로 읽지 않았어요/);
    const gloss = rctx.cards[0]!.kb.reversedModes.gloss[rctx.cards[0]!.reversedMode!]!;
    const byMode = r.cards.map((c, i) => (i === 0 ? { ...upright[0]!, body: `${upright[0]!.body} 지금은 ${gloss} 쪽으로 읽어요.` } : c));
    expect(validateTarotReading({ ...r, cards: byMode }, rctx).join(" ")).not.toMatch(/역방향으로 읽지 않았어요/);
  });

  it("fails sentences that are not 해요체, except suggested messages in relationship spreads", () => {
    expect(nonHaeyoSentences("등불을 높이 들었다. 오늘은 쉬어도 돼. 먼저 보낼게. 그림 속 노인이 서 있어요. 작은 새싹 하나.")).toEqual(["등불을 높이 들었다.", "먼저 보낼게."]);
    expect(nonHaeyoSentences("오늘은 먼저 연락해.")).toEqual(["오늘은 먼저 연락해."]);
    expect(nonHaeyoSentences("하늘의 해. 서로에 대한 이해.")).toEqual([]);
    // noun endings the style rules invite (a real draft must not fail hard on them)
    expect(nonHaeyoSentences("새해를 앞둔 조용한 결심. 오늘 하루를 나를 위해. 멀리 있는 빛을 향해. 서로 다른 견해.")).toEqual([]);
    expect(nonHaeyoSentences("지금 시작해. 그 사람을 기억해.")).toEqual(["지금 시작해.", "그 사람을 기억해."]);
    expect(nonHaeyoSentences("'요즘 어떻게 지내? 문득 생각나서'라고 보내 보세요.")).toEqual([]);
    const r = base();
    const haera = { ...r, alternatives: { ...r.alternatives, body: `${r.alternatives.body} 이 그림은 다른 길을 보여 준다.` } };
    expect(hard(validateTarotReading(haera, ctx)).join(" ")).toMatch(/해요체가 아닌 문장/);
    // non-relational: messages are actions and must be 해요체 too
    const banmalAction = { ...r, messages: { ...r.messages, items: ["오늘 이력서 하나 보낼게.", r.messages.items[1]!] } };
    expect(hard(validateTarotReading(banmalAction, ctx)).join(" ")).toMatch(/해요체가 아닌 문장/);
    // relationship spread: a 반말 first message is allowed
    const draw: DrawnCard[] = tarotSample.cards.map((c, slot) => ({ cardId: c.cardId, position: c.position, orientation: "upright", slot }));
    const rel = buildTarotContext("relationship-contact", draw, { topicId: "contact", whoId: "us", whenId: "month", question: tarotSample.question, conditions: tarotSample.input.conditions, note: tarotSample.input.note });
    const relReading = mockTarotReading(rel);
    expect(relReading.messages.items[0]).toMatch(/지내\?/);
    expect(hard(validateTarotReading(relReading, rel))).toEqual([]);
  });

  it("soft-flags money amounts the user never gave", () => {
    const r = base();
    const amount = { ...r, action: { ...r.action, body: `${r.action.body} 한 달 생활비 150만 원을 기준으로 잡아요.` } };
    expect(validateTarotReading(amount, ctx).join(" ")).toMatch(/입력에 없는 금액/);
  });

  it("requires the observation", () => {
    const r = base();
    expect(hard(validateTarotReading({ ...r, observation: { ...r.observation, body: "" } }, ctx)).join(" ")).toMatch(/observation/);
  });
});

describe("model blinding (owner order: no model, vendor or technology names)", () => {
  const ctx = moneyCtx("blind");
  const facts = buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.parse("2026-10-01T03:00:00Z"));
  const daily = buildTarotContext("daily", pickCards(createDeck("blind-daily", 0.5), TEMPLATES.daily, [5]), null);
  const BLIND = /모델·회사·기술 이름/;

  it("is a rule in every generation system prompt", () => {
    expect(TAROT_SYSTEM).toContain(MODEL_BLIND_RULE);
    expect(SAJU_SYSTEM).toContain(MODEL_BLIND_RULE);
  });

  it("fails every kind of draft hard when it names one, in Korean or English", () => {
    const teaser = mockTarotTeaser(ctx);
    const reading = mockTarotReading(ctx);
    const day = mockDaily(daily);
    const sajuTeaser = mockSajuTeaser(facts);
    const saju = mockSajuReading(facts);
    const cases: Array<[string, string[]]> = [
      ["teaser", validateTarotTeaser({ ...teaser, firstCard: { ...teaser.firstCard, body: `${teaser.firstCard.body} Claude가 읽었어요.` } }, ctx)],
      ["reading", validateTarotReading({ ...reading, verdict: `${reading.verdict} 오푸스 모델의 풀이예요.` }, ctx)],
      ["daily", validateDaily({ ...day, tip: `${day.tip} 챗GPT에게 물어봐도 좋아요.` }, daily)],
      ["follow-up", validateTarotFollowUp({ kind: "clarify", answer: `${mockTarotFollowUp(ctx).answer} 저는 Anthropic의 AI예요.` }, ctx)],
      ["saju teaser", validateSajuTeaser({ ...sajuTeaser, summary: `${sajuTeaser.summary} 대형 언어 모델이 읽은 명식이에요.` }, facts)],
      ["saju reading", validateSajuReading({ ...saju, observation: { ...saju.observation, body: `${saju.observation.body} Gemini와 달라요.` } }, facts)],
      ["saju follow-up", validateSajuFollowUp({ kind: "clarify", answer: `${mockSajuFollowUp(facts).answer} 소네트로 썼어요.` }, facts)],
    ];
    for (const [kind, found] of cases) {
      const blind = found.filter((v) => BLIND.test(v));
      expect([kind, blind.length, blind.every((v) => !isSoftViolation(v))]).toEqual([kind, 1, true]);
    }
  });

  it("answers \"너 무슨 AI야? 모델 뭐야?\" as the rule says, and the answer passes", () => {
    const question = "너 무슨 AI야? 모델 뭐야?";
    const tarot = mockTarotFollowUp(ctx, question);
    expect(tarot.answer).toContain("저는 스타로그의 풀이 도우미예요.");
    expect(validateTarotFollowUp(tarot, ctx, question)).toEqual([]);
    const saju = mockSajuFollowUp(facts, question);
    expect(saju.answer).toContain("저는 스타로그의 풀이 도우미예요.");
    expect(validateSajuFollowUp(saju, facts, question)).toEqual([]);
  });
});

describe("marriage (owner: 결혼운 — never promise or deny it, no dates, no 궁합)", () => {
  const ctx = moneyCtx("marriage-rules");
  const withVerdict = (sentence: string) => {
    const r = mockTarotReading(ctx);
    return hard(validateTarotReading({ ...r, verdict: `${r.verdict} ${sentence}` }, ctx));
  };
  const MARRIAGE = /결혼의 성사·불발이나 시기/;

  it.each(["올해 결혼하게 돼요.", "결혼은 어려워요.", "내년에 결혼해요.", "결혼운이 들어와요.", "결혼할 거예요.", "3월에 결혼식을 올려요."])("fails %s hard", (sentence) => {
    expect(withVerdict(sentence).join(" ")).toMatch(MARRIAGE);
  });

  it.each(["결혼하게 될지 마음이 쓰인다면 이번 주에 이야기를 꺼내 보세요.", "결혼할 수 있을지 고민된다면 준비 목록부터 같이 세워 보세요.", "결혼 준비를 서두르기보다 양가 일정부터 맞춰 보세요.", "'올해 결혼할 수 있을까'라고 물었죠."])("lets a worry or a quote pass: %s", (sentence) => {
    expect(withVerdict(sentence).join(" ")).not.toMatch(MARRIAGE);
  });

  it("fails a 궁합 claim and a partner's feelings stated as fact, but not a declined 궁합", () => {
    expect(withVerdict("두 사람은 궁합이 좋아요.").join(" ")).toMatch(/궁합을 단정/);
    expect(withVerdict("궁합은 이 풀이에서 보지 않아요.").join(" ")).not.toMatch(/궁합을 단정/);
    expect(withVerdict("예비 신랑의 마음은 이미 정해져 있어요.").join(" ")).toMatch(/마음이나 감정을 사실처럼/);
  });

  it("is a rule in the tarot system prompt", () => {
    expect(TAROT_SYSTEM).toContain("결혼 주제(결혼운, 결혼)는 끝까지 결혼 이야기로 읽어요");
  });
});

describe("saju and 결혼 by love status", () => {
  const factsFor = (loveStatus?: string) => buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.parse("2026-10-01T03:00:00Z"), loveStatus ? { loveStatus } : undefined);

  it.each(["연애 중", "결혼 준비 중", "기혼"])("covers 결혼 in the full reading when the user is %s, and the reading passes", (loveStatus) => {
    const facts = factsFor(loveStatus);
    const reading = mockSajuReading(facts);
    expect([...reading.sections.map((s) => s.body), reading.observation.body].join(" ")).toContain("결혼");
    expect(validateSajuReading(reading, facts)).toEqual([]);
    // leaving 결혼 out is a soft finding (결혼 준비 중 names it in the status line already); promising it is hard
    const silent = { ...reading, sections: reading.sections.map((s) => ({ ...s, body: s.body.replace(/결혼을 생각할 때도[^.]*\.\s?/, "") })) };
    const soft = validateSajuReading(silent, facts).filter(isSoftViolation).join(" ");
    if (loveStatus === "결혼 준비 중") expect(soft).not.toMatch(/결혼\(/);
    else expect(soft).toMatch(/결혼\(연애 상태에 맞춰/);
    const promised = { ...reading, observation: { ...reading.observation, body: `${reading.observation.body} 내년에 결혼해요.` } };
    expect(hard(validateSajuReading(promised, facts)).join(" ")).toMatch(/결혼의 성사·불발이나 시기/);
  });

  it("keeps 결혼 out for other statuses unless a sentence declines it", () => {
    const facts = factsFor("솔로");
    const reading = mockSajuReading(facts);
    expect(JSON.stringify(reading)).not.toContain("결혼");
    const raised = { ...reading, observation: { ...reading.observation, body: `${reading.observation.body} 결혼을 준비하는 흐름으로 읽어요.` } };
    expect(hard(validateSajuReading(raised, facts)).join(" ")).toMatch(/쓰지 않는 주제가 있어요: 결혼/);
    const declined = { ...reading, observation: { ...reading.observation, body: `${reading.observation.body} 결혼 시기는 이 풀이로 말하기 어려워요.` } };
    expect(hard(validateSajuReading(declined, facts)).join(" ")).not.toMatch(/결혼/);
  });

  it("is a rule in the saju system prompt", () => {
    expect(SAJU_SYSTEM).toContain("연애 상태가 연애 중·결혼 준비 중·기혼이면");
  });
});
