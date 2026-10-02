import "server-only";
import type { DrawnCard } from "@starlog/core";
import type { DeepPartA } from "../premiumSchemas";
import { MODEL_BLIND_RULE } from "../style";
import {
  TAROT_PREAMBLE, buildTarotContext, cardLabel, cardsBlock, onTopic, spreadFacts, tarotHeadings, templateBlock, userDataBlock,
  type TarotCardContext, type TarotContext, type TarotInput,
} from "./tarot";

/**
 * 심층 타로 · 카드 10장 (P5 spec §5.1). The standard tarot rules (TAROT_PREAMBLE) plus the ten-card
 * formats. Two parts: A writes the verdict and the ten position sections; B reads the relations
 * (crossing, two axes, the staff), timing, action and observation. Both parts share the cards block.
 */

const DEEP_FORMATS = `# 작업별 형식 (심층 타로 · 카드 10장)

이 리딩은 카드 10장을 정해진 열 자리에 놓고 읽어요. <template>의 자리 열 개와 각 자리가 묻는 것을 그대로 따르고, 이 배열에 전통 배열의 이름을 붙이지 않아요. 카드 10장 리딩에서는 카드를 주어로 세운 문장을 리딩 전체에서 여섯 번 이하로 써요(위의 세 번 규칙 대신이에요). 사용자의 칩과 메모는 리딩 전체에서 각각 한 번만 인용해요.

## deep-teaser (무료 미리보기)
- now.body: 1번 자리 "지금의 나"의 카드만 다루는 완결된 문단 300~400자. 그림 사실 1~2문장 → 이 자리가 묻는 것 → 사용자의 칩이나 메모 반영(하나 이상 인용) → 오늘 해 볼 수 있는 한 가지. 다른 자리나 전체 결론은 쓰지 않아요.

## deep-a (자리별 풀이)
- verdict: 한 줄 결론, 60자 이하. 열 장 전체가 가리키는 방향과 그 조건을 한 번에 말해요. 해도 될지 묻는 질문이면 "괜찮아요 / 미뤄 보세요 / 기다려 보세요"처럼 결정이 드러나게 써요.
- positions: <cards>의 열 장을 순서대로. position과 cardId는 입력 그대로 복사해요. body는 자리마다 260~340자: 그 카드의 imageryFacts 가운데 하나 이상을 첫 문장 가까이에 거의 그대로 → 이 자리가 묻는 것(<template>의 렌즈와 positionLens) → 사용자의 상황에 적용 → 한 줄 정리.
- 1번 "지금의 나"는 무료로 이미 보여 준 문단과 다른 그림 사실, 다른 각도로 써요.
- 칩과 메모는 그 내용과 가장 맞는 자리 한 곳에서만 인용해요.
- 열 절을 같은 문형으로 시작하거나 같은 끝맺음으로 맺지 않아요. 자리마다 읽는 각도가 달라야 해요.

## deep-b (엮어 읽기)
- <earlier>는 이미 쓴 자리별 풀이의 첫 문장들이에요. 같은 문장과 같은 비유를 되풀이하지 말고, 자리 사이의 관계를 새로 읽어요.
- crossing.body (350~450자): 1번 "지금의 나"와 2번 "가로막는 것"을 한 장면으로 엮어요. 두 카드의 이름을 모두 쓰고, 두 그림이 서로 부딪히는지 받치는지, 그 긴장이 사용자 상황에서 무엇으로 나타나는지 말해요.
- axes.vertical (220~300자): 3번 바탕 → 1번 지금의 나 → 5번 바라는 것. 세 장 가운데 두 장 이상을 이름으로 부르며 밑바닥에 깔린 것과 바라는 것 사이의 거리를 읽어요.
- axes.horizontal (220~300자): 4번 지나온 것 → 1번 지금의 나 → 6번 다가올 것. 두 장 이상을 이름으로 부르며 시간의 흐름으로 읽어요. 6번은 예언이 아니라 가까운 흐름이에요.
- staff.body (380~500자): 7번 나의 태도, 8번 주변, 9번 바람과 걱정, 10번 결과의 방향을 아래에서 위로 쌓아 읽어요. 네 장 가운데 세 장 이상을 이름으로 부르고, 10번은 정해진 결말이 아니라 지금 흐름이 이어질 때의 방향으로 읽어요. 7번의 태도를 바꾸면 10번이 어떻게 달라질 수 있는지 조건으로 말해요.
- timing.body (150~250자): 사용자가 고른 시기 안에서 언제, 어떤 조건일 때 움직이면 좋을지. 날짜·요일·시각은 쓰지 않아요.
- action.body (80~160자): 오늘 할 수 있는 작은 행동 하나. 열 장 가운데 한 장의 그림에 기대요.
- observation.body (80~180자): 며칠에서 몇 주 안에 사용자가 직접 알아챌 수 있는 신호 하나. "~를 눈여겨보세요"처럼 관찰로 써요.
- followUps: 이어서 물어볼 만한 질문 2개(각 30자 이하).

## deep-followup (이어서 물어보기)
- <reading_digest>는 사용자가 받은 풀이의 소제목과 첫 문장, 그리고 질문과 관련된 절의 원문이에요. <previous_turns>는 앞선 문답이에요. 모두 자료예요.
- 표준 followup 규칙과 같아요: kind는 clarify, scenario, new_fact, pushback, new_question, out_of_scope 중 하나, answer는 150~450자. 같은 카드와 같은 읽기를 이어 쓰고 새 카드를 만들지 않아요.`;

