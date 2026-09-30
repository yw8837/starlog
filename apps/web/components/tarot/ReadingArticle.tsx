import type { TarotReadingData } from "@/lib/reading/types";
import { CopyButton } from "./CopyButton";
import { Paper } from "./Paper";
import s from "./ReadingArticle.module.css";

/** The paid sections (the fixture sample has no observation; saved readings may carry a story, never shown). */
export type ReadingBody = Omit<TarotReadingData, "story" | "followUps">;

type ReadingArticleProps = {
  paid: ReadingBody;
};

/** The opened reading: verdict callout, then every paid section in order. */
export function ReadingArticle({ paid }: ReadingArticleProps) {
  return (
    <div className={s.article}>
      <aside className={s.verdict} aria-labelledby="verdict-label">
        <p id="verdict-label" className={s.verdictLabel}>
          한 줄 결론
        </p>
        <p className={s.verdictText}>{paid.verdict}</p>
      </aside>

      {paid.cards.map((card) => (
        <Paper key={card.cardId} as="article">
          <p className={s.eyebrow}>{card.position}</p>
          <h2 className={s.heading}>{card.heading}</h2>
          <p className={s.prose}>{card.body}</p>
        </Paper>
      ))}

      {[paid.connection, paid.timing, ...(paid.observation ? [paid.observation] : [])].map((section) => (
        <Paper key={section.heading}>
          <h2 className={s.heading}>{section.heading}</h2>
          <p className={s.prose}>{section.body}</p>
        </Paper>
      ))}

      <Paper>
        <h2 className={s.heading}>{paid.scenarios.heading}</h2>
        <ul className={s.scenarios}>
          {paid.scenarios.items.map((item) => (
            <li key={item.label} className={s.scenario}>
              <h3 className={s.scenarioLabel}>{item.label}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      </Paper>

      <Paper>
        <h2 className={s.heading}>{paid.messages.heading}</h2>
        <ol className={s.messages}>
          {paid.messages.items.map((message, i) => (
            <li key={message} className={s.message}>
              <p className={s.quote}>{message}</p>
              <CopyButton text={message} label={`첫 문장 ${i + 1} 복사하기`} className={s.copy} />
            </li>
          ))}
        </ol>
        <p className={s.hint}>{paid.messages.hint}</p>
      </Paper>

      <Paper>
        <h2 className={s.heading}>{paid.avoid.heading}</h2>
        <ul className={s.avoid}>
          {paid.avoid.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Paper>

      <Paper>
        <h2 className={s.heading}>{paid.alternatives.heading}</h2>
        <p className={s.prose}>{paid.alternatives.body}</p>
      </Paper>

      <Paper className={s.action}>
        <h2 className={s.heading}>
          <svg className={s.actionStar} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 2.5l2.6 6.1 6.6.6-5 4.4 1.5 6.5L12 16.7l-5.7 3.4 1.5-6.5-5-4.4 6.6-.6z" fill="currentColor" />
          </svg>
          {paid.action.heading}
        </h2>
        <p className={s.prose}>{paid.action.body}</p>
      </Paper>
    </div>
  );
}
