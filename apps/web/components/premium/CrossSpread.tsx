import { getCard, type Orientation } from "@starlog/core";
import { TarotCard } from "@/components/tarot/TarotCard";
import type { FrontDeck } from "@/lib/deck";
import s from "./premium.module.css";

/**
 * Grid areas for positions 1–10: the cross (1 now, 2 across it, 3 below, 4 left, 5 above, 6 right)
 * and the column 7 → 10 from the bottom up.
 */
const AREA = ["now", "now", "base", "past", "goal", "next", "self", "around", "hope", "outcome"] as const;

type CrossSpreadProps = {
  cards: Array<{ position: string; cardId: string; orientation: Orientation }>;
  /** The design the reading was written for (its picture is the one it quotes). */
  deck?: FrontDeck;
};

/** The ten cards at a glance, laid as they were dealt; each position's section shows its card again, larger. */
export function CrossSpread({ cards, deck }: CrossSpreadProps) {
  return (
    <ol className={s.cross} aria-label="카드 10장 배치">
      {cards.map((card, i) => {
        const name = getCard(card.cardId).names.ko;
        return (
          <li key={card.position} className={s.crossSlot} style={{ gridArea: AREA[i] }} data-crossing={i === 1 ? "" : undefined}>
            <TarotCard
              cardId={card.cardId}
              orientation={card.orientation}
              faceUp
              size="sm"
              className={s.crossCard}
              deck={deck}
              label={`${i + 1}번 ${card.position} · ${name}${card.orientation === "reversed" ? " (역방향)" : ""}`}
            />
            <span className={s.crossLabel} aria-hidden="true">
              <span className={s.crossNo}>{i + 1}</span>
              {card.position}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
