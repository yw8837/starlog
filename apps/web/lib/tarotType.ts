import { getCard, type CardElement, type Orientation } from "@starlog/core";
import { SITE } from "@/lib/config";
import { decisionFor, type Lean } from "@/lib/decision";

/**
 * 타로로's nickname for a draw (spec 2026-11-11 entry funnel renewal, 3.4 and 6.8 D). No model writes it: a rule picks it from
 * the card's element (packages/core cards.ts, Golden Dawn) and its side's lean in the card DB (lib/decision.ts), so the same
 * card face always gets the same nickname and friends can compare. Shown on screen only; never sent to the server or a model.
 * B1: 지금의 한 장's 12 (every one of the 156 faces maps to one). The 3-card spread's 20 come in B2.
 */

export const NOW_TYPE_SLUGS = [
  "now-fire-go", "now-fire-wait", "now-fire-rethink",
  "now-water-go", "now-water-wait", "now-water-rethink",
  "now-air-go", "now-air-wait", "now-air-rethink",
  "now-earth-go", "now-earth-wait", "now-earth-rethink",
] as const;

export type NowTypeSlug = (typeof NOW_TYPE_SLUGS)[number];

export interface NowTypeDef {
  element: CardElement;
  lean: Lean;
  /** The nickname (spec 6.8 D 이름). */
  name: string;
  /** 타로로's one line, 반말 (spec 6.8 D 한 줄). */
  line: string;
}

/** Spec 6.8 D, as written. */
export const NOW_TYPES: Readonly<Record<NowTypeSlug, NowTypeDef>> = {
  "now-fire-go": { element: "fire", lean: "go", name: "출발 신호 받은 직진러", line: "불 카드가 가 보래. 신발 끈은 이미 묶었지?" },
  "now-fire-wait": { element: "fire", lean: "wait", name: "시동 걸고 대기 중", line: "엔진은 따뜻한데 신호가 아직 노란불이야. 조금만 기다려 봐" },
  "now-fire-rethink": { element: "fire", lean: "rethink", name: "핸들 고민 중인 직진러", line: "직진하고 싶은데 카드가 옆길도 보래. 내비 한 번 다시 켜 봐" },
  "now-water-go": { element: "water", lean: "go", name: "마음 가는 쪽으로 출발", line: "마음이 가리키는 쪽으로 가 봐도 된대. 대신 천천히" },
  "now-water-wait": { element: "water", lean: "wait", name: "마음 숙성 중", line: "마음이 아직 숙성 중이래. 김치도 하루는 재우잖아" },
  "now-water-rethink": { element: "water", lean: "rethink", name: "마음 다시 보기 중", line: "이 마음 맞나? 한 번 더 들여다보래" },
  "now-air-go": { element: "air", lean: "go", name: "말할 타이밍 잡은 형", line: "생각 정리 끝. 이제 입 밖으로 꺼낼 차례래" },
  "now-air-wait": { element: "air", lean: "wait", name: "머릿속 회의 연장 중", line: "회의가 한 번 더 연장됐어. 결론은 내일 내도 돼" },
  "now-air-rethink": { element: "air", lean: "rethink", name: "플랜 B 회의 소집", line: "카드가 플랜 B도 꺼내 보래. 회의실 예약해" },
  "now-earth-go": { element: "earth", lean: "go", name: "계산 끝, 실행만 남은 형", line: "계산은 다 됐어. 이제 실행 버튼만 남았대" },
  "now-earth-wait": { element: "earth", lean: "wait", name: "자 한 번 더 대 보는 형", line: "서두를 일 아니래. 자 한 번 더 대 보고 가" },
  "now-earth-rethink": { element: "earth", lean: "rethink", name: "다른 견적도 받아 보는 형", line: "다른 견적도 한 번 받아 보래. 비교는 해 볼수록 좋잖아" },
};

export const ELEMENT_KO: Readonly<Record<CardElement, string>> = { fire: "불", water: "물", air: "바람", earth: "흙" };

/** The lean as the /now page's "어떻게 답이 나오나요?" names it. */
export const LEAN_KO: Readonly<Record<Lean, string>> = { go: "가 보기", wait: "조금 더 지켜보기", rethink: "다른 길도 살펴보기" };

/** The nickname of one card face: `now-{element}-{lean}`. Throws for a card the deck does not know. */
export function nowType(cardId: string, orientation: Orientation): NowTypeSlug {
  return `now-${getCard(cardId).element}-${decisionFor(cardId, orientation).lean}` as NowTypeSlug;
}

/** The fact under the nickname (6.2 N3), or the whole judgement when no nickname is shown (N5, `polite`). */
export function nowFacts(slug: NowTypeSlug, { polite = false }: { polite?: boolean } = {}): string {
  const { element, lean } = NOW_TYPES[slug];
  return `${ELEMENT_KO[element]} 카드 · ${LEAN_KO[lean]} 쪽${polite ? "이에요" : ""}`;
}

/** The share text: the nickname and the card (6.2 N8), or the card only where no nickname was shown (N9, as before). */
export function nowShareText({ cardName, reversed, slug }: { cardName: string; reversed: boolean; slug: NowTypeSlug | null }): string {
  const card = `${cardName}${reversed ? "(역)" : ""}`;
  return slug ? `타로로 판정: ${NOW_TYPES[slug].name} · ${card} | ${SITE.nameKo} 지금의 한 장` : `${SITE.nameKo} 지금의 한 장 · ${card}`;
}
