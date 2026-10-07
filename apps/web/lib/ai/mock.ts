import "server-only";
import type { SajuElement } from "@starlog/core";
import type { KbCard, TopicAngle } from "@/lib/kb";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { glossOnce, glossText } from "./plainWords";
import { ELEMENT_HANJA, ELEMENT_WORD, ORDER, SAJU_OBSERVATION_HEADING, type SajuFactSet } from "./prompts/saju";
import { groupOf, type GroupName } from "./prompts/sajuTopics";
import { UNSURE_OPTIONS, WHEN_KO, cardLabel, onTopic, tarotHeadings, type TarotCardContext, type TarotContext } from "./prompts/tarot";
import { GenerationError, type GenerationHooks, type GenerationTask, type ReadingProvider } from "./provider";
import type { DailyDraft, FollowUpAnswer, SajuGlance, SajuReading, SajuTeaserDraft, TarotReading, TarotTeaserDraft } from "./schemas";
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

/** "은둔자는", "별은": topic particle chosen by the last syllable (digits read as-is: 컵 2 → 는). */
export const topic = (word: string) => `${word}${hasFinal(word) ? "은" : "는"}`;

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

export function cardBody(ctx: TarotContext, card: TarotCardContext, factIndex: number, withNote: boolean, extra: string[] = [], budget = SECTION_BUDGET): string {
  const facts = factsOf(card.kb);
  const fact = facts[factIndex % facts.length]!;
  const required: string[] = [];
  if (card.orientation === "reversed") required.push(`'${card.position}' 자리의 카드는 역방향으로 나왔어요.`);
  required.push(factSentence(fact.ko));
  if (card.reversedMode) required.push(`역방향이라 '${card.kb.reversedModes.gloss[card.reversedMode] ?? card.kb.core.oneLine.reversed}' 쪽으로 읽어요.`);
  for (const chip of chipsFor(ctx, card.slot)) required.push(`'${chip}'${hasFinal(chip) ? "이라고" : "라고"} 골랐으니 이 그림을 그 상황에 비춰 보면 좋아요.`);
  if (withNote && ctx.note) required.push(`메모에 '${ctx.note}'라고 적었죠.`);
  const optional = [
    card.kb.positionHints[card.position]?.[card.orientation],
    angleText(card, ctx.angles[0] ?? "self"),
    `이 자리에서는 ${card.kb.core[card.orientation].join(", ")} 같은 결을 떠올려 보면 좋아요.`,
    ...extra,
    // The card's other image facts come last: a card whose KB text is mostly off this topic (8 of
    // Wands' 연락·소식 on a health reading) still reaches the section length with what it shows.
    ...facts.filter((f) => f !== fact).map((f) => factSentence(f.ko)),
  ].filter((s): s is string => Boolean(s) && onTopic(ctx, s!));
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
  // Three different moves, so the action fields never repeat one verb.
  const moves = distinctActions([...actionsOf(first, ctx), ...actionsOf(last, ctx), ...FALLBACK_ACTIONS], 3);
  return {
    verdict: `지금은 '${keyword}' 쪽으로 작게 움직여 보는 편이 좋아요.`,
    cards,
    connection: {
      heading: h.connection,
      body: `차례로 보면 ${ctx.cards.map((c) => `${c.name}(${c.kb.core.oneLine[c.orientation]})`).join(", 그다음 ")}로 이어져요. 세 흐름이 한 방향을 가리키는지, 어디서 갈라지는지가 이 상황의 핵심이에요.`,
    },
    timing: { heading: h.timing, body: `${when} 안에서는 ${first.name} 그림처럼 준비가 됐다고 느끼는 날에 움직이는 편이 자연스러워요. 서두르지 않아도 흐름은 이어져요.` },
    observation: {
      heading: h.observation,
      body: `며칠 안에 ${first.name} 그림의 '${keyword}' 같은 순간이 언제 오는지 눈여겨보세요. 그 순간이 먼저 온다면 이 풀이의 방향이 맞은 거예요.`,
    },
    scenarios: {
      heading: h.scenarios,
      items: labels.map((label, i) => {
        const line = firstSentence(angleText(scenarioCards[i]!, angle));
        return { label, body: `${scenarioCards[i]!.name} 그림이 이 갈래의 기준이 돼요. ${onTopic(ctx, line) ? line : "서두르지 않고 지금 할 수 있는 한 가지부터 하는 흐름이에요."}` };
      }),
    },
    messages: {
      heading: h.messages,
      items: ctx.relational ? ["요즘 어떻게 지내? 문득 생각나서", "나 요즘 ○○ 하면서 지내. 너는 어때?"] : [moves[0]!, moves[1]!],
      hint: "말투는 평소 쓰던 대로 바꾸고, 부담 없는 크기로 시작해요.",
    },
    avoid: { heading: h.avoid, items: ["한 번에 결론을 내려는 조급함", "결과를 재촉하는 말", "모든 걸 혼자 떠안는 계획"] },
    alternatives: {
      heading: h.alternatives,
      body: `다르게 보면 '${first.kb.core.shadow}' 쪽일 수도 있어요. 그렇게 느껴진다면 서두르지 말고 한 걸음 물러서 보는 것도 이 배치에 맞는 선택이에요.`,
    },
    action: { heading: h.action, body: `${moves[2]} 작게 시작할수록 부담이 줄고, 해 본 뒤의 느낌이 다음 걸음을 알려 줘요.` },
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
    p.concern ? `'${p.concern}'라는 고민에는 이 명식의 두드러진 기운부터 차분히 비춰 볼게요.` : "",
    // dating, engaged or married: the reading covers 결혼 as a way of living together, never its timing
    p.loveStatus && ["연애 중", "결혼 준비 중", "기혼"].includes(p.loveStatus)
      ? "결혼을 생각할 때도 이 명식은 함께 사는 생활의 크고 작은 결정을 둘이 나눠 정하는 쪽으로 읽어요."
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
      "맡은 일을 내 방식으로 정리해 온 편이라면 이 구조와 맞물리고, 정해진 틀을 따르는 쪽이 늘 편했다면 이 부분은 덜 맞는 풀이예요.",
      profileSentence(f),
      f.input.timeKnown ? "" : "태어난 시를 몰라 시주 없이 여섯 글자로 읽었어요.",
    ].filter(Boolean).join(" "),
  };
}

