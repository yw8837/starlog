import "server-only";
import type { DeepPartA, DeepPartB, DeepTeaserDraft, MatchPartA, MatchPartB, MatchTeaserDraft } from "./premiumSchemas";
import { FALLBACK_ACTIONS, actionsOf, cardBody, distinctActions, factSentence, factsOf, hasFinal, josa } from "./mock";
import { previewKeyword } from "./prompts/deepTarot";
import type { MatchFacts } from "./prompts/match";
import type { Relation } from "./prompts/saju";
import { WHEN_KO, onTopic, type TarotContext } from "./prompts/tarot";

/**
 * Deterministic premium drafts for tests, key-less dev and e2e (STARLOG_AI=mock). Built from the
 * cards' KB and the computed facts only; every draft passes its validator (tests check 25+ draws).
 */

export const count = (text: string) => text.replace(/\s/g, "").length;

/** `base`, then pool sentences until at least `min` characters, never past `max`. */
export function fill(base: string[], pool: readonly string[], min: number, max: number): string {
  const parts = base.filter(Boolean);
  for (const sentence of pool) {
    if (count(parts.join(" ")) >= min) break;
    if (count(parts.join(" ")) + count(sentence) <= max) parts.push(sentence);
  }
  return parts.join(" ");
}

/** Neutral, on-topic-for-anything sentences with mixed endings (no relationship words, no dates). */
export const NEUTRAL_POOL: readonly string[] = [
  "서두르지 않고 지금 손에 잡히는 것부터 정리하면 흐름이 또렷해져요.",
  "한 번에 다 바꾸려 하기보다 한 가지씩 순서를 정하면 부담이 줄어요.",
  "작게 해 본 결과가 다음 선택의 기준이 되죠.",
  "지금 느끼는 망설임도 이 배치 안에서는 자연스러운 단계예요.",
  "확인할 수 있는 것부터 확인하면 마음이 한결 가벼워져요.",
  "이 구간에서는 속도보다 방향을 먼저 맞추는 편이 나아요.",
  "흐름이 바뀌는 지점은 대개 사소한 선택에서 시작되거든요.",
  "해 본 것과 해 보지 않은 것을 나눠 보면 다음 걸음이 보여요.",
  "무리하게 끝을 정하기보다 중간 점검을 한 번 두는 쪽이 맞아요.",
  "익숙한 방식 하나를 내려놓으면 새 방식이 들어올 자리가 생겨요.",
];

/** Short closers for the action and observation fields (no verbs that repeat an action, no dates). */
const ACTION_POOL: readonly string[] = [
  "작게 시작할수록 부담이 줄어요.",
  "끝낸 뒤의 느낌이 다음 걸음의 기준이 되죠.",
  "한 번에 다 하지 않아도 괜찮아요.",
];

const wa = (word: string) => `${word}${hasFinal(word) ? "과" : "와"}`;
const eun = (word: string) => `${word}${hasFinal(word) ? "은" : "는"}`;

export function mockDeepTeaser(ctx: TarotContext): DeepTeaserDraft {
  const first = ctx.cards[0]!;
  const move = actionsOf(first, ctx)[0] ?? FALLBACK_ACTIONS[0]!;
  return { now: { body: cardBody(ctx, first, 0, true, [`오늘은 이렇게 해 보세요. ${move}`], 390) } };
}

/** A card's one-line meaning, or an on-topic keyword when the line uses a word this topic bans. */
export function lineOf(ctx: TarotContext, i: number): string {
  const card = ctx.cards[i]!;
  const line = card.kb.core.oneLine[card.orientation];
  return onTopic(ctx, line) ? line : previewKeyword(card, ctx);
}

export function mockDeepPartA(ctx: TarotContext): DeepPartA {
  const keyword = previewKeyword(ctx.cards[0]!, ctx);
  return {
    verdict: `지금은 '${keyword}' 쪽으로 작게 움직여 보는 편이 좋아요.`,
    positions: ctx.cards.map((card) => ({
      position: card.position,
      cardId: card.cardId,
      body: cardBody(ctx, card, 1, card.slot === 0, [`이 자리에서는 ${lineOf(ctx, card.slot)} 쪽으로 읽어요.`], 335),
    })),
  };
}

