import "server-only";
import type { DeepPartA, DeepPartB, DeepTeaserDraft } from "./premiumSchemas";
import { FALLBACK_ACTIONS, actionsOf, cardBody, distinctActions, factSentence, factsOf, hasFinal } from "./mock";
import { previewKeyword } from "./prompts/deepTarot";
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
