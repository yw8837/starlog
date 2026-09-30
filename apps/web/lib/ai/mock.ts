import "server-only";
import type { KbCard, TopicAngle } from "@/lib/kb";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import type { SajuFactSet } from "./prompts/saju";
import { UNSURE_OPTIONS, WHEN_KO, cardLabel, onTopic, tarotHeadings, type TarotCardContext, type TarotContext } from "./prompts/tarot";
import type { GenerationTask, ReadingProvider } from "./provider";
import type { DailyDraft, FollowUpAnswer, SajuReading, SajuTeaserDraft, TarotReading, TarotTeaserDraft } from "./schemas";

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
  for (const chip of chipsFor(ctx, card.slot)) required.push(`'${chip}'${hasFinal(chip) ? "이라고" : "라고"} 골랐으니 이 그림을 그 상황에 비춰 보면 좋아요.`);
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

// ---- saju ----

const joinList = (items: string[]) => items.join(", ");
/** Particle by the Hangul before any "(漢字)" suffix: josa("병화(丙火)", "은", "는"). */
const bare = (word: string) => word.replace(/\([^)]*\)$/, "");
const josa = (word: string, withFinal: string, withoutFinal: string) => `${word}${hasFinal(bare(word)) ? withFinal : withoutFinal}`;
/** 로/으로 (ㄹ-final words take 로). */
const ro = (word: string) => {
  const code = bare(word).charCodeAt(bare(word).length - 1) - 0xac00;
  return `${word}${hasFinal(bare(word)) && code % 28 !== 8 ? "으로" : "로"}`;
};

export function mockSajuTeaser(f: SajuFactSet): SajuTeaserDraft {
  const dm = f.dayMaster;
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
      "맡은 일을 내 방식으로 정리해 온 편이라면 이 구조와 맞물리고, 정해진 틀을 따르는 쪽이 늘 편했다면 이 부분은 덜 맞는 풀이예요.",
      f.input.timeKnown ? "" : "태어난 시를 몰라 시주 없이 여섯 글자로 읽었어요.",
    ].filter(Boolean).join(" "),
  };
}