export function mockDeepPartB(ctx: TarotContext): DeepPartB {
  const c = ctx.cards;
  const name = (i: number) => c[i]!.name;
  const line = (i: number) => lineOf(ctx, i);
  const fact = (i: number) => factSentence(factsOf(c[i]!.kb)[0]!.ko);
  const when = ctx.when ? WHEN_KO[ctx.when] : "고른 시기";
  const moves = distinctActions([...actionsOf(c[0]!, ctx), ...actionsOf(c[9]!, ctx), ...FALLBACK_ACTIONS], 2);
  return {
    crossing: {
      body: fill([
        `${wa(name(0))} ${name(1)}를 한 장면으로 놓고 봐요.`,
        `${name(0)} 쪽에는 ${fact(0)}`,
        `${name(1)} 쪽에는 ${fact(1)}`,
        `지금의 자리는 '${line(0)}' 쪽이고, 가로막는 자리는 '${line(1)}' 쪽이라 두 흐름이 같은 곳에서 맞물려요.`,
      ], NEUTRAL_POOL, 360, 450),
    },
    axes: {
      vertical: fill([`바탕의 ${eun(name(2))} '${line(2)}' 쪽이고, 바라는 자리의 ${eun(name(4))} '${line(4)}' 쪽이에요.`, `그 사이에 지금의 ${name(0)}가 놓여 있어요.`], NEUTRAL_POOL, 230, 300),
      horizontal: fill([`지나온 자리의 ${eun(name(3))} '${line(3)}' 쪽이었고, 다가올 자리의 ${eun(name(5))} '${line(5)}' 쪽으로 이어져요.`, `가운데의 ${name(0)}가 그 흐름의 다리예요.`], NEUTRAL_POOL, 230, 300),
    },
    staff: {
      body: fill([
        `아래에서부터 ${name(6)}, ${name(7)}, ${name(8)}, ${name(9)} 순서로 쌓아 읽어요.`,
        `나의 태도 자리는 '${line(6)}' 쪽이고, 주변 자리는 '${line(7)}' 쪽이에요.`,
        `바람과 걱정 자리는 '${line(8)}' 쪽이라, 결과의 방향 자리의 '${line(9)}'는 정해진 끝이 아니라 지금 흐름이 이어질 때의 방향이에요.`,
        "태도 자리의 결을 조금 바꾸면 결과의 방향도 함께 움직여요.",
      ], NEUTRAL_POOL, 390, 500),
    },
    timing: { body: fill([`${when} 안에서는 준비가 됐다고 느끼는 날에 움직이는 편이 자연스러워요.`], NEUTRAL_POOL, 160, 250) },
    action: { body: fill([moves[0] ?? FALLBACK_ACTIONS[1]!, `${name(0)} 그림을 떠올리며 시작하면 손이 덜 무거워요.`], ACTION_POOL, 85, 160) },
    observation: { body: fill([`며칠 안에 ${name(9)} 그림의 '${line(9)}' 같은 순간이 언제 오는지 눈여겨보세요.`], ["그 순간이 먼저 온다면 이 풀이의 방향이 맞은 거예요.", ...ACTION_POOL], 85, 180) },
    followUps: ["이 흐름에서 먼저 해 볼 일은 뭘까요?", "막힐 때는 어떻게 하면 좋을까요?"],
  };
}

// ---- 우리 사이 궁합 ----

/** Pair-neutral sentences: no glyphs, ten gods, years, romance words or verdicts. */
export const SAJU_PAIR_POOL: readonly string[] = [
  "명식은 정해진 답이 아니라 어디서 힘이 나기 쉬운지를 보여 주는 지도에 가까워요.",
  "같은 장면에서도 서로 다른 쪽으로 힘이 쓰인다는 걸 알면 오해가 줄어요.",
  "한 사람이 먼저 속도를 늦추면 다른 사람이 따라오기 쉬워지죠.",
  "작은 약속 하나를 정해 지켜 보면 이 풀이가 두 사람에게 맞는지 가늠할 수 있어요.",
  "이번 달에는 서로의 리듬을 한 번 이야기로 확인해 보는 편이 나아요.",
  "부딪히는 지점은 대개 일을 나누는 방식에서 먼저 드러나거든요.",
  "둘 다 편한 시간대를 찾아 두면 대화가 한결 부드러워져요.",
  "서로 잘하는 일을 하나씩 말해 보면 역할이 자연스럽게 나뉘어요.",
  "급할 때 먼저 하는 말이 서로 다르다는 점을 기억해 두면 좋아요.",
  "한쪽이 정리를 맡고 다른 쪽이 시작을 맡는 식으로 나눠 보세요.",
  "말로 꺼내기 전에 서로 무엇을 기대하는지 한 줄씩 정리해 두면 덜 엇갈려요.",
  "함께 보내는 시간의 양보다 그 시간을 여는 방식이 더 크게 남아요.",
  "부딪힌 날에는 결론보다 순서를 먼저 정하는 편이 회복이 빨라요.",
  "익숙한 역할을 한 번 바꿔 맡아 보면 서로의 무게를 알게 돼요.",
];

