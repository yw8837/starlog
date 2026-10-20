import { getCard, type Orientation } from "@starlog/core";
import { TarotCard } from "@/components/tarot/TarotCard";
import type { FrontDeck } from "@/lib/deck";
import s from "./premium.module.css";

export interface SpreadListCard {
  position: string;
  cardId: string;
  orientation: Orientation;
  /** The preview's keyword for this card in this position. */
  keyword?: string;
  /** A computed line beside the card (a chart fact it is read with), written by code. */
  note?: string;
}

type SpreadListProps = {
  /** The list's accessible name ("카드 10장"). */
  title: string;
  cards: SpreadListCard[];
  deck?: FrontDeck;
};

/** The drawn cards as rows: number and position, the card's name (and 역방향), its keyword, an optional note. */
export function SpreadList({ title, cards, deck }: SpreadListProps) {
  return (
    <ol className={s.list} aria-label={title}>
      {cards.map((card, i) => (
        <li key={card.position} className={s.listItem}>
          <TarotCard cardId={card.cardId} orientation={card.orientation} faceUp size="sm" className={s.listCard} deck={deck} />
          <div className={s.listText}>
            <p className={s.listPosition}>
              <span className={s.listNo}>{i + 1}</span>
              {card.position}
            </p>
            <p className={s.listName}>
              {getCard(card.cardId).names.ko}
              {card.orientation === "reversed" ? <span className={s.listReversed}> · 역방향</span> : null}
            </p>
            {card.keyword ? <p className={s.listKeyword}>{card.keyword}</p> : null}
            {card.note ? <p className={s.listNote}>{card.note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
