"use client";

import { useEffect, useState } from "react";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import type { GuideCategory } from "@/lib/guideMeta";
import s from "./guide.module.css";

/** The hero lines the owner approved on 2026-10-06 (.superpowers/queue/guide-bubbles.md). Line 1 is the prerendered one. */
export const GUIDE_HOST_LINES: Record<GuideCategory, readonly string[]> = {
  tarot: [
    "카드 읽는 법, 제가 차근차근 알려 줄게요",
    "처음이면 메이저 아르카나부터 보면 쉬워요",
    "역방향이 나와도 겁먹지 마세요. 나쁜 뜻만 있는 건 아니거든요",
    "질문이 구체적일수록 카드가 또렷하게 읽혀요",
    "같은 카드도 무엇을 물었는지에 따라 다르게 읽혀요",
    "카드 그림 속 작은 것들도 다 뜻이 있어요",
    "오늘은 어떤 카드가 궁금해요?",
    "천천히 둘러보세요. 저는 여기 있을게요",
  ],
  saju: [
    "명식 읽는 법은 제가 맡을게요",
    "태어난 날의 첫 글자, 일간부터 보면 길이 보여요",
    "사주에서 해는 1월 1일이 아니라 입춘에 바뀌어요",
    "태어난 시간을 몰라도 세 기둥으로 읽을 수 있어요",
    "오행은 많고 적음보다 균형을 봐요",
    "10년의 흐름은 대운, 한 해의 흐름은 세운이에요",
    "모르는 용어는 용어 정리 글에 다 모아 뒀어요",
    "궁금한 기둥부터 하나씩 펼쳐 봐요",
  ],
};

/** A random index other than `current`. */
function another(current: number, count: number): number {
  const pick = Math.floor(Math.random() * (count - 1));
  return pick >= current ? pick + 1 : pick;
}

/**
 * The guide hero's host: the cat for tarot, the rabbit in 두루마기 for saju, with a speech bubble.
 * The prerendered page shows line 1; after mount the bubble takes a random line, and every tap on the
 * character (its own hop and star burst still play) switches to a different one. No aria-live: the line
 * is decoration, so changing it does not announce anything.
 */
export function GuideHost({ category }: { category: GuideCategory }) {
  const lines = GUIDE_HOST_LINES[category];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * lines.length));
  }, [lines]);

  return (
    <div className={s.hostRow}>
      <div className={s.hostCast} onClick={() => setIndex((i) => another(i, lines.length))}>
        {category === "tarot" ? <Cat outfit="tarot" size={104} /> : <Rabbit outfit="hanbok" size={104} />}
      </div>
      <SpeechBubble tail="left" className={s.hostLine}>
        {lines[index]}
      </SpeechBubble>
    </div>
  );
}
