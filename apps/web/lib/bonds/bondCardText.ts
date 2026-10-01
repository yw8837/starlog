import "server-only";
import type { Orientation } from "@starlog/core";
import { kbCard } from "@/lib/kb";

/**
 * The "요즘 두 사람 사이" line of a 인연 카드, from the card's KB keyword. Rule-based (no AI), 해요체, and
 * it never says what either person feels: the card describes the air between them, not a verdict.
 */
export function bondCardLine(cardId: string, orientation: Orientation): string {
  const card = kbCard(cardId);
  const keyword = card.keywordsKo[0] ?? card.names.ko;
  return orientation === "upright"
    ? `요즘 두 사람 사이엔 ‘${keyword}’의 기운이 흘러요`
    : `요즘 두 사람 사이엔 ‘${keyword}’의 기운이 잠시 쉬어 가요. 서두르지 않아도 괜찮아요`;
}

/** The rule-based line for today's card between the two (the fallback when no AI line is made). */
export function todayCardLine(cardId: string, orientation: Orientation): string {
  const card = kbCard(cardId);
  const keyword = card.keywordsKo[1] ?? card.keywordsKo[0] ?? card.names.ko;
  return orientation === "upright"
    ? `오늘 두 사람 사이엔 ‘${keyword}’의 흐름이 가까이 있어요. 짧은 안부 하나로 이어 가 보세요`
    : `오늘 두 사람 사이엔 ‘${keyword}’의 흐름이 한 박자 쉬어 가요. 부담 없는 인사 정도가 잘 맞아요`;
}
