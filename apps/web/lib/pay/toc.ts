import { SAJU_GLANCE_HEADING, SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import type { ProductId } from "./catalog";

const short = (heading: string) => heading.split(" · ")[0]!;

/**
 * Checkout's table of contents (sales 2026-11-10 item 1): the sections a reading is written under, titles only, in
 * reading order. Client-safe copies of the generators' headings (lib/ai/prompts/*, server-only); toc.test.ts checks
 * every title against them. A title that varies with the question (a card's name, a month) is named by its kind.
 */
export const CHECKOUT_TOC: Readonly<Record<ProductId, readonly string[]>> = {
  tarot: ["한 줄 결론", "카드별 풀이", "카드를 이어 읽으면", "언제 움직이면 좋을지", "며칠 안에 확인해 볼 신호", "상황에 따라 달라지는 길", "피하면 좋은 것", "다르게 볼 수 있는 부분", "오늘 해볼 작은 행동"],
  saju: [SAJU_GLANCE_HEADING, ...SAJU_PROLOGUE_SECTIONS, "앞으로 몇 주 · 확인해 볼 신호"].map(short),
  "tarot-deep": ["한 줄 결론", "카드 10장 자리별 풀이", "지금의 나와 가로막는 것", "두 갈래로 이어 읽기", "나와 주변, 그리고 결과의 방향", "언제 움직이면 좋을지", "오늘 해볼 작은 행동", "며칠 안에 확인해 볼 신호"],
  match: ["한 줄로 보면", "두 사람의 일간", "오행이 채워 주는 것과 겹치는 것", "두 일지 사이의 합과 충", "두 사람의 10년이 겹치는 때", "앞으로 1년, 석 달씩", "서로에게 맞는 말과 행동", "서로 피하면 좋은 말과 행동", "오늘 해 볼 일", "몇 주 안에 확인해 볼 신호"],
  "newyear-2027": ["2027 정미년과 나의 명식", "지금의 10년 속 2027년", "일, 돈, 관계, 몸과 생활 리듬", "2027년을 가볍게 돕는 것", "1월부터 12월까지 달마다", "한 해를 보내는 방법", "첫 달에 확인해 볼 신호"],
};
