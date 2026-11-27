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
 * 골라 읽기 (spec 2026-11-26 beyond trend §2): the fixed ids of the ten positions (card-1…) and of the headings after
 * them in the order shown (part-1 the crossing, part-2 the axes, part-3 the column, part-4 timing, part-5 the action,
 * part-6 the signal).
 */
const DEEP_PARTS = ["crossing", "axes", "staff", "timing", "action", "observation"] as const;
const deepPart = (key: (typeof DEEP_PARTS)[number]) => `part-${DEEP_PARTS.indexOf(key) + 1}`;

/** The jump row of an opened 10-card reading (§2): the ten positions by number and name, then 교차, 시기, 할 일. */
export function deepJumpItems(reading: DeepTarotReadingData): Array<{ id: string; label: string; number?: number }> {
  return [
    ...reading.positions.map((section, i) => ({ id: `card-${i + 1}`, label: section.position, number: i + 1 })),
    { id: deepPart("crossing"), label: "교차" },
    { id: deepPart("timing"), label: "시기" },
    { id: deepPart("action"), label: "할 일" },
  ];
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
          <Paper key={section.position} as="article" id={`card-${i + 1}`} tabIndex={-1}>
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

      <Paper id={deepPart("crossing")} tabIndex={-1}>
        <ProseSection section={reading.crossing} />
      </Paper>
      <Paper id={deepPart("axes")} tabIndex={-1}>
        <h2 className={r.heading}>{reading.axes.heading}</h2>
        <ProseSection section={reading.axes.vertical} level={3} />
        <ProseSection section={reading.axes.horizontal} level={3} />
      </Paper>
      {(["staff", "timing", "action", "observation"] as const).map((key) => (
        <Paper key={key} id={deepPart(key)} tabIndex={-1}>
          <ProseSection section={reading[key]} />
        </Paper>
      ))}
    </div>
  );
}
