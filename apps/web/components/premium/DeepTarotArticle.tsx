import type { Orientation } from "@starlog/core";
import { BoldText } from "@/components/reading/BoldText";
import { Paper } from "@/components/tarot/Paper";
import r from "@/components/tarot/ReadingArticle.module.css";
import { TarotCard } from "@/components/tarot/TarotCard";
import type { FrontDeck } from "@/lib/deck";
import { stripBold } from "@/lib/reading/bold";
import type { DeepTarotReadingData, Section } from "@/lib/reading/types";
import { CrossSpread } from "./CrossSpread";
import s from "./premium.module.css";

type DeepTarotArticleProps = {
  reading: DeepTarotReadingData;
  /** The ten cards as dealt (their orientation is the chapter's, not the reading's). */
  cards: Array<{ position: string; cardId: string; orientation: Orientation }>;
  deck?: FrontDeck;
  /** The ten cards as dealt at the top; off where the page shows them in its own spread column (the chapter). */
  showSpread?: boolean;
};

export function ProseSection({ section, level = 2 }: { section: Section; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <>
      <Heading className={level === 2 ? r.heading : s.subheading}>{section.heading}</Heading>
      <p className={r.prose}>
        <BoldText text={section.body} />
      </p>
    </>
  );
}

/**
 * The paid 10-card reading in its order: the verdict, the ten cards as dealt, each position with its
 * card (at least 100px wide), then the readings across positions (the crossing, the two axes, the
 * column, timing), today's action and the signal to watch. Headings are the code's.
 */
export function DeepTarotArticle({ reading, cards, deck, showSpread = true }: DeepTarotArticleProps) {
  return (
    <div className={r.article}>
      <aside className={r.verdict} aria-labelledby="deep-verdict-label">
        <p id="deep-verdict-label" className={r.verdictLabel}>
          한 줄 결론
        </p>
        <p className={r.verdictText}>{stripBold(reading.verdict)}</p>
      </aside>

      {showSpread ? <CrossSpread cards={cards} deck={deck} /> : null}

      {reading.positions.map((section, i) => {
        const card = cards[i];
        return (
          <Paper key={section.position} as="article">
            <div className={s.cardHead}>
              {card ? <TarotCard cardId={card.cardId} orientation={card.orientation} faceUp size="md" className={s.cardHeadCard} deck={deck} /> : null}
              <div>
                <p className={r.eyebrow}>{`${i + 1}번 · ${section.position}`}</p>
                <h2 className={r.heading}>{section.heading}</h2>
              </div>
            </div>
            <p className={r.prose}>
              <BoldText text={section.body} />
            </p>
          </Paper>
        );
      })}

      <Paper>
        <ProseSection section={reading.crossing} />
      </Paper>
      <Paper>
        <h2 className={r.heading}>{reading.axes.heading}</h2>
        <ProseSection section={reading.axes.vertical} level={3} />
        <ProseSection section={reading.axes.horizontal} level={3} />
      </Paper>
      {[reading.staff, reading.timing, reading.action, reading.observation].map((section) => (
        <Paper key={section.heading}>
          <ProseSection section={section} />
        </Paper>
      ))}
    </div>
  );
}
