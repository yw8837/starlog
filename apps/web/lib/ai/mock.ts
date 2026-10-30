import "server-only";
import type { SajuElement } from "@starlog/core";
import type { KbCard, TopicAngle } from "@/lib/kb";
import { SAJU_MAIN_SECTIONS, SAJU_PART_A_SECTIONS, SAJU_PART_B_SECTIONS } from "@/lib/sajuPrologue";
import { PLAIN_WORDS, glossOnce, glossText } from "./plainWords";
import { ELEMENT_WORD, ORDER, SAJU_OBSERVATION_HEADING, SINSAL_BASIS_LINE, ymKo, type SajuFactSet } from "./prompts/saju";
import { groupOf, type GroupName } from "./prompts/sajuTopics";
import { UNSURE_OPTIONS, WHEN_KO, cardLabel, letsGo, onTopic, tarotHeadings, type TarotCardContext, type TarotContext } from "./prompts/tarot";
import { GenerationError, type GenerationHooks, type GenerationTask, type ReadingProvider } from "./provider";
import { mergeSajuReading, sajuEnrichmentFallback } from "./sajuParts";
import type {
  DailyDraft, FollowUpAnswer, SajuEnrichment, SajuGlance, SajuReading, SajuReadingPartA, SajuReadingPartB, SajuTeaserDraft, TarotReading, TarotTeaserDraft,
} from "./schemas";
import { actionVerbs } from "./validate";

/**
 * Deterministic readings without a model, for tests, key-less local dev and e2e (STARLOG_AI=mock).
 * Built only from the drawn cards' KB entries, the template's positions and the user's own chips
 * and note, so a money question gets money-angle text, never the relationship sample.
 */

export const mockProvider: ReadingProvider = {
  name: "mock",
  async generate<T>(task: GenerationTask<T>, attempt: number, _feedback?: string[], hooks: GenerationHooks = {}) {
    if (hooks.signal?.aborted) throw new GenerationError("UPSTREAM", ["aborted"]);
    const data = task.schema.parse(task.mock(attempt));
    if (hooks.onText) {
      // Replays the JSON in chunks, like a stream, so progress events work without a model.
      const text = JSON.stringify(data);
      for (let end = 120; end < text.length; end += 120) hooks.onText(text.slice(0, end));
      hooks.onText(text);
    }
    return { data, usage: [] };
  },
};

// ---- Korean helpers ----

