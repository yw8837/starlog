import type { Orientation } from "@starlog/core";
import { BoldText } from "@/components/reading/BoldText";
import { Paper } from "@/components/tarot/Paper";
import r from "@/components/tarot/ReadingArticle.module.css";
import { TarotCard } from "@/components/tarot/TarotCard";
import type { FrontDeck } from "@/lib/deck";
import { stripBold } from "@/lib/reading/bold";
import type { MatchReadingData } from "@/lib/reading/types";
import { ProseSection } from "./DeepTarotArticle";
import s from "./premium.module.css";

type MatchArticleProps = {
  reading: MatchReadingData;
  /** The five cards as dealt. */
  cards: Array<{ position: string; cardId: string; orientation: Orientation }>;
  deck?: FrontDeck;
};

/**
 * The paid 궁합 reading (P5 spec §5.2: the two sources stay visibly apart): the one-line summary, the
 * group "사주로 본 두 사람" with its four sections, the group "카드로 본 지금" with the five cards, then
 * how the five connect, the saju and the cards set side by side, this week's action and the signal.
 */
export function MatchArticle({ reading, cards, deck }: MatchArticleProps) {
  const saju = [reading.saju.dayMasters, reading.saju.elements, reading.saju.pillars, reading.saju.luck];
  return (
    <div className={r.article}>
      <aside className={r.verdict} aria-labelledby="match-verdict-label">
        <p id="match-verdict-label" className={r.verdictLabel}>
          한 줄로 보면
        </p>
        <p className={r.verdictText}>{stripBold(reading.verdict)}</p>
      </aside>

      <h2 className={s.group}>사주로 본 두 사람</h2>
      {saju.map((section) => (
        <Paper key={section.heading}>
          <ProseSection section={section} level={3} />
        </Paper>
      ))}

      <h2 className={s.group}>카드로 본 지금</h2>
      {reading.cards.map((section, i) => {
        const card = cards[i];
        return (
          <Paper key={section.position} as="article">
            <div className={s.cardHead}>
              {card ? <TarotCard cardId={card.cardId} orientation={card.orientation} faceUp size="md" className={s.cardHeadCard} deck={deck} /> : null}
              <div>
                <p className={r.eyebrow}>{section.position}</p>
                <h3 className={s.subheading}>{section.heading}</h3>
              </div>
            </div>
            <p className={r.prose}>
              <BoldText text={section.body} />
            </p>
          </Paper>
        );
      })}

      {[reading.connection, reading.bridge, reading.action, reading.observation].map((section) => (
        <Paper key={section.heading}>
          <ProseSection section={section} />
        </Paper>
      ))}
    </div>
  );
}
