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

/** The heading parts of a 3-card reading, in the order shown (each only when the reading has it). */
type PartKey = "connection" | "timing" | "observation" | "scenarios" | "messages" | "avoid" | "alternatives" | "action";

/**
 * 골라 읽기 (spec 2026-11-26 beyond trend §2): the fixed ids of a reading's places, in the order shown: card-1… for the
 * card sections, part-1… for every heading after them. Built from what the reading holds (partialTarotReading), so a
 * reading saved earlier (one heading fewer, say) gets ids for exactly the places it shows. Nothing stored changes.
 */
export function tarotAnchors(paid: ReadingBody): { cards: Array<{ id: string; position: string }>; parts: Array<{ id: string; key: PartKey }> } {
  const parts = partialTarotReading(paid);
  // partialTarotReading keeps the reading's own section objects, so each one is told by identity.
  const keys: PartKey[] = parts.sections.map((section) => (section === paid.connection ? "connection" : section === paid.timing ? "timing" : "observation"));
  for (const key of ["scenarios", "messages", "avoid", "alternatives", "action"] as const) if (parts[key]) keys.push(key);
  return {
    cards: parts.cards.map((card, i) => ({ id: `card-${i + 1}`, position: card.position })),
    parts: keys.map((key, i) => ({ id: `part-${i + 1}`, key })),
  };
}

/** The jump row of an opened 3-card reading (§2): its three positions by their real names, then 앞으로 and 할 일. */
export function tarotJumpItems(paid: ReadingBody): Array<{ id: string; label: string }> {
  const { cards, parts } = tarotAnchors(paid);
  const part = (key: PartKey, label: string) => parts.filter((p) => p.key === key).map((p) => ({ id: p.id, label }));
  return [...cards.map((card) => ({ id: card.id, label: card.position })), ...part("timing", "앞으로"), ...part("action", "할 일")];
}

/**
 * The opened reading: verdict callout, then every paid section in order. A saved reading may be
 * partial (an older version, edited storage): whatever part is missing or malformed is left out
 * instead of breaking the page (the chapter page says the reading is incomplete). The prose sections
 * show bold; the verdict, branches, messages and avoid list never do, and a copied message is plain text.
 */
export function ReadingArticle({ paid }: ReadingArticleProps) {
  const parts = partialTarotReading(paid);
  const anchors = tarotAnchors(paid);
  // Where a jump lands: an id, focusable by script so a screen reader reads on from it (골라 읽기, §2).
  const place = (key: PartKey) => ({ id: anchors.parts.find((p) => p.key === key)?.id, tabIndex: -1 });
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

      {parts.cards.map((card, i) => (
        <Paper key={card.cardId} as="article" id={anchors.cards[i]!.id} tabIndex={-1}>
          <p className={s.eyebrow}>{card.position}</p>
          <h2 className={s.heading}>{card.heading}</h2>
          <p className={s.prose}>
            <BoldText text={card.body} />
          </p>
        </Paper>
      ))}

      {parts.sections.map((section, i) => (
        <Paper key={section.heading} id={anchors.parts[i]!.id} tabIndex={-1}>
          <h2 className={s.heading}>{section.heading}</h2>
          <p className={s.prose}>
            <BoldText text={section.body} />
          </p>
        </Paper>
      ))}

      {parts.scenarios ? (
        <Paper {...place("scenarios")}>
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
        <Paper {...place("messages")}>
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
        <Paper {...place("avoid")}>
          <h2 className={s.heading}>{parts.avoid.heading}</h2>
          <ul className={s.avoid}>
            {parts.avoid.items.map((item) => (
              <li key={item}>{stripBold(item)}</li>
            ))}
          </ul>
        </Paper>
      ) : null}

      {parts.alternatives ? (
        <Paper {...place("alternatives")}>
          <h2 className={s.heading}>{parts.alternatives.heading}</h2>
          <p className={s.prose}>
            <BoldText text={parts.alternatives.body} />
          </p>
        </Paper>
      ) : null}

      {parts.action ? (
        <Paper className={s.action} {...place("action")}>
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
