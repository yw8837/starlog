import type { Orientation } from "@starlog/core";
import { TarotCard, type CardSize } from "./TarotCard";
import s from "./SpreadRow.module.css";

export interface SpreadCard {
  position: string;
  /** Omit while the slot is still empty. */
  cardId?: string;
  orientation?: Orientation;
  faceUp: boolean;
  /** Printed number, e.g. "IX". */
  number?: string;
  name?: string;
  keyword?: string;
}

type SpreadRowProps = {
  cards: SpreadCard[];
  size?: CardSize;
  /** Makes face-up cards buttons (e.g. to enlarge them). */
  onCardTap?: (index: number) => void;
  className?: string;
};

export function cardLabel(card: SpreadCard): string {
  if (!card.faceUp || !card.name) return `${card.position} 자리, 아직 뒤집지 않은 카드`;
  return `${card.position} · ${card.name} · ${card.orientation === "reversed" ? "역방향" : "정방향"}`;
}

/** Cards laid side by side, position name above and name/keyword below each. */
export function SpreadRow({ cards, size = "md", onCardTap, className }: SpreadRowProps) {
  return (
    <ol className={[s.row, s[size], className ?? ""].filter(Boolean).join(" ")} style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }}>
      {cards.map((card, i) => {
        const label = cardLabel(card);
        const face = (
          <TarotCard
            cardId={card.cardId}
            orientation={card.orientation}
            faceUp={card.faceUp}
            size={size}
            label={onCardTap && card.faceUp ? undefined : label}
            className={s.card}
          />
        );
        return (
          <li key={i} className={s.item}>
            <p className={s.position}>{card.position}</p>
            {!card.cardId ? (
              <span className={s.empty} aria-label={`${card.position} 자리, 비어 있음`} role="img" />
            ) : onCardTap && card.faceUp ? (
              <button type="button" className={s.tap} onClick={() => onCardTap(i)} aria-label={`${label}, 크게 보기`}>
                {face}
              </button>
            ) : (
              face
            )}
            <div className={s.meta} data-shown={card.faceUp && card.name ? "" : undefined}>
              {card.faceUp && card.name ? (
                <>
                  <p className={s.name}>
                    {card.number ? <span className={s.number}>{card.number}</span> : null}
                    {card.name}
                  </p>
                  {card.keyword ? <p className={s.keyword}>{card.keyword}</p> : null}
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
