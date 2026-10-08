import { BoldText } from "@/components/reading/BoldText";
import { stripBold } from "@/lib/reading/bold";
import type { TarotReadingData } from "@/lib/reading/types";
import { partialTarotReading } from "@/lib/reading/validate";
import { CopyButton } from "./CopyButton";
import { Paper } from "./Paper";
import s from "./ReadingArticle.module.css";

/** The paid sections (the fixture sample has no observation; saved readings may carry a story, never shown). */
export type ReadingBody = Omit<TarotReadingData, "story" | "followUps">;

type ReadingArticleProps = {
  paid: ReadingBody;
};

/**
 * The opened reading: verdict callout, then every paid section in order. A saved reading may be
 * partial (an older version, edited storage): whatever part is missing or malformed is left out
 * instead of breaking the page (the chapter page says the reading is incomplete). The prose sections
 * show bold; the verdict, branches, messages and avoid list never do, and a copied message is plain text.
 */
export function ReadingArticle({ paid }: ReadingArticleProps) {
  const parts = partialTarotReading(paid);
  return (
    <div className={s.article}>
      {parts.verdict !== undefined ? (
        <aside className={s.verdict} aria-labelledby="verdict-label">
          <p id="verdict-label" className={s.verdictLabel}>
            한 줄 결론
          </p>
          <p className={s.verdictText}>{stripBold(parts.verdict)}</p>
        </aside>
      ) : null}

      {parts.cards.map((card) => (
        <Paper key={card.cardId} as="article">
          <p className={s.eyebrow}>{card.position}</p>
          <h2 className={s.heading}>{card.heading}</h2>
          <p className={s.prose}>
            <BoldText text={card.body} />
          </p>
        </Paper>
      ))}

      {parts.sections.map((section) => (
        <Paper key={section.heading}>
          <h2 className={s.heading}>{section.heading}</h2>
          <p className={s.prose}>
            <BoldText text={section.body} />
          </p>
        </Paper>
      ))}

      {parts.scenarios ? (
        <Paper>
          <h2 className={s.heading}>{parts.scenarios.heading}</h2>
          <ul className={s.scenarios}>
            {parts.scenarios.items.map((item) => (
              <li key={item.label} className={s.scenario}>
                <h3 className={s.scenarioLabel}>{stripBold(item.label)}</h3>
                <p>{stripBold(item.body)}</p>
              </li>
            ))}
          </ul>
        </Paper>
      ) : null}

      {parts.messages ? (
        <Paper>
          <h2 className={s.heading}>{parts.messages.heading}</h2>
          <ol className={s.messages}>
            {parts.messages.items.map((message, i) => (
              <li key={message} className={s.message}>
                <p className={s.quote}>{stripBold(message)}</p>
                <CopyButton text={stripBold(message)} label={`첫 문장 ${i + 1} 복사하기`} className={s.copy} />
              </li>
            ))}
          </ol>
          {parts.messages.hint ? <p className={s.hint}>{stripBold(parts.messages.hint)}</p> : null}
        </Paper>
      ) : null}

      {parts.avoid ? (
        <Paper>
          <h2 className={s.heading}>{parts.avoid.heading}</h2>
          <ul className={s.avoid}>
            {parts.avoid.items.map((item) => (
              <li key={item}>{stripBold(item)}</li>
            ))}
          </ul>
        </Paper>
      ) : null}

      {parts.alternatives ? (
        <Paper>
          <h2 className={s.heading}>{parts.alternatives.heading}</h2>
          <p className={s.prose}>
            <BoldText text={parts.alternatives.body} />
          </p>
        </Paper>
      ) : null}

      {parts.action ? (
        <Paper className={s.action}>
          <h2 className={s.heading}>
            <svg className={s.actionStar} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 2.5l2.6 6.1 6.6.6-5 4.4 1.5 6.5L12 16.7l-5.7 3.4 1.5-6.5-5-4.4 6.6-.6z" fill="currentColor" />
            </svg>
            {parts.action.heading}
          </h2>
          <p className={s.prose}>
            <BoldText text={parts.action.body} />
          </p>
        </Paper>
      ) : null}
    </div>
  );
}
