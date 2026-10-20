import type { Orientation } from "@starlog/core";
import { BoldText } from "@/components/reading/BoldText";
import { Paper } from "@/components/tarot/Paper";
import r from "@/components/tarot/ReadingArticle.module.css";
import { TarotCard } from "@/components/tarot/TarotCard";
import type { FrontDeck } from "@/lib/deck";
import { PREMIUM } from "@/lib/premium/products";
import { stripBold } from "@/lib/reading/bold";
import type { LegacyMatchReadingData, StoredMatchReadingData } from "@/lib/reading/types";
import { ProseSection } from "./DeepTarotArticle";
import s from "./premium.module.css";

type MatchArticleProps = {
  reading: StoredMatchReadingData;
  /** The five cards as dealt, for a 궁합 written before it became saju only. */
  cards?: Array<{ position: string; cardId: string; orientation: Orientation }>;
  deck?: FrontDeck;
};

const [SAJU_PART, AHEAD_PART] = PREMIUM.match.parts;

/** The card part of a 궁합 written before 2026-10-17: kept so its record still reads as it was written. */
function LegacyCards({ reading, cards = [], deck }: { reading: LegacyMatchReadingData; cards?: MatchArticleProps["cards"]; deck?: FrontDeck }) {
  return (
    <>
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
    </>
  );
}

/**
 * The paid 궁합 reading, from the two people's saju only (owner 2026-10-17): the one-line summary, the group
 * "사주로 본 두 사람" with its four sections, then "앞으로 1년과 서로 대하는 법": the year ahead in four bands of three
 * months, what suits each other and what to avoid, today's step and the signal. A 궁합 written before keeps its five
 * cards in place of the second group.
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

      <h2 className={s.group}>{SAJU_PART}</h2>
      {saju.map((section) => (
        <Paper key={section.heading}>
          <ProseSection section={section} level={3} />
        </Paper>
      ))}

      {"cards" in reading ? (
        <LegacyCards reading={reading} cards={cards} deck={deck} />
      ) : (
        <>
          <h2 className={s.group}>{AHEAD_PART}</h2>
          {reading.periods.map((section) => (
            <Paper key={section.heading}>
              <ProseSection section={section} level={3} />
            </Paper>
          ))}
          {[reading.together, reading.avoid].map((section) => (
            <Paper key={section.heading}>
              <ProseSection section={section} level={3} />
            </Paper>
          ))}
          {[reading.action, reading.observation].map((section) => (
            <Paper key={section.heading}>
              <ProseSection section={section} />
            </Paper>
          ))}
        </>
      )}
    </div>
  );
}