export function mockSajuReading(f: SajuFactSet): SajuReading {
  const dm = f.dayMaster;
  const day = f.pillars.find((p) => p.pillar.includes("일주"))!;
  const month = f.pillars.find((p) => p.pillar.includes("월주"))!;
  const others = f.pillars.filter((p) => p !== day);
  const counts = Object.entries(f.elements.counts).map(([e, n]) => `${e} ${n}`).join(", ");
  const relations = f.relations.length
    ? `원국 안에는 ${f.relations.map((r) => `${r.members.join("와 ")} 사이의 ${r.type}`).join(", ")} 관계가 있어요. 이 풀이에서는 사건의 신호로 읽지 않고, 관계가 있다는 사실만 적어 둬요.`
    : "원국 안에서 서로 묶이거나 부딪히는 지지 관계는 따로 보이지 않아요.";
  const luck = f.luck;
  const current = luck?.current;
  const luckText = current
    ? [
      `대운은 10년 단위로 바뀌는 흐름이고, 이 명식에서는 ${luck.direction}이에요. ${luck.start}.`,
      `지금은 ${current.from}부터 ${current.to}까지 이어지는 ${current.ko}(${current.gz}) 대운이에요.`,
      `천간은 ${current.stemTenGod}, 지지의 대표 글자는 ${josa(current.branchMainTenGod, "이에요", "예요")}. ${current.halves}.`,
      current.relationsToNatal.length ? `원국과는 ${current.relationsToNatal.map((r) => r.type).join(", ")} 관계가 있어요.` : "",
    ].join(" ")
    : luck
      ? `대운은 ${luck.direction}이고, ${luck.start}. 지금은 첫 대운이 시작되기 전의 시기로 읽어요.`
      : "태어난 시각에 따라 월주가 달라질 수 있어 대운은 계산하지 않았어요.";
  const annual = f.annual;
  const annualText = `${annual.year}년의 세운은 ${ro(`${annual.ko}(${annual.gz})`)}, 천간은 ${annual.stemTenGod}, 지지의 대표 글자는 ${josa(annual.branchMainTenGod, "이에요", "예요")}.${annual.relationsToNatal.length ? ` 원국과는 ${annual.relationsToNatal.map((r) => r.type).join(", ")} 관계가 생겨요.` : ""} 명리에서는 이런 접점을 움직임이 늘어나는 국면으로 읽어요.`;
  const experiment = "이번 주에 힘이 난 순간과 빠진 순간을 하나씩 적어 두면, 이 풀이가 내 하루에 어떻게 닿는지 스스로 가늠해 볼 수 있어요.";

  const bodies = [
    [
      "12운성은 일간의 기운이 각 지지에서 어느 단계에 있는지를 열두 단계로 나눠 보는 방법이에요.",
      `${f.pillars.map((p) => `${p.pillar}의 지지 ${p.branch.display}에서는 ${p.branch.twelveStage}`).join(", ")} 단계예요.`,
      f.season ? `태어난 달은 ${josa(f.season.text, "이라", "라")}, 계절이 일간에 힘을 얼마나 싣는지(월령)도 이 자리에서 봐요.` : "",
      "이 단계들을 묶어 강하다·약하다 라벨을 붙이는 방법은 유파마다 결과가 달라 여기서는 붙이지 않았어요.",
      "같은 글자라도 어느 자리에 놓였는지에 따라 쓰임이 달라진다고 보는 것이 명리의 기본 관점이에요.",
      experiment,
    ],
    [
      `${f.elements.basis}로 세면 ${counts}이에요.`,
      `가장 많은 기운은 ${joinList(f.elements.most)}개예요. 명리에서는 많은 기운을 먼저 꺼내 쓰기 쉬운 힘으로 읽어요.`,
      f.elements.missing.length ? `겉에 한 글자도 없는 기운도 있어요(${f.elements.missing.join("·")}). 부족하다기보다 의식해서 꺼내 써야 하는 힘에 가까워요.` : "다섯 기운이 모두 겉에 한 글자 이상 보여요.",
      f.elements.hiddenOnly.length ? `겉에는 없지만 지장간에 숨은 기운도 있어요: ${f.elements.hiddenOnly.join("; ")}.` : "",
      "많고 적음은 좋고 나쁨이 아니라, 어떤 힘을 먼저 꺼내 쓰기 쉬운지를 보여 주는 지도에 가까워요.",
      "시작하는 일과 마무리하는 일 가운데 어느 쪽에서 힘이 더 드는지 한 줄씩 적어 보면 이 지도가 내게 맞는지 확인할 수 있어요.",
    ],
    [
      "명리에서는 십성을 일간과 다른 글자 사이의 관계로 읽어요.",
      ...others.map((p) => `${p.pillar}의 천간 ${josa(p.stem.display, "은", "는")} ${josa(p.stem.tenGod, "이고", "고")}, 지지 ${p.branch.display}의 대표 글자는 ${josa(p.branch.mainTenGod, "이에요", "예요")}.`),
      "같은 십성이 여러 번 나오면 그 역할이 익숙한 편으로 읽어요.",
      "십성은 성격을 정해 두는 이름표가 아니라, 어떤 자리에서 어떤 힘을 쓰기 쉬운지를 보는 틀이에요.",
      "역할을 스스로 정해 움직일 때 속도가 붙었다면 이 구조와 맞물리고, 누가 정해 준 역할을 따를 때 가장 편했다면 이 부분은 덜 맞는 풀이예요.",
      "다음에 역할을 나눌 일이 생기면 내가 먼저 맡고 싶은 일을 한 줄 적어 보세요.",
    ],
    [
      `태어난 날의 지지 ${day.branch.display}의 십성은 ${josa(day.branch.mainTenGod, "이고", "고")}, 12운성으로는 ${day.branch.twelveStage} 자리예요.`,
      "명리에서는 일지를 나 자신과 가까운 관계의 자리로 봐요.",
      relations,
      "가까운 사람과 보낸 시간 뒤에 힘이 났다면 이 자리와 맞물리고, 혼자 있을 때만 힘이 돌아왔다면 이 부분은 덜 맞는 풀이예요.",
      "바쁜 주일수록 가까운 사람과 짧게라도 이야기 나눌 시간을 먼저 정해 보세요.",
      "작은 약속 하나를 지켜 본 뒤의 느낌을 적어 두면 이 자리가 내게 어떻게 닿는지 알 수 있어요.",
    ],
    [
      `태어난 달의 지지 ${month.branch.display}의 ${josa(month.branch.mainTenGod, "과", "와")} 일지의 ${josa(day.branch.mainTenGod, "을", "를")} 두 장면으로 확인해 볼 수 있어요.`,
      "첫째, 일하는 장면이에요. 서로 진도가 보이는 자리에서 오히려 속도가 붙었다면 이 구조와 맞물리고, 진도가 보이면 손이 느려졌다면 이 부분은 덜 맞아요.",
      "둘째, 쉬는 장면이에요. 내가 고른 한두 곳을 내 순서대로 돌 때 제대로 쉬었다고 느꼈다면 이 구조와 맞물리고, 누가 짜 준 일정이 가장 편했다면 이 부분은 덜 맞아요.",
      "이번 주에 두 장면 중 하나를 만나면 그날 저녁 힘이 났는지 빠졌는지 한 줄로 적어 두세요. 두세 번 쌓이면 이 절이 내게 맞는지 스스로 판정할 수 있어요.",
    ],
    [
      luckText,
      annualText,
      "대운과 세운은 방향을 보는 도구이지 특정한 일이 생긴다는 약속은 아니에요.",
      "같은 국면이라도 무엇에 힘을 쓰느냐에 따라 체감은 달라질 수 있어요.",
      "남은 올해 동안 새로 시작한 일과 마무리한 일을 한 줄씩 적어 두면, 이 국면이 내게 어떻게 닿는지 가늠해 볼 수 있어요.",
    ],
    [
      "계산 기준은 만세력마다 조금씩 다를 수 있어서, 이 풀이가 어떤 기준으로 읽었는지 먼저 밝혀 둘게요.",
      ...f.calculation.map((line) => `${line.replace(/[.。]$/, "")}.`),
      ...f.limits,
      "태어난 시각을 알게 되면 내 정보에서 고칠 수 있고, 이 풀이도 그때 다시 계산할 수 있어요.",
    ],
  ];
  return {
    sections: SAJU_PROLOGUE_SECTIONS.map((heading, i) => ({ heading, body: bodies[i]!.filter(Boolean).join(" ") })),
    story: {
      title: `프롤로그 · ${dm.image}`,
      body: [
        f.season ? `당신의 이야기는 ${f.season.text}에서 시작해요.` : "당신의 이야기는 한 글자의 빛에서 시작해요.",
        `그 한가운데에 ${josa(dm.image, "이", "가")} 있어요.`,
        `가장 많은 기운은 ${joinList(f.elements.most)}개, 그 곁에서 다른 기운들이 저마다 자리를 지켜요.`,
        "어떤 힘은 겉에 드러나 있고, 어떤 힘은 안쪽 깊은 곳에서 꺼내 주기를 기다려요.",
        "계절은 바뀌고, 흐름은 10년마다 새 옷을 갈아입어요. 그 사이에서 당신은 매일 작은 선택을 이어 가요.",
        "이 이야기의 다음 장들은 그 힘을 언제, 어떻게 꺼내 쓰는지에 관한 이야기가 될지도 몰라요.",
      ].join(" "),
    },
    followUps: ["지금 대운에서 해 볼 작은 실험은요?", "오행 지도를 일상에 어떻게 쓸까요?"],
  };
}

export function mockSajuFollowUp(f: SajuFactSet): FollowUpAnswer {
  const dm = f.dayMaster;
  return {
    kind: "clarify",
    answer: [
      `같은 명식으로 이어서 보면, 일간 ${josa(dm.display, "을", "를")} 먼저 떠올리는 게 좋아요.`,
      `명리에서는 이 글자를 ${dm.image}에 비유해요.`,
      `가장 많은 기운은 ${joinList(f.elements.most)}개라, 먼저 꺼내 쓰기 쉬운 힘도 그쪽으로 읽어요.`,
      "결론은 그대로 두고, 이번 주에 힘이 난 순간과 빠진 순간을 한 줄씩 적어 보면 이 풀이가 내게 맞는지 스스로 확인할 수 있어요.",
    ].join(" "),
  };
}