/** True when the last Hangul syllable has a final consonant (받침). */
export function hasFinal(word: string): boolean {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

/** A KB fact as one 해요체 sentence (two facts hold two sentences: "붓는다. 물줄기는 …" → "붓고, 물줄기는 …"). */
export const factSentence = (fact: string) => `${fact.replace(/(는)?다\.\s+/g, "고, ")}는 장면이 그려져 있어요.`;

/** The card's facts, most salient first. */
export const factsOf = (kb: KbCard) => [...kb.imagery.facts].sort((a, b) => a.salience - b.salience);

export const firstSentence = (text: string) => text.split(/(?<=[.?!])\s+/)[0] ?? text;

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


/** Card-section budget (chars without spaces): optional sentences stop once the section is full. */
const SECTION_BUDGET = 230;
const count = (text: string) => text.replace(/\s/g, "").length;

/** `avoid`: words the optional sentences must not carry (the teaser's inputs, quoted once across its two cards). */
export function cardBody(
  ctx: TarotContext, card: TarotCardContext, factIndex: number, withNote: boolean, extra: string[] = [], budget = SECTION_BUDGET, avoid: readonly string[] = [],
): string {
  const facts = factsOf(card.kb);
  const fact = facts[factIndex % facts.length]!;
  // the picture first, then 역방향 in the next sentence (reading-voice-2026-10 §2.7), never a lone "… 역방향으로 나왔어요."
  const required: string[] = [factSentence(fact.ko)];
  if (card.reversedMode) required.push(`역방향으로 나와서 '${card.kb.reversedModes.gloss[card.reversedMode] ?? card.kb.core.oneLine.reversed}' 쪽으로 읽어요.`);
  for (const chip of chipsFor(ctx, card.slot)) required.push(`'${chip}'${hasFinal(chip) ? "이라고" : "라고"} 골랐으니 이 그림을 그 상황에 비춰 보면 좋아요.`);
  if (withNote && ctx.note) required.push(`메모에 '${ctx.note}'라고 적었죠.`);
  const optional = [
    card.kb.positionHints[card.position]?.[card.orientation],
    angleText(card, ctx.angles[0] ?? "self"),
    `${card.kb.core[card.orientation].join(", ")} 같은 결을 떠올려 보면 좋아요.`,
    ...extra,
    // The card's other image facts come last: a card whose KB text is mostly off this topic (8 of
    // Wands' 연락·소식 on a health reading) still reaches the section length with what it shows.
    ...facts.filter((f) => f !== fact).map((f) => factSentence(f.ko)),
  ].filter((s): s is string => Boolean(s) && onTopic(ctx, s!) && !avoid.some((word) => s!.includes(word)));
  const parts = [...required];
  for (const sentence of optional) {
    if (count(parts.join("")) + count(sentence) <= budget) parts.splice(parts.length - (withNote && ctx.note ? 1 : 0), 0, sentence);
  }
  return parts.join(" ");
}

/** Writing-down suggestions are allowed once per reading; the mock avoids them in action fields. */
const WRITES = /적어|적고|써\s?(보|두)|기록|메모/;
export const FALLBACK_ACTIONS = [
  "지금 할 수 있는 일 하나를 골라 20분만 해 보세요.",
  "도움을 줄 만한 사람 한 명에게 먼저 물어보세요.",
  "필요한 정보를 한 가지만 찾아보세요.",
];

/** The card's action hints that fit the orientation and topic, without writing-down tasks. */
export function actionsOf(card: TarotCardContext, ctx?: TarotContext): string[] {
  return card.kb.actionHints
    .filter((a) => (a.orientation === card.orientation || a.orientation === "both") && (!ctx || onTopic(ctx, a.ko)) && !WRITES.test(a.ko))
    .map((a) => a.ko);
}

/** The first `n` candidates whose action verbs do not overlap. */
export function distinctActions(candidates: string[], n: number): string[] {
  const picked: string[] = [];
  const used = new Set<string>();
  for (const candidate of candidates) {
    const verbs = actionVerbs(candidate);
    if (verbs.some((v) => used.has(v))) continue;
    verbs.forEach((v) => used.add(v));
    picked.push(candidate);
    if (picked.length === n) break;
  }
  return picked;
}

function actionOf(card: TarotCardContext, ctx?: TarotContext, index = 0): string {
  return actionsOf(card, ctx)[index] ?? FALLBACK_ACTIONS[(card.slot + index) % FALLBACK_ACTIONS.length]!;
}

// ---- tarot ----

export function mockTarotTeaser(ctx: TarotContext): TarotTeaserDraft {
  // the first card with the note, the second (감질맛) with its own chips: no input is quoted twice, nor echoed by KB text
  const inputs = [...chips(ctx), ...(ctx.note ? [ctx.note] : [])];
  // `shown`: text the teaser already shows whole (the first card), which the second card's ending must not repeat
  const section = (card: TarotCardContext, withNote: boolean, shown = "") => {
    const extra = [`내 상황에 비춰 보면 ${card.kb.core.oneLine[card.orientation]}로 읽어요.`, `${card.kb.keywordsKo.join(", ")} 같은 말을 오늘 하루 곁에 두면 좋아요.`];
    const body = cardBody(ctx, card, 0, withNote, extra, 300, inputs);
    // today's action, never one whose ending the body or the first card already said (other KB text may word it nearly
    // alike, and two cards may fall back to the same action): the cut 감질맛 must not show the end
    const action = [...actionsOf(card, ctx), ...FALLBACK_ACTIONS].find((a) => !body.includes(a.slice(-20)) && !shown.includes(a.slice(-20))) ?? actionOf(card, ctx);
    return { heading: cardLabel(card), body: `${body} 오늘은 ${action}` };
  };
  const [first, second] = ctx.cards;
  const firstCard = section(first!, true);
  return {
    cards: ctx.cards.map((c) => ({ position: c.position, cardId: c.cardId, keyword: c.kb.keywordsKo[0] ?? c.name })),
    firstCard,
    ...(second ? { secondCard: section(second, false, firstCard.body) } : {}),
  };
}

/** `written`: the leading cards the teaser already wrote (감질맛); their bodies are left empty for code to fill. */
export function mockTarotReading(ctx: TarotContext, written = 0): TarotReading {
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
    // 260–360자 a card section since owner 2026-10-30 ("제대로된 분량")
    body: card.slot < written ? "" : cardBody(ctx, card, 1, card.slot === 0, [`내 상황에 비춰 보면 ${card.kb.core.oneLine[card.orientation]}라는 뜻이에요.`], 330),
  }));

  const letGo = letsGo(ctx);
  const labels = letGo ? ["자꾸 떠오르면", "덤덤해지면", "소식을 들으면"] : ctx.relational ? ["답이 빨리 오면", "답이 늦게 오면", "답이 없으면"] : ["흐름이 좋아지면", "그대로 머물면", "잠시 막히면"];
  const scenarioCards = [first, ctx.cards[1] ?? first, last];
  // Three different moves, so the action fields never repeat one verb.
  const moves = distinctActions([...actionsOf(first, ctx), ...actionsOf(last, ctx), ...FALLBACK_ACTIONS], 3);
  return {
    verdict: `지금은 '${keyword}' 쪽으로 작게 움직여 보는 편이 좋아요.`,
    cards,
    connection: {
      heading: h.connection,
      body: `차례로 보면 ${ctx.cards.map((c) => `${c.name}(${c.kb.core.oneLine[c.orientation]})`).join(", 그다음 ")}로 이어져요. 세 흐름이 한 방향을 가리키는지, 어디서 갈라지는지가 이 상황의 핵심이에요. ${first.name}에서 시작한 마음이 ${last.name}의 흐름에 닿는 동안 무엇을 먼저 하고 무엇을 미룰지 정해 두면 덜 흔들려요. 한 번에 다 바꾸기보다 한 가지씩 확인해 보세요.`,
    },
    timing: { heading: h.timing, body: `${when} 안에서는 ${first.name} 그림처럼 준비가 됐다고 느끼는 날에 움직이는 편이 자연스러워요. 서두르지 않아도 흐름은 이어져요. 앞쪽에는 상황을 살피고, 마음이 정리된 날 작은 일 하나를 실제로 해 보세요. 그날의 느낌이 다음 걸음의 기준이 되죠.` },
    observation: {
      heading: h.observation,
      body: `며칠 안에 ${first.name} 그림의 '${keyword}' 같은 순간이 언제 오는지 눈여겨보세요. 그 순간이 먼저 온다면 이 풀이의 방향이 맞은 거예요. 비슷한 순간이 두세 번 이어진다면 흐름이 계속되고 있다는 뜻이고요.`,
    },
    scenarios: {
      heading: h.scenarios,
      items: labels.map((label, i) => {
        const line = firstSentence(angleText(scenarioCards[i]!, angle));
        // a picture simile ("…처럼") in one branch at most (§2.5)
        const usable = onTopic(ctx, line) && (i === 0 || !line.includes("처럼"));
        return { label, body: `${scenarioCards[i]!.name} 그림이 이 갈래의 기준이 돼요. ${usable ? line : "서두르지 않고 지금 할 수 있는 한 가지부터 하는 흐름이에요."}` };
      }),
    },
    messages: {
      heading: h.messages,
      // words for oneself when the user chose to let go (letsGo), never a message to send
      items: letGo
        ? ["오늘은 내 하루를 먼저 챙겨도 괜찮아요.", "천천히 정리해도 늦지 않아요."]
        : ctx.relational ? ["요즘 어떻게 지내? 문득 생각나서", "나 요즘 ○○ 하면서 지내. 너는 어때?"] : [moves[0]!, moves[1]!],
      hint: letGo ? "마음이 흔들리는 날 이 말을 먼저 떠올려요." : "말투는 평소 쓰던 대로 바꾸고, 부담 없는 크기로 시작해요.",
    },
    avoid: { heading: h.avoid, items: ["한 번에 결론을 내려는 조급함", "결과를 재촉하는 말", "모든 걸 혼자 떠안는 계획"] },
    alternatives: {
      heading: h.alternatives,
      body: `다르게 보면 '${first.kb.core.shadow}' 쪽일 수도 있어요. 그렇게 느껴진다면 서두르지 말고 한 걸음 물러서 보는 것도 이 배치에 맞는 선택이에요. 마음이 급해질수록 이런 면이 커지기 쉬우니 결정을 하루만 미뤄 두세요. 그러면 놓쳤던 선택지가 보이기도 해요.`,
    },
    action: { heading: h.action, body: `${moves[2]} 작게 시작할수록 부담이 줄고, 해 본 뒤의 느낌이 다음 걸음을 알려 줘요. 오늘은 그 일을 십 분이면 끝낼 만큼 작게 쪼개 보세요. 끝낸 뒤 어땠는지 떠올리면 다음 한 걸음이 한결 가벼워져요.` },
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
      factSentence(facts[0]!.ko),
      // 역방향 in the sentence after the picture (reading-voice-2026-10 §2.7)
      orientation === "reversed" ? "역방향으로 나와서 오늘은 이 그림의 뜻을 안쪽에서 한 번 더 살펴봐요." : "",
      facts[1] ? factSentence(facts[1].ko) : "",
      kb.positionHints["오늘의 한 장"]?.[orientation] ?? kb.core.oneLine[orientation],
      kb.topics.self[orientation],
      `오늘은 ${kb.keywordsKo.slice(0, 3).join(", ")} 같은 말을 마음 한쪽에 두고 하루를 보내 보세요.`,
      `오늘 하루에 비춰 보면 ${kb.core.oneLine[orientation]}로 읽어요.`,
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

/** "너 무슨 AI야?", "모델 뭐야?", "누가 만들었어?": answered as the prompt's blinding rule says. */
const IDENTITY_QUESTION = /\bai\b|에이아이|인공지능|모델|챗봇|누가 만들|무엇으로 만들|뭘로 만들/i;
const IDENTITY_ANSWER = "저는 스타로그의 풀이 도우미예요. 어떤 기술로 만들었는지는 알려 드리지 않아요.";

export function mockTarotFollowUp(ctx: TarotContext, question = ""): FollowUpAnswer {
  const first = ctx.cards[0]!;
  const fact = factsOf(first.kb)[0]!;
  const identity = IDENTITY_QUESTION.test(question);
  return {
    kind: identity ? "out_of_scope" : "clarify",
    answer: [
      ...(identity ? [IDENTITY_ANSWER] : []),
      `같은 카드로 이어서 보면, ${cardLabel(first)} 자리의 그림에서 다시 시작하는 게 좋아요.`,
      // KB lines that stray off this topic (8 of Wands' 연락 on a money reading) are left out.
      ...[factSentence(fact.ko), `이 자리에서는 ${first.kb.core.oneLine[first.orientation]}로 읽었어요.`].filter((sentence) => onTopic(ctx, sentence)),
      "결론은 그대로 두고, 오늘 할 수 있는 크기로만 나눠서 해 보세요.",
      actionOf(first, ctx),
    ].join(" "),
  };
}

// ---- saju ----

export const joinList = (items: string[]) => items.join(", ");
/** Particle by the Hangul before any "(漢字)" suffix: josa("병화(丙火)", "은", "는"). */
const bare = (word: string) => word.replace(/\([^)]*\)$/, "");
export const josa = (word: string, withFinal: string, withoutFinal: string) => `${word}${hasFinal(bare(word)) ? withFinal : withoutFinal}`;
/** 로/으로 (ㄹ-final words take 로). */
export const ro = (word: string) => {
  const code = bare(word).charCodeAt(bare(word).length - 1) - 0xac00;
  return `${word}${hasFinal(bare(word)) && code % 28 !== 8 ? "으로" : "로"}`;
};