const nameOf = (m: MatchFacts) => m.label || "그 사람";
const eunOf = (word: string) => josa(word, "은", "는");
const relationText = (rs: Relation[]) => rs.map((r) => `${r.members.join("와 ")} 사이의 ${r.type}`).join(", ");
const countsLine = (counts: Record<string, number>) => Object.entries(counts).map(([e, n]) => `${e} ${n}`).join(", ");
/** The user's one-line concern, quoted once (the model is asked to answer it in a scene). */
const concernLine = (m: MatchFacts, tail: string) => (m.concern ? `'${m.concern}'라는 고민에는 ${tail}` : "");

export function mockMatchTeaser(m: MatchFacts): MatchTeaserDraft {
  const e = m.pair.elements;
  return {
    summary: fill([
      `명리에서는 두 사람의 일간을 ${m.pair.dayMasters.images}의 짝으로 읽어요.`,
      `${m.pair.dayMasters.meeting}.`,
      e.partnerFillsMine.length ? `내 명식에 겉으로 없는 ${e.partnerFillsMine[0]}개를 ${nameOf(m)} 쪽이 품고 있어요.` : "두 사람의 오행은 서로 겹치는 쪽이 많아요.",
      concernLine(m, "두 결의 속도 차이부터 비춰 볼게요."),
      "이번 주에는 둘이 함께 정할 일 하나를 골라 먼저 순서를 나눠 보세요.",
    ], SAJU_PAIR_POOL, 310, 400),
  };
}

