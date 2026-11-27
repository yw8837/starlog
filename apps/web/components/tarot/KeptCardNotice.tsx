import { getCard } from "@starlog/core";
import { Button } from "@/components/ui/Button";
import type { FlowKeep } from "@/lib/flowState";
import s from "./KeptCardNotice.module.css";

/**
 * 이어 읽기's line at the top of the builder and the situation step (spec 2026-11-26 beyond trend §3): the card drawn on
 * /now goes in the first position, said as a fact (no claim that the free line and the reading agree), with the way out
 * (새로 세 장 뽑기: the flow goes on as today's, three cards to pick).
 */
export function KeptCardNotice({ keep, onDrop }: { keep: FlowKeep; onDrop: () => void }) {
  const name = `${getCard(keep.cardId).names.ko}${keep.orientation === "reversed" ? " 역방향" : ""}`;
  return (
    // Above the screen's h1, so a labelled region rather than a heading of its own.
    <section className={s.notice} aria-label="이어 읽기">
      <p className={s.title}>아까 뽑은 카드가 첫 자리에 놓여요</p>
      <p className={s.card}>{name}</p>
      <p className={s.text}>나머지 두 장만 더 뽑으면 돼요.</p>
      <Button variant="secondary" size="md" onClick={onDrop}>
        새로 세 장 뽑기
      </Button>
    </section>
  );
}