/** One sentence that shows the user's own context was heard (each item quoted once). */
function profileSentence(f: SajuFactSet): string {
  const p = f.profile;
  if (!p) return "";
  const states = [p.workStatus, p.loveStatus].filter((v) => v && v !== "잘 모르겠어요");
  const parts = [
    states.length ? `지금은 ${josa(states.join(", "), "이라고", "라고")} 알려 줬죠.` : "",
    p.concern ? `'${p.concern}'라는 고민도 이 흐름 안에서 함께 읽었어요.` : "",
    // dating, engaged or married: the reading covers 결혼 as a way of living together, never its timing
    p.loveStatus && ["연애 중", "결혼 준비 중", "기혼"].includes(p.loveStatus)
      ? "결혼을 생각할 때도 이 사주는 함께 사는 생활의 크고 작은 결정을 둘이 나눠 정하는 쪽으로 읽어요."
      : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export function mockSajuTeaser(f: SajuFactSet): SajuTeaserDraft {
  const dm = f.dayMaster;
  const day = f.pillars.find((p) => p.pillar.includes("일주"))!;
  const month = f.pillars.find((p) => p.pillar.includes("월주"))!;
  const counts = Object.entries(f.elements.counts).map(([e, n]) => `${e} ${n}`).join(", ");
  return {
    title: dm.image,
    summary: [
      `일간은 ${dm.display}, 명리에서는 ${dm.image}에 비유하는 글자예요.`,
      f.season ? `${f.season.text}에 태어났어요.` : "",
      `${f.elements.basis}로 세면 ${counts}이고, 가장 많은 기운은 ${joinList(f.elements.most)}개예요.`,
      f.elements.missing.length ? `겉에 한 글자도 없는 기운도 있어요(${f.elements.missing.join("·")}).` : "",
      `태어난 달의 지지는 ${month.branch.display}, 십성으로는 ${month.branch.mainTenGod} 자리예요.`,
      // Always there, so a chart with no missing element and no user context still reaches the length.
      `태어난 날의 지지 ${day.branch.display}의 십성은 ${josa(day.branch.mainTenGod, "이고", "고")}, 12운성으로는 ${day.branch.twelveStage} 자리예요.`,
      // the scene question confirms it (reading-voice-2026-10: no "이 구조와 맞물리고 … 덜 맞는 풀이예요")
      "맡은 일을 누가 정해 주기 전에 내 방식으로 먼저 정리해 두는 편 아닌가요? 그렇다면 이 사주의 바탕이 그대로 드러난 거예요.",
      profileSentence(f),
      f.input.timeKnown ? "" : "태어난 시를 몰라 시주 없이 여섯 글자로 읽었어요.",
    ].filter(Boolean).join(" "),
  };
}

/**
 * What each 오행 makes easy, the habit its absence shows (its core in bold), and one everyday act that makes up for it (the
 * mock's plain reading of 오행).
 */
export const ELEMENT_PLAIN: Record<SajuElement, { ease: string; care: string; remedy: string }> = {
  목: { ease: "새로 시작하고 키워 가는 일", care: "새로 시작하는 일을 **자꾸 뒤로 미루기**", remedy: "미뤄 둔 새 일 하나를 골라 첫 단계만 시작해 보세요." },
  화: { ease: "드러내고 알리는 일", care: "해 둔 일을 **드러내 알리는 데 머뭇거리기**", remedy: "해 둔 일 하나를 가까운 사람에게 먼저 보여 주세요." },
  토: { ease: "버티며 사이를 잇는 일", care: "쉬지 않고 버티다 **한꺼번에 지치기**", remedy: "하루 일정에 아무것도 넣지 않는 빈칸을 먼저 만들어 두세요." },
  금: { ease: "정리하고 마무리하는 일", care: "정리하고 마무리하는 일을 **뒤로 미루기**", remedy: "하루를 마칠 때 끝낸 일 하나를 골라 깔끔히 닫아 두세요." },
  수: { ease: "생각하고 알아보는 일", care: "따져 볼 시간 없이 **서둘러 정하기**", remedy: "큰 결정은 하룻밤 묵힌 뒤 한 번 더 알아보고 정해 보세요." },
};

/** What this year's ten god brings more of, the mind it brings, and one thing to do with it. */
const YEAR_PLAIN: Record<GroupName, { scene: string; mind: string; action: string }> = {
  비겁: { scene: "사람과 어울리며 함께하는 일", mind: "맡을 몫부터 나누고 싶어져요", action: "함께할 사람과 맡을 몫부터 나눠 정해 보세요." },
  식상: { scene: "만들고 드러내는 일", mind: "해 둔 것을 밖에 내보이고 싶어져요", action: "만들어 둔 것 하나를 밖에 내보여 보세요." },
  재성: { scene: "돈과 시간을 다루는 일", mind: "들고 나는 것을 챙기고 싶어져요", action: "들고 나는 돈과 시간을 한 번 점검해 보세요." },
  관성: { scene: "맡은 책임을 다지는 일", mind: "기준을 분명히 세우고 싶어져요", action: "맡은 일의 기준을 한 줄로 정해 두세요." },
  인성: { scene: "배우고 준비하는 일", mind: "새로 배울 거리를 찾고 싶어져요", action: "배우고 싶던 것 하나를 골라 신청해 보세요." },
};

/**
 * "올해 병오(丙午)년은 [그해의 일]이 늘어나는 해라 [마음]" (§2.6): this year's 세운 by its 간지, no "힘이 실려요". Before 입춘
 * that 세운 is still last year's: "입춘 전까지 이어지는 병오(丙午)년은 …".
 */
export function mockThisYear(f: Pick<SajuFactSet, "annual">, scene: string, mind: string): string {
  return `${f.annual.beforeIpchun ? "입춘 전까지 이어지는" : "올해"} ${f.annual.ko}(${f.annual.gz})년은 ${scene}이 늘어나는 해라 ${mind}.`;
}

/** 한눈에 보기 from the facts (§2.6): the most and the fewest 오행 with their core phrase in bold, this year's 세운. */
function mockGlance(f: SajuFactSet): SajuGlance {
  const counts = f.elements.counts;
  const max = Math.max(...ORDER.map((e) => counts[e]));
  const min = Math.min(...ORDER.map((e) => counts[e]));
  const top = ORDER.find((e) => counts[e] === max)!;
  const low = ORDER.find((e) => counts[e] === min)!;
  const year = YEAR_PLAIN[groupOf(f.annual.stemTenGod)];
  return {
    goesWell: `${ELEMENT_WORD[top]} 기운이 ${max}개로 가장 많아 **${ELEMENT_PLAIN[top].ease}을 맡을 때** 잘 풀려요.`,
    watchOut: `${ELEMENT_WORD[low]} 기운이 ${min === 0 ? "겉에 없어" : `${min}개로 가장 적어`}, ${ELEMENT_PLAIN[low].care} 쉬워요.`,
    remedy: ELEMENT_PLAIN[low].remedy,
    thisYear: mockThisYear(f, year.scene, year.mind),
    thisYearAction: year.action,
  };
}

/** The tendency near people a day branch's group gives (§2.1 (c), its core in bold). */
const CLOSE: Record<GroupName, string> = {
  비겁: "대등하게 나란히 서는 사이를 편하게 여기는",
  식상: "마음을 말과 행동으로 먼저 보여 주는",
  재성: "가까운 사람을 챙기고 살피는 데 마음을 쓰는",
  관성: "가까운 사이에도 약속과 선을 지키려는",
  인성: "기대고 기댈 수 있는 사이를 바라는",
};

/** A relation in plain words (§4.2 rule 10): one, as the scene needs it. */
const relationPlain = (type: string) => (/충/.test(type) ? "정면으로 맞서는" : /합/.test(type) ? "서로 묶이려는" : /형|파|해/.test(type) ? "엇갈리는" : "");

/** The main call's mock: sections 1–6 and 계산 기준 (SAJU_MAIN_SECTIONS), the card, the observation, the follow-ups. */
export function mockSajuMainReading(f: SajuFactSet): SajuReading {
  // The reading voice (owner 2026-10-08): each body section opens on a scene question, gives one plain reason, says the tendency
  // with its core in bold and ends on one everyday act, with one 명리 term at most, glossed where it first appears (the card first).
  const say = glossOnce();
  // 4–6절 are the second half's (owner 2026-10-16), written apart: it glosses its own first terms
  const sayB = glossOnce();
  const glance = mockGlance(f);
  const day = f.pillars.find((p) => p.pillar.includes("일주"))!;
  const month = f.pillars.find((p) => p.pillar.includes("월주"))!;
  const counts = f.elements.counts;
  const max = Math.max(...ORDER.map((e) => counts[e]));
  const top = ORDER.find((e) => counts[e] === max)!;
  const low = ORDER.find((e) => counts[e] === Math.min(...ORDER.map((x) => counts[x])))!;
  const missing = ORDER.filter((e) => counts[e] === 0).map((e) => ELEMENT_WORD[e]);
  const dm = f.dayMaster;
  const pull = month.stem.tenGod;
  const close = day.branch.mainTenGod;
  const dayRelation = f.relations.map((r) => (r.members.some((m) => m.includes("일지")) ? relationPlain(r.type) : "")).find(Boolean);
  const luck = f.luck;
  const current = luck?.current;
  const next = luck?.changeSoon ? (current ? luck.cycles.find((c) => c.from === current.to) : luck.cycles[0]) : undefined;
  const annual = f.annual;
  const year = `${annual.beforeIpchun ? "입춘 전까지 이어지는" : "올해"} ${annual.year}년의 ${annual.ko}(${annual.gz})`;

  // 4~8 sentences and 300~450자 a body section (§2.1), the second scene's and the advice's forms rotated (twice at most)
  const same = pull === close;
  const profile = profileSentence(f);
  const bodies = [
    [
      "하루를 보내고 나면 기운이 차오르는 날과 금세 바닥나는 날이 유난히 뚜렷하게 갈리지 않나요?",
      `사주로 보면 나를 뜻하는 글자는 ${dm.image}에 비유되고, ${f.season ? `${f.season.text}에 태어났어요` : "태어난 달은 태어난 시각에 따라 달라질 수 있어요"}.`,
      `그래서 ${ELEMENT_PLAIN[dm.element as SajuElement].ease}처럼 마음이 먼저 가는 일을 붙잡은 날에는 기운이 차오르고 그런 일이라면 누가 시키기 전에 **먼저 손이 가는** 편이에요.`,
      "할 일이 잔뜩 쌓여 있어도 마음 가는 일부터 먼저 집어 들고 나머지는 저녁까지 미뤄 두곤 해요.",
      "반대로 마음이 안 가는 일만 이어진 날은 해가 지기도 전에 기운이 바닥나고 괜히 하루를 통째로 놓친 것 같은 기분이 들죠.",
      "그 습관이 나쁜 건 아니에요.",
      "다만 오후에 기운이 빠지기 시작하면 **오늘 끝낼 일 하나만** 남기고 나머지는 내일 목록으로 넘겨 보세요.",
      "그렇게 하루 몫을 덜어 낸 날은 다음 날 아침이 한결 가볍게 시작되고 저녁까지 기운도 오래가요.",
    ],
    [
      `${josa(ELEMENT_PLAIN[top].ease, "이라면", "라면")} 누가 시키지 않아도 손이 먼저 가고 한번 붙잡으면 시간 가는 줄 모르고 매달리지 않나요?`,
      `사주에 ${ELEMENT_WORD[top]} 기운이 ${max}개로 가장 많아서 그 기운이 맡는 일 앞에서는 **누구보다 먼저 힘이 나는** 편이에요.`,
      missing.length
        ? `반대로 ${missing.join("·")} 기운은 겉에 한 글자도 없어서 ${ELEMENT_PLAIN[low].ease}처럼 그쪽 기운이 맡는 일은 일부러 마음먹어야 겨우 손에 잡혀요.`
        : `다섯 기운이 모두 겉에 보이지만 ${ELEMENT_WORD[low]} 기운이 가장 적어서 ${ELEMENT_PLAIN[low].ease}처럼 그쪽 기운이 맡는 일은 일부러 마음먹어야 손에 잡혀요.`,
      "마감이 코앞에 와서야 그쪽 일을 한꺼번에 몰아서 처리하고 끝나면 한동안 녹초가 되는 식이죠.",
      "많은 쪽 일만 붙들어도 당장은 나쁘지 않아요.",
      "다만 그 일이 한꺼번에 몰려 숨이 찰 때는 **덜 쓰는 쪽 일 하나**를 골라 일부러 먼저 끝내 보세요.",
      "작은 일 하나라도 먼저 닫아 두면 많은 쪽 일로 돌아갈 때 마음이 훨씬 가벼워지고 손도 다시 빨라져요.",
      "덜 쓰는 쪽 일은 크기를 작게 잘라 두면 마음먹기 전에 시작할 수 있을 만큼 가벼워져요.",
    ],
    [
      "중요한 결정을 앞두면 해 보고 싶은 마음과 조심하고 싶은 마음이 한꺼번에 올라와서 오래 붙들고 있게 될 때가 있지 않아요?",
      same
        ? `사주로 보면 바깥 무대를 뜻하는 태어난 달 자리와 나와 가장 가까운 자리에 같은 힘인 ${josa(say(pull), "이", "가")} 겹쳐 있어요.`
        : `사주로 보면 바깥 무대를 뜻하는 태어난 달 자리에는 ${josa(say(pull), "이", "가")} 있고 나와 가장 가까운 자리에는 그와 다른 쪽을 바라보는 힘이 함께 있어요.`,
      same
        ? "같은 힘이 안팎에서 한쪽으로 당기는 사주라 **한번 정한 방향을 오래 붙드는** 경향이 있어요."
        : "두 힘이 서로 다른 쪽을 당기는 사주라 **결정 앞에서 오래 저울질하는** 경향이 있어요.",
      same
        ? "한번 마음을 정하면 주변에서 다른 길을 권해도 처음 정한 쪽으로 끝까지 가 보곤 해요."
        : "하고 싶은 일은 분명한데 첫발을 떼기까지 계획만 몇 번씩 고쳐 보다가 좋은 때를 흘려보내곤 해요.",
      same
        ? "그래서 주변에서는 믿음직하다는 말과 고집스럽다는 말을 같이 듣기도 하고요."
        : "의견을 더 모을수록 마음이 정리되기보다 오히려 고를 이유만 늘어나는 날도 많고요.",
      same ? "꾸준한 건 분명한 장점이에요." : "신중한 건 분명한 장점이에요.",
      same
        ? "그래도 방향을 정하기 전에는 **반대쪽 의견 하나**를 일부러 찾아 들어 보세요."
        : "그래도 저울질이 길어질 때는 **딱 한 가지 기준**만 정하고 그 기준에 맞는 쪽을 골라 보세요.",
      same
        ? "반대쪽 이야기를 한 번 들어 두면 정한 길을 더 오래 덜 흔들리며 갈 수 있어요."
        : "기준이 하나뿐이면 고르는 시간이 짧아지고 고른 뒤에도 '그때 다른 쪽을 고를걸' 하는 마음이 덜 남아요.",
    ],
    [
      "가까운 사람과 오래 붙어 있다 보면 고마운 마음과 별개로 혼자만의 시간이 문득 그리워질 때가 있지 않아요?",
      `사주로 보면 나와 가장 가까운 자리에 ${josa(sayB(close), "이", "가")} 있어서 **${CLOSE[groupOf(close)]}** 편이에요.`,
      dayRelation
        ? `그 자리가 다른 자리와 ${dayRelation} 배치도 함께 있어서 가까운 사이일수록 마음이 이쪽저쪽으로 자주 오가요.`
        : "그래서 가까운 사이에서도 내 몫과 상대 몫을 조용히 나눠 두고 그 선이 지켜질 때 마음이 놓여요.",
      "가까운 사람이 먼저 손을 내밀면 반가우면서도 그 기대에 맞춰야 할 것 같아 부담이 함께 올라오기도 해요.",
      "약속을 잡을 때도 상대 일정부터 맞춰 보다가 정작 내가 쉬고 싶은 날은 뒤로 밀리기 일쑤예요.",
      "가까운 사람을 먼저 챙기는 마음은 그대로 둬도 괜찮아요.",
      "다만 바쁜 주일수록 가까운 사람과 **짧게라도 마주 앉는 시간**을 먼저 잡아 보세요.",
      "얼굴을 보고 나누는 짧은 이야기가 긴 메시지보다 마음을 더 빨리 풀어 줘요.",
    ],
    [
      `일할 때는 ${ELEMENT_PLAIN[top].ease}에서 유난히 속도가 나는데 막상 쉬는 날에도 비슷한 일을 하나쯤 꼭 벌여 두게 되죠?`,
      // the user's own context where it is (owner 2026-10-02), in place of two general lines
      profile,
      "많은 기운이 일과 쉼 양쪽에 같이 드러나는 사주라 **쉬는 날에도 손을 놓지 못하기** 쉬워요.",
      profile ? "" : "일하는 날에는 그 기운 덕분에 남보다 먼저 결과를 내놓고 다음 일까지 미리 챙겨 두는 편이고요.",
      "주말 아침에도 할 일 목록부터 다시 펼쳐 보고 쉬는 시간마저 계획표의 한 칸으로 채워 넣는 식이죠.",
      profile ? "" : "그러다 보면 한 주가 시작되기도 전에 이미 지친 채로 하루를 열고 정작 중요한 일 앞에서 기운이 모자라요.",
      "부지런한 습관 덕분에 일이 밀리지 않고 주변에서 믿고 맡기는 건 분명한 강점이에요.",
      "그래도 한 주에 하루쯤은 **아무 일정도 넣지 않은 칸**으로 통째로 비워 두세요.",
      "반대로 쉬는 날에는 아무것도 손대지 않고 푹 쉬는 편이라면 이 대목은 가볍게 넘겨도 돼요.",
    ],
    [
      "요즘 들어 해 오던 방식을 조금씩 바꿔 보고 싶다는 생각이 출근길이나 잠들기 전에 자주 들지 않나요?",
      current
        ? `사주로 보면 10년마다 바뀌는 큰 흐름(대운)에서 지금은 ${current.ko}(${current.gz}) 대운이 ${ymKo(current.to!)} 무렵까지 이어져요.`
        : luck
          ? "사주로 보면 10년마다 바뀌는 큰 흐름(대운) 가운데 첫 흐름이 아직 시작되기 전이에요."
          : "태어난 시각에 따라 태어난 달이 달라질 수 있어 10년마다 바뀌는 큰 흐름(대운)은 계산하지 않았어요.",
      current ? `그 흐름이 ${PLAIN_WORDS[current.stemTenGod]} 쪽이라서 **익숙한 방식을 손보고 싶어지기** 쉬워요.` : "",
      // a change within the year comes first (luck.changeSoon), in place of the second scene
      next?.from
        ? `${ymKo(next.from)} 무렵에는 다음 흐름인 ${next.ko}(${next.gz}) 대운으로 넘어가요.`
        : "예전 같으면 그냥 넘겼을 작은 불편도 이제는 직접 손을 대서 고쳐 보고 싶어지는 때가 잦아요.",
      `${josa(year, "은", "는")} ${YEAR_PLAIN[groupOf(annual.stemTenGod)].scene}이 늘기 쉬운 해예요.`,
      "새로 시작한 일과 끝맺어야 할 일이 비슷하게 늘어나서 한 해가 유난히 바쁘게 느껴질 수 있어요.",
      "해가 바뀌기 전에 **계속 가져갈 일 하나**를 정해 새 달력 맨 앞 장에 표시해 두세요.",
      "그렇게 골라 둔 하나가 다음 해의 첫 계획을 세울 때 든든한 출발점이 돼요.",
    ],
    [
      "계산 기준은 만세력마다 조금씩 다를 수 있어서, 이 풀이가 어떤 기준으로 읽었는지 먼저 밝혀 둘게요.",
      ...f.calculation.map((line) => glossText(`${line.replace(/[.。]$/, "")}.`, say)),
      SINSAL_BASIS_LINE,
      ...f.limits,
      // the disclaimers the body leaves out (§2.5): here, once
      "본문에서는 합·충 같은 관계를 사건으로 읽지 않았고, 실제로 묶이는지도 따지지 않았어요. 12운성의 단계도 좋고 나쁨이 아니라 기운의 세기를 가리키는 이름이에요.",
      "태어난 시각을 알게 되면 내 정보에서 고칠 수 있고, 이 풀이도 그때 다시 계산할 수 있어요.",
    ],
  ];
  // the schema's order (the model writes the card after the body it sums up); the chapter page shows the card first
  return {
    sections: SAJU_MAIN_SECTIONS.map((heading, i) => ({ heading, body: bodies[i]!.filter(Boolean).join(" ") })),
    observation: {
      heading: SAJU_OBSERVATION_HEADING,
      body: `앞으로 몇 주 동안 ${ELEMENT_PLAIN[top].ease}을 먼저 집어 드는 순간이 늘어나는지 눈여겨보세요. 그런 순간이 잦다면 가장 많은 ${ELEMENT_WORD[top]} 기운이 일상에서 먼저 쓰이고 있는 거예요.`,
    },
    glance,
    followUps: ["지금 대운에서 해 볼 작은 실험은요?", "많은 기운을 일상에 어떻게 쓸까요?"],
  };
}

/** The main call's first half (owner 2026-10-16): the main mock's 1–3절 and 계산 기준, and its follow-up questions. */
export function mockSajuReadingPartA(f: SajuFactSet): SajuReadingPartA {
  const main = mockSajuMainReading(f);
  return { sections: SAJU_PART_A_SECTIONS.map((heading) => main.sections[SAJU_MAIN_SECTIONS.indexOf(heading)]!), followUps: main.followUps };
}

/** The second half: the main mock's 4–6절, its observation and its card. */
export function mockSajuReadingPartB(f: SajuFactSet): SajuReadingPartB {
  const main = mockSajuMainReading(f);
  return { sections: SAJU_PART_B_SECTIONS.map((heading) => main.sections[SAJU_MAIN_SECTIONS.indexOf(heading)]!), observation: main.observation, glance: main.glance };
}

/** 7절·8절's mock: the code-built text the reading falls back to (sajuParts.ts). */
export const mockSajuEnrichment = (f: SajuFactSet): SajuEnrichment => sajuEnrichmentFallback(f);

/** A whole 정통 reading as the route returns it: the two calls' mocks merged. */
export function mockSajuReading(f: SajuFactSet): SajuReading {
  return mergeSajuReading(mockSajuMainReading(f), mockSajuEnrichment(f));
}

export function mockSajuFollowUp(f: SajuFactSet, question = ""): FollowUpAnswer {
  const dm = f.dayMaster;
  const identity = IDENTITY_QUESTION.test(question);
  return {
    kind: identity ? "out_of_scope" : "clarify",
    answer: [
      ...(identity ? [IDENTITY_ANSWER] : []),
      `같은 명식으로 이어서 보면, 일간 ${josa(dm.display, "을", "를")} 먼저 떠올리는 게 좋아요.`,
      `명리에서는 이 글자를 ${dm.image}에 비유해요.`,
      `가장 많은 기운은 ${joinList(f.elements.most)}개라, 먼저 꺼내 쓰기 쉬운 힘도 그쪽으로 읽어요.`,
      "결론은 그대로 두고, 이번 주에 힘이 난 순간과 빠진 순간을 떠올려 보면 이 풀이가 내게 맞는지 스스로 확인할 수 있어요.",
    ].join(" "),
  };
}