/** What each 오행 makes easy, how its absence shows, and one everyday act that makes up for it (the mock's plain reading of 오행). */
const ELEMENT_PLAIN: Record<SajuElement, { ease: string; slip: string; remedy: string }> = {
  목: { ease: "새로 시작하고 키워 가는 일", slip: "새로 시작하는 일은 자꾸 미루기 쉬운 편이에요", remedy: "미뤄 둔 새 일 하나를 골라 첫 단계만 시작해 보세요." },
  화: { ease: "드러내고 알리는 일", slip: "해 둔 일을 드러내고 알리는 데는 머뭇거리기 쉬운 편이에요", remedy: "해 둔 일 하나를 가까운 사람에게 먼저 보여 주세요." },
  토: { ease: "버티며 사이를 잇는 일", slip: "쉬지 않고 버티다 한꺼번에 지치기 쉬운 편이에요", remedy: "하루 일정에 아무것도 넣지 않는 빈칸을 먼저 만들어 두세요." },
  금: { ease: "정리하고 마무리하는 일", slip: "정리하고 마무리하는 일은 뒤로 밀리기 쉬운 편이에요", remedy: "하루를 마칠 때 끝낸 일 하나를 골라 깔끔히 닫아 두세요." },
  수: { ease: "생각하고 알아보는 일", slip: "멈춰서 따져 보는 시간 없이 서두르기 쉬운 편이에요", remedy: "큰 결정은 하룻밤 묵힌 뒤 한 번 더 알아보고 정해 보세요." },
};

/** Where this year's ten god puts weight, and one thing to do with it. */
const YEAR_PLAIN: Record<GroupName, { scene: string; action: string }> = {
  비겁: { scene: "사람과 어울리며 함께하는 일", action: "함께할 사람과 맡을 몫부터 나눠 정해 보세요." },
  식상: { scene: "만들고 드러내는 일", action: "만들어 둔 것 하나를 밖에 내보여 보세요." },
  재성: { scene: "돈과 시간을 다루는 일", action: "들고 나는 돈과 시간을 한 번 점검해 보세요." },
  관성: { scene: "맡은 책임을 다지는 일", action: "맡은 일의 기준을 한 줄로 정해 두세요." },
  인성: { scene: "배우고 준비하는 일", action: "배우고 싶던 것 하나를 골라 신청해 보세요." },
};

