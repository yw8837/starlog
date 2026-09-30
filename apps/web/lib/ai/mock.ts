import "server-only";
import type { KbCard, TopicAngle } from "@/lib/kb";
import { UNSURE_OPTIONS, WHEN_KO, cardLabel, tarotHeadings, type TarotCardContext, type TarotContext } from "./prompts/tarot";
import type { GenerationTask, ReadingProvider } from "./provider";
import type { DailyDraft, FollowUpAnswer, TarotReading, TarotTeaserDraft } from "./schemas";

/**
 * Deterministic readings without a model, for tests, key-less local dev and e2e (STARLOG_AI=mock).
 * Built only from the drawn cards' KB entries, the template's positions and the user's own chips
 * and note, so a money question gets money-angle text, never the relationship sample.
 */

export const mockProvider: ReadingProvider = {
  name: "mock",
  async generate<T>(task: GenerationTask<T>, attempt: number) {
    return { data: task.schema.parse(task.mock(attempt)), usage: [] };
  },
};

// ---- Korean helpers ----

/** True when the last Hangul syllable has a final consonant (받침). */
function hasFinal(word: string): boolean {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

/** "은둔자는", "별은": topic particle chosen by the last syllable (digits read as-is: 컵 2 → 는). */
const topic = (word: string) => `${word}${hasFinal(word) ? "은" : "는"}`;

const factSentence = (fact: string) => `${fact}는 장면이 그려져 있어요.`;

/** The card's facts, most salient first. */
const factsOf = (kb: KbCard) => [...kb.imagery.facts].sort((a, b) => a.salience - b.salience);

const firstSentence = (text: string) => text.split(/(?<=[.?!])\s+/)[0] ?? text;

function chips(ctx: TarotContext): string[] {
  return ctx.conditions.filter((c) => !UNSURE_OPTIONS.includes(c.value)).map((c) => c.value);
}

/** Chips assigned to a card section, round-robin, so every chip is quoted somewhere. */
function chipsFor(ctx: TarotContext, slot: number): string[] {
  return chips(ctx).filter((_, i) => i % ctx.cards.length === slot);
}

function angleText(card: TarotCardContext, angle: TopicAngle): string {
  return card.kb.topics[angle][card.orientation];
}

/** KB text that stays on topic (a few KB lines mention 연락/이별 in work or group angles). */
const onTopic = (ctx: TarotContext, text: string) => !ctx.bannedWords.some((word) => text.includes(word));

/** Card-section budget (chars without spaces): optional sentences stop once the section is full. */
const SECTION_BUDGET = 230;
const count = (text: string) => text.replace(/\s/g, "").length;

function cardBody(ctx: TarotContext, card: TarotCardContext, factIndex: number, withNote: boolean, extra: string[] = [], budget = SECTION_BUDGET): string {
  const facts = factsOf(card.kb);
  const fact = facts[factIndex % facts.length]!;
  const required: string[] = [];
  if (card.orientation === "reversed") required.push(`'${card.position}' 자리의 카드는 역방향으로 나왔어요.`);
  required.push(factSentence(fact.ko));
  if (card.reversedMode) required.push(`역방향이라 '${card.kb.reversedModes.gloss[card.reversedMode] ?? card.kb.core.oneLine.reversed}' 쪽으로 읽어요.`);
  for (const chip of chipsFor(ctx, card.slot)) required.push(`'${chip}'라고 골랐으니 이 그림을 그 상황에 비춰 보면 좋아요.`);
  if (withNote && ctx.note) required.push(`메모에 '${ctx.note}'라고 적었죠.`);
  const optional = [
    card.kb.positionHints[card.position]?.[card.orientation],
    angleText(card, ctx.angles[0] ?? "self"),
    `이 자리에서는 ${card.kb.core[card.orientation].join(", ")} 같은 결을 떠올려 보면 좋아요.`,
    ...extra,
  ].filter((s): s is string => Boolean(s) && onTopic(ctx, s!));
  const parts = [...required];
  for (const sentence of optional) {
    if (count(parts.join("")) + count(sentence) <= budget) parts.splice(parts.length - (withNote && ctx.note ? 1 : 0), 0, sentence);
  }
  return parts.join(" ");
}

function actionOf(card: TarotCardContext, ctx?: TarotContext): string {
  const hint = card.kb.actionHints.find((a) => (a.orientation === card.orientation || a.orientation === "both") && (!ctx || onTopic(ctx, a.ko)));
  return hint?.ko ?? "오늘 할 일 하나를 골라 작게 시작해 보세요.";
}

// ---- tarot ----

export function mockTarotTeaser(ctx: TarotContext): TarotTeaserDraft {
  const first = ctx.cards[0]!;
  const extra = [`한 줄로 정리하면 ${first.kb.core.oneLine[first.orientation]}로 읽어요.`, `${first.kb.keywordsKo.join(", ")} 같은 말이 이 자리의 열쇠예요.`];
  const body = [cardBody(ctx, first, 0, true, extra, 300), `오늘은 ${actionOf(first, ctx)}`].join(" ");
  return {
    cards: ctx.cards.map((c) => ({ position: c.position, cardId: c.cardId, keyword: c.kb.keywordsKo[0] ?? c.name })),
    firstCard: { heading: cardLabel(first), body },
  };
}

export function mockTarotReading(ctx: TarotContext): TarotReading {
  const h = tarotHeadings(ctx);
  const [first] = ctx.cards as [TarotCardContext, ...TarotCardContext[]];
  const last = ctx.cards[ctx.cards.length - 1]!;
  const angle = ctx.angles[0] ?? "self";
  const when = ctx.when ? WHEN_KO[ctx.when] : "고른 시기";
  const keyword = first.kb.keywordsKo[0] ?? first.name;

  const cards = ctx.cards.map((card) => ({
    position: card.position,
    cardId: card.cardId,
    heading: `${card.name} · ${card.kb.keywordsKo[0] ?? card.position}`,
    body: cardBody(ctx, card, 1, card.slot === 0, [`한 줄로 정리하면 ${card.kb.core.oneLine[card.orientation]}로 읽어요.`]),
  }));

  const labels = ctx.relational ? ["답이 빨리 오면", "답이 늦게 오면", "답이 없으면"] : ["흐름이 좋아지면", "그대로 머물면", "잠시 막히면"];
  const scenarioCards = [first, ctx.cards[1] ?? first, last];
  return {
    verdict: `지금은 '${keyword}' 쪽으로 작게 움직여 보는 편이 좋아요.`,
    cards,
    connection: {
      heading: h.connection,
      body: `차례로 보면 ${ctx.cards.map((c) => `${c.name}(${c.kb.core.oneLine[c.orientation]})`).join(", 그다음 ")}로 이어져요. 세 흐름이 한 방향을 가리키는지, 어디서 갈라지는지 살펴보면 좋아요.`,
    },
    timing: { heading: h.timing, body: `${when} 안에서는 ${actionOf(last, ctx)} 그렇게 준비가 된 뒤에 움직이는 편이 자연스러워요.` },
    scenarios: {
      heading: h.scenarios,
      items: labels.map((label, i) => {
        const line = firstSentence(angleText(scenarioCards[i]!, angle));
        return { label, body: `${scenarioCards[i]!.name} 그림을 떠올려 보세요. ${onTopic(ctx, line) ? line : "서두르지 말고 지금 할 수 있는 한 가지부터 해 보세요."}` };
      }),
    },
    messages: {
      heading: h.messages,
      items: ctx.relational ? ["요즘 어떻게 지내? 문득 생각나서", "나 요즘 ○○ 하면서 지내. 너는 어때?"] : [actionOf(first, ctx), actionOf(last, ctx)],
      hint: "말투는 평소 쓰던 대로 바꾸고, 부담 없는 크기로 시작해요.",
    },
    avoid: { heading: h.avoid, items: ["한 번에 결론을 내려는 조급함", "결과를 재촉하는 말", "모든 걸 혼자 떠안는 계획"] },
    alternatives: {
      heading: h.alternatives,
      body: `다르게 보면 '${first.kb.core.shadow}' 쪽일 수도 있어요. 그렇게 느껴진다면 서두르지 말고 한 걸음 물러서 보는 것도 이 배치에 맞는 선택이에요.`,
    },
    action: { heading: h.action, body: `${actionOf(first, ctx)} 작게 시작할수록 부담이 줄고, 해 본 뒤의 느낌이 다음 걸음을 알려 줘요.` },
    story: {
      title: `${keyword} 이야기`.slice(0, 20),
      body: [
        `이번 장은 ${ctx.cards.map((c) => `${factsOf(c.kb)[0]!.ko}는 장면`).join("에서, 그리고 ")}으로 이어져요.`,
        ...ctx.cards.map((c) => `${topic(c.name)} '${c.kb.core.oneLine[c.orientation]}' 쪽을 비춰요.`),
        ctx.note ? `당신은 '${ctx.note}'라고 적었죠.` : "",
        "어느 쪽으로 걸음을 옮길지는 당신이 정해요.",
      ].filter(Boolean).join(" "),
    },
    followUps: ["이 흐름에서 먼저 해 볼 일은 뭘까요?", "막힐 때는 어떻게 하면 좋을까요?"],
  };
}

const ELEMENT_COLOR: Record<string, string> = { fire: "빨간색", water: "파란색", air: "노란색", earth: "초록색" };

export function mockDaily(ctx: TarotContext): DailyDraft {
  const card = ctx.cards[0]!;
  const { kb, orientation } = card;
  const keyword = kb.keywordsKo[0] ?? card.name;
  const summary = `오늘은 ${keyword} 쪽으로 걸어 봐요.`;
  const facts = factsOf(kb);
  const area = (angle: TopicAngle, fallback: string) => {
    const line = firstSentence(kb.topics[angle][orientation]);
    return line.replace(/\s/g, "").length <= 60 ? line : fallback;
  };
  return {
    keyword,
    summary: summary.replace(/\s/g, "").length <= 30 ? summary : "오늘은 작은 한 걸음이면 충분해요.",
    body: [
      orientation === "reversed" ? "오늘의 카드는 역방향으로 나왔어요." : "",
      factSentence(facts[0]!.ko),
      facts[1] ? factSentence(facts[1].ko) : "",
      kb.positionHints["오늘의 한 장"]?.[orientation] ?? kb.core.oneLine[orientation],
      kb.topics.self[orientation],
      `오늘은 ${kb.keywordsKo.slice(0, 3).join(", ")} 같은 말을 마음 한쪽에 두고 하루를 보내 보세요.`,
      `한 줄로 정리하면 ${kb.core.oneLine[orientation]}로 읽어요.`,
      `작은 일부터 하나씩 해 보면, 저녁에는 오늘이 어떤 날이었는지 조금 더 또렷해질 거예요.`,
    ].filter(Boolean).join(" "),
    areas: {
      love: area("love", "마음을 한 번 더 표현해 보는 날이에요."),
      money: area("self", "지출을 한 번 점검해 보는 날이에요."),
      work: area("work", "할 일 하나를 끝까지 마쳐 보는 날이에요."),
    },
    color: ELEMENT_COLOR[kb.element] ?? "하얀색",
    tip: actionOf(card),
  };
}

export function mockTarotFollowUp(ctx: TarotContext): FollowUpAnswer {
  const first = ctx.cards[0]!;
  const fact = factsOf(first.kb)[0]!;
  return {
    kind: "clarify",
    answer: [
      `같은 카드로 이어서 보면, ${cardLabel(first)} 자리의 그림에서 다시 시작하는 게 좋아요.`,
      factSentence(fact.ko),
      `이 자리에서는 ${first.kb.core.oneLine[first.orientation]}로 읽었어요.`,
      "결론은 그대로 두고, 오늘 할 수 있는 크기로만 나눠서 해 보세요.",
      actionOf(first),
    ].join(" "),
  };
}