export function mockMatchPartA(m: MatchFacts): MatchPartA {
  const who = nameOf(m);
  const d = m.pair.dayMasters;
  const e = m.pair.elements;
  return {
    dayMasters: {
      body: fill([
        `나의 일간은 ${d.me}, ${who}의 일간은 ${d.partner}예요.`,
        `명리에서는 두 일간을 ${d.images}의 짝으로 읽어요.`,
        `${d.meeting}.`,
        `${eunOf(`${who}의 일간`)} 내게 ${d.partnerIsToMe}, 나의 일간은 ${who}에게 ${d.meIsToPartner}에 해당해요.`,
        d.stems.length ? `두 일간 사이에는 ${relationText(d.stems)} 관계가 있어요. 묶이려는 성질이나 움직임이 늘어나는 성질로만 읽어요.` : "두 일간 사이에 따로 묶이거나 부딪히는 관계는 보이지 않아요.",
        concernLine(m, "두 일간이 서로 다른 속도로 움직인다는 점부터 떠올려 보면 좋아요."),
        "함께 정한 일을 각자 다른 속도로 시작했다면 이 구조와 맞물리고, 늘 같은 속도로 움직였다면 이 부분은 덜 맞는 풀이예요.",
      ], SAJU_PAIR_POOL, 560, 750),
    },
    elements: {
      body: fill([
        `${e.basis}로 세면 나는 ${countsLine(e.me)}, ${who} 쪽은 ${countsLine(e.partner)}이에요.`,
        e.partnerFillsMine.length ? `내 명식에 겉으로 없는 기운 가운데 ${e.partnerFillsMine.join(", ")}개를 ${who} 쪽이 품고 있어요.` : `${who} 쪽이 내게 없는 기운을 따로 채워 주지는 않아요.`,
        e.mineFillsPartner.length ? `거꾸로 ${who} 쪽에 없는 ${e.mineFillsPartner.join(", ")}개는 내 쪽에 있어요.` : `${who} 쪽에 없는 기운을 내가 따로 채우지는 않아요.`,
        e.bothMissing.length ? `둘 다 겉에 없는 기운도 있어요(${e.bothMissing.join("·")}). 함께 의식해서 꺼내 써야 하는 힘이에요.` : "",
      ], SAJU_PAIR_POOL, 560, 750),
    },
    pillars: {
      body: fill([
        m.pair.dayBranches.length ? `가장 가까운 자리인 두 일지 사이에는 ${relationText(m.pair.dayBranches)} 관계가 있어요.` : "두 일지 사이에는 따로 묶이거나 부딪히는 관계가 보이지 않아요.",
        m.pair.pillars.length ? `기둥 전체로 보면 ${relationText(m.pair.pillars.slice(0, 3))} 같은 관계가 계산돼요.` : "기둥 사이에도 계산된 관계가 없어 서로 담백한 거리를 두는 결로 읽어요.",
        "관계가 있다는 사실은 사건이 아니라 움직임이 늘어나거나 묶이려는 성질로만 읽어요.",
        // The pair's limits, said once as the prompt asks (the model copies these lines).
        ...m.pair.limits,
      ], SAJU_PAIR_POOL, 560, 750),
    },
    luck: {
      body: fill([
        m.pair.luck.me ? `${m.pair.luck.me.replace(/^나: /, "나는 ")}의 흐름에 있어요.` : "나는 첫 대운이 시작되기 전의 흐름으로 읽어요.",
        m.pair.luck.partner ? `${m.pair.luck.partner.replace(/^그 사람: /, `${who} 쪽은 `)}의 흐름에 있어요.` : `${who} 쪽은 첫 대운이 시작되기 전의 흐름으로 읽어요.`,
        ...m.pair.luck.changes.map((line) => `${line}.`),
        ...m.pair.luck.sharedYears.map((line) => `${line} 관계가 있어 함께 움직임이 늘어나는 해로 읽어요.`),
        "대운은 방향을 보는 도구이지 특정한 일이 생긴다는 약속은 아니에요.",
      ], SAJU_PAIR_POOL, 560, 750),
    },
  };
}

export function mockMatchPartB(m: MatchFacts, ctx: TarotContext): MatchPartB {
  const who = nameOf(m);
  const c = ctx.cards;
  const line = (i: number) => lineOf(ctx, i);
  return {
    verdict: "서로의 속도를 한 번 맞춰 보는 쪽으로 움직여 보세요.",
    cards: c.map((card) => ({
      position: card.position, cardId: card.cardId,
      body: cardBody(ctx, card, 1, false, [`두 사람 사이에서는 ${lineOf(ctx, card.slot)} 쪽으로 읽어요.`], 275),
    })),
    connection: { body: fill([`다섯 장을 차례로 보면 ${c.map((x) => x.name).join(", ")} 순서로 이어져요.`, `나의 마음 자리의 '${line(0)}'에서 함께 가꿀 방향 자리의 '${line(4)}'까지가 한 흐름이에요.`], NEUTRAL_POOL, 230, 320) },
    bridge: {
      body: fill([
        `사주로는 두 사람의 일간을 ${m.pair.dayMasters.images}의 짝으로 읽었어요.`,
        `카드로는 두 사람 사이 자리에 ${c[2]!.name} 그림이 놓였어요.`,
        `같은 곳을 가리키는 부분은 서로 다른 속도를 인정하는 쪽이고, 다르게 보이는 부분은 엇갈리는 지점 자리의 '${line(3)}'예요.`,
        "두 근거는 따로 읽은 것이라 하나로 합쳐 판정하지 않아요.",
      ], NEUTRAL_POOL, 260, 380),
    },
    action: { body: fill(["이번 주에 둘이 함께 정할 일 하나를 골라 순서를 먼저 나눠 보세요."], ACTION_POOL, 85, 160) },
    observation: { body: fill([`몇 주 동안 ${c[1]!.name} 그림처럼 ${who} 쪽 흐름이 바뀌는 순간을 눈여겨보세요.`], ["그때 내 쪽 반응이 어떤지도 함께 보면 좋아요.", ...ACTION_POOL], 85, 180) },
    followUps: ["둘이 먼저 맞춰 볼 일은 뭘까요?", "엇갈릴 때는 어떻게 하면 좋을까요?"],
  };
}