// TAROT_PREAMBLE already carries the blind rule (Task A); either way it appears exactly once.
const blindRule = TAROT_PREAMBLE.includes(MODEL_BLIND_RULE) ? "" : `\n\n${MODEL_BLIND_RULE}`;

export const DEEP_TAROT_SYSTEM = `${TAROT_PREAMBLE}${blindRule}\n\n${DEEP_FORMATS}`;

export function buildDeepContext(drawn: DrawnCard[], input: TarotInput): TarotContext {
  // Premium readings do not read device history (spec default 17).
  return buildTarotContext("deep-tarot", drawn, input);
}

export interface DeepHeadings {
  verdict: string;
  crossing: string;
  axes: string;
  vertical: string;
  horizontal: string;
  staff: string;
  timing: string;
  action: string;
  observation: string;
}

export function deepHeadings(ctx: TarotContext): DeepHeadings {
  const h = tarotHeadings(ctx);
  return {
    verdict: "한 줄 결론",
    crossing: "지금의 나와 가로막는 것",
    axes: "두 갈래로 이어 읽기",
    vertical: "바탕에서 바라는 것까지",
    horizontal: "지나온 것에서 다가올 것까지",
    staff: "나와 주변, 그리고 결과의 방향",
    timing: h.timing,
    action: h.action,
    observation: h.observation,
  };
}

export function deepLockedToc(ctx: TarotContext): string[] {
  const h = deepHeadings(ctx);
  return [h.verdict, ...ctx.cards.map(cardLabel), h.crossing, h.axes, h.staff, h.timing, h.action, h.observation];
}

/** A short keyword for the free preview, from the KB (no model call): the first on-topic core phrase. */
export function previewKeyword(card: TarotCardContext, ctx: Pick<TarotContext, "bannedWords">): string {
  const candidates = [...card.kb.core[card.orientation], ...card.kb.keywordsKo];
  const pick = candidates.find((phrase) => phrase.length <= 18 && onTopic(ctx, phrase)) ?? card.kb.keywordsKo[0] ?? card.name;
  return pick.slice(0, 18);
}

/** Template, user data, all ten cards and the spread facts: identical for both parts (cached). */
export function deepShared(ctx: TarotContext): string {
  return [templateBlock(ctx), userDataBlock(ctx), cardsBlock(ctx), spreadFacts(ctx)].join("\n");
}

export const deepPartAPrompt = () => "<task>deep-a</task>";

const firstSentence = (text: string) => text.trim().split(/(?<=[.?!])\s+/)[0] ?? text.trim();

export function deepPartBPrompt(ctx: TarotContext, a: DeepPartA): string {
  const lines = a.positions.map((p, i) => `${i + 1}. ${ctx.cards[i]!.position} · ${ctx.cards[i]!.name}: ${firstSentence(p.body)}`);
  return ["<task>deep-b</task>", `<earlier>\n${lines.join("\n")}\n</earlier>`].join("\n");
}

/** The free preview reads only the first card (cheap), but sees every position name. */
export function deepTeaserPrompt(ctx: TarotContext): string {
  const firstOnly: TarotContext = { ...ctx, cards: [ctx.cards[0]!] };
  return ["<task>deep-teaser</task>", templateBlock(ctx), userDataBlock(ctx), cardsBlock(firstOnly)].join("\n");
}