/**
 * "올해 병오(丙午)년에는 나와 어깨를 나란히 하는 힘(비견)이 실려, …": this year's 세운 by its 간지, its ten god in plain words.
 * Before 입춘 that 세운 is still last year's: "입춘 전까지 이어지는 병오(丙午)년에는 …".
 */
export function mockThisYear(f: Pick<SajuFactSet, "annual">, say: (term: string) => string, scene: string): string {
  const year = `${f.annual.beforeIpchun ? "입춘 전까지 이어지는" : "올해"} ${f.annual.ko}(${f.annual.gz})년에는`;
  return `${year} ${josa(say(f.annual.stemTenGod), "이", "가")} 실려, ${scene}에 힘이 붙는 해로 읽어요.`;
}

/** 한눈에 보기 from the facts: the most and the fewest 오행, this year's 세운 and its ten god. */
function mockGlance(f: SajuFactSet, say: (term: string) => string): SajuGlance {
  const counts = f.elements.counts;
  const max = Math.max(...ORDER.map((e) => counts[e]));
  const min = Math.min(...ORDER.map((e) => counts[e]));
  const top = ORDER.find((e) => counts[e] === max)!;
  const low = ORDER.find((e) => counts[e] === min)!;
  const name = (e: SajuElement) => `${ELEMENT_WORD[e]}(${ELEMENT_HANJA[e]}) 기운`;
  const year = YEAR_PLAIN[groupOf(f.annual.stemTenGod)];
  return {
    goesWell: `${josa(name(top), "이", "가")} ${max}개로 가장 많아, ${ELEMENT_PLAIN[top].ease}에서 잘 풀리는 편이에요.`,
    watchOut: `${josa(name(low), "이", "가")} ${min === 0 ? "겉에 없어" : `${min}개로 가장 적어`}, ${ELEMENT_PLAIN[low].slip}.`,
    remedy: ELEMENT_PLAIN[low].remedy,
    thisYear: mockThisYear(f, say, year.scene),
    thisYearAction: year.action,
  };
}

export function mockSajuReading(f: SajuFactSet): SajuReading {
  // Plain words first (owner 2026-10-07): each 명리 term in plain words the first time, in reading order (the card first).
  const say = glossOnce();
  const glance = mockGlance(f, say);
  const day = f.pillars.find((p) => p.pillar.includes("일주"))!;
  const month = f.pillars.find((p) => p.pillar.includes("월주"))!;
  const others = f.pillars.filter((p) => p !== day);
  const counts = ORDER.map((e) => `${ELEMENT_WORD[e]} ${f.elements.counts[e]}`).join(", ");
  const relations = f.relations.length
    ? `타고난 명식 안에는 ${f.relations.map((r) => `${r.members.join("와 ")} 사이의 ${r.type}`).join(", ")} 관계가 있어요. 이 풀이에서는 사건의 신호로 읽지 않고, 관계가 있다는 사실만 짚어 둬요.`
    : "타고난 명식 안에서 서로 묶이거나 부딪히는 아래 글자 관계는 따로 보이지 않아요.";
  const luck = f.luck;
  const current = luck?.current;
  const direction = luck?.direction === "순행" ? "앞으로 흐르는 순행" : "거꾸로 흐르는 역행";
  // texts that gloss are written where they stand in the reading (functions), so a term is glossed at its first appearance
  const luckText = () => current
    ? [
      `이 명식의 ${josa(say("대운"), "은", "는")} ${direction}이에요. ${luck.start}.`,
      `지금은 ${current.from}부터 ${current.to}까지 이어지는 ${current.ko}(${current.gz}) 대운이에요.`,
      `위 글자는 ${say(current.stemTenGod)}, 아래 글자의 대표 글자는 ${josa(say(current.branchMainTenGod), "이에요", "예요")}. ${glossText(current.halves, say)}.`,
      current.relationsToNatal.length ? `타고난 명식과는 ${current.relationsToNatal.map((r) => r.type).join(", ")} 관계가 있어요.` : "",
    ].join(" ")
    : luck
      ? `이 명식의 ${josa(say("대운"), "은", "는")} ${direction}이고, ${luck.start}. 지금은 첫 대운이 시작되기 전의 시기로 읽어요.`
      : `태어난 시각에 따라 월주가 달라질 수 있어 ${josa(say("대운"), "은", "는")} 계산하지 않았어요.`;
  const annual = f.annual;
  const annualText = () => `${annual.year}년 ${josa(say("세운"), "은", "는")} ${ro(`${annual.ko}(${annual.gz})`)}, 위 글자는 ${say(annual.stemTenGod)}, 아래 글자의 대표 글자는 ${josa(say(annual.branchMainTenGod), "이에요", "예요")}.${annual.relationsToNatal.length ? ` 타고난 명식과는 ${annual.relationsToNatal.map((r) => r.type).join(", ")} 관계가 생겨요.` : ""} 명리에서는 이런 접점을 움직임이 늘어나는 국면으로 읽어요.`;
  const experiment = "이번 주에 힘이 난 순간이 언제였는지 하루 끝에 떠올려 보면, 이 풀이가 내 하루에 어떻게 닿는지 가늠할 수 있어요.";

  const bodies = [
    [
      profileSentence(f),
      `${ro(say("12운성"))} 보면 ${say("일간")}의 기운이 자리마다 어느 단계에 있는지 알 수 있어요.`,
      `${f.pillars.map((p) => `${p.pillar}의 아래 글자 ${josa(p.branch.display, "은", "는")} ${say(p.branch.twelveStage)}`).join(", ")}에 있어요.`,
      f.season ? `태어난 달은 ${josa(f.season.text, "이라", "라")}, 그 계절이 나에게 힘을 얼마나 실어 주는지(월령)도 이 자리에서 봐요.` : "",
      "이 단계들을 묶어 강하다·약하다 라벨을 붙이는 방법은 유파마다 결과가 달라 여기서는 붙이지 않았어요.",
      "같은 글자라도 어느 자리에 놓였는지에 따라 쓰임이 달라진다고 보는 것이 명리의 기본 관점이에요.",
      experiment,
    ],
    [
      `겉에 드러난 대표 글자로만 세고 ${josa(say("지장간"), "은", "는")} 빼면 ${counts}이에요.`,
      `가장 많은 기운은 ${joinList(f.elements.most)}개예요. 명리에서는 많은 기운을 먼저 꺼내 쓰기 쉬운 힘으로 읽어요.`,
      f.elements.missing.length ? `겉에 한 글자도 없는 기운도 있어요(${f.elements.missing.join("·")}). 부족하다기보다 의식해서 꺼내 써야 하는 힘에 가까워요.` : "다섯 기운이 모두 겉에 한 글자 이상 보여요.",
      f.elements.hiddenOnly.length ? glossText(`겉에는 없지만 ${say("지장간")}에 숨은 기운도 있어요: ${f.elements.hiddenOnly.join("; ")}.`, say) : "",
      "많고 적음은 좋고 나쁨이 아니라, 어떤 힘을 먼저 꺼내 쓰기 쉬운지를 보여 주는 지도에 가까워요.",
      "시작하는 일과 마무리하는 일 가운데 어느 쪽에서 힘이 더 드는지 한 줄씩 적어 보면 이 지도가 내게 맞는지 확인할 수 있어요.",
    ],
    [
      `명리에서는 ${ro(say("십성"))} 내가 어떤 힘을 쓰기 쉬운지 읽어요.`,
      ...others.map((p) => `${p.pillar}의 위 글자 ${josa(p.stem.display, "은", "는")} ${josa(say(p.stem.tenGod), "이고", "고")}, 아래 글자 ${p.branch.display}의 대표 글자는 ${josa(say(p.branch.mainTenGod), "이에요", "예요")}.`),
      "같은 힘이 여러 번 나오면 그 역할이 익숙한 편으로 읽어요.",
      "이 이름들은 성격을 정해 두는 이름표가 아니라, 어떤 자리에서 어떤 힘을 쓰기 쉬운지를 보는 틀이에요.",
      "역할을 스스로 정해 움직일 때 속도가 붙었다면 이 구조와 맞물리고, 누가 정해 준 역할을 따를 때 가장 편했다면 이 부분은 덜 맞는 풀이예요.",
      "다음에 역할을 나눌 일이 생기면 내가 먼저 맡고 싶은 일을 말로 먼저 꺼내 보세요.",
    ],
    [
      `태어난 날의 아래 글자 ${day.branch.display}의 대표 글자는 ${josa(say(day.branch.mainTenGod), "이고", "고")}, 기운의 단계로는 ${say(day.branch.twelveStage)}에 있어요.`,
      "명리에서는 이 자리(일지)를 나 자신과 가까운 관계의 자리로 봐요.",
      relations,
      "가까운 사람과 보낸 시간 뒤에 힘이 났다면 이 자리와 맞물리고, 혼자 있을 때만 힘이 돌아왔다면 이 부분은 덜 맞는 풀이예요.",
      "바쁜 주일수록 가까운 사람과 짧게라도 이야기 나눌 시간을 먼저 정해 보세요.",
      "작은 약속 하나를 지켜 본 뒤의 느낌을 떠올려 보면 이 자리가 내게 어떻게 닿는지 알 수 있어요.",
    ],
    [
      `태어난 달의 아래 글자 ${month.branch.display}의 ${josa(say(month.branch.mainTenGod), "과", "와")} 태어난 날 자리의 ${josa(say(day.branch.mainTenGod), "을", "를")} 두 장면으로 확인해 볼 수 있어요.`,
      "첫째, 일하는 장면이에요. 서로 진도가 보이는 자리에서 오히려 속도가 붙었다면 이 구조와 맞물리고, 진도가 보이면 손이 느려졌다면 이 부분은 덜 맞아요.",
      "둘째, 쉬는 장면이에요. 내가 고른 한두 곳을 내 순서대로 돌 때 제대로 쉬었다고 느꼈다면 이 구조와 맞물리고, 누가 짜 준 일정이 가장 편했다면 이 부분은 덜 맞아요.",
      "이번 주에 두 장면 중 하나를 만나면 그날 저녁 힘이 났는지 빠졌는지 스스로에게 물어보세요. 두세 번 쌓이면 이 이야기가 내게 맞는지 판정할 수 있어요.",
    ],
    [
      luckText(),
      annualText(),
      "대운과 세운은 방향을 보는 도구이지 특정한 일이 생긴다는 약속은 아니에요.",
      "같은 국면이라도 무엇에 힘을 쓰느냐에 따라 체감은 달라질 수 있어요.",
      "남은 올해 동안 새로 시작한 일과 마무리한 일이 무엇이었는지 달력에서 확인해 보면, 이 국면이 내게 어떻게 닿는지 가늠할 수 있어요.",
    ],
    [
      "계산 기준은 만세력마다 조금씩 다를 수 있어서, 이 풀이가 어떤 기준으로 읽었는지 먼저 밝혀 둘게요.",
      ...f.calculation.map((line) => glossText(`${line.replace(/[.。]$/, "")}.`, say)),
      ...f.limits,
      "태어난 시각을 알게 되면 내 정보에서 고칠 수 있고, 이 풀이도 그때 다시 계산할 수 있어요.",
    ],
  ];
  // the schema's order (the model writes the card after the body it sums up); the chapter page shows the card first
  return {
    sections: SAJU_PROLOGUE_SECTIONS.map((heading, i) => ({ heading, body: bodies[i]!.filter(Boolean).join(" ") })),
    observation: {
      heading: SAJU_OBSERVATION_HEADING,
      body: `앞으로 몇 주 동안 ${joinList(f.elements.most)}개로 가장 많은 기운이 일하는 방식에서 먼저 드러나는지 눈여겨보세요. 새 일을 먼저 집어 드는 순간이 잦다면 이 풀이의 방향과 맞아요.`,
    },
    glance,
    followUps: ["지금 대운에서 해 볼 작은 실험은요?", "많은 기운을 일상에 어떻게 쓸까요?"],
  };
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
