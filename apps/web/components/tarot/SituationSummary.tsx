import s from "./SituationSummary.module.css";

type SituationSummaryProps = {
  conditions: Array<{ label: string; value: string }>;
  note: string;
  /** Characters of the note to show before cutting it with an ellipsis. */
  noteLimit?: number;
};

/** "선택한 상황": only the conditions the user picked, plus the start of their note. */
export function SituationSummary({ conditions, note, noteLimit = 48 }: SituationSummaryProps) {
  if (conditions.length === 0 && !note) return null;
  const excerpt = note.length > noteLimit ? `${note.slice(0, noteLimit).trimEnd()}…` : note;
  return (
    <section className={s.summary} aria-labelledby="situation-title">
      <h2 id="situation-title" className={s.title}>
        선택한 상황
      </h2>
      {conditions.length > 0 ? (
        <ul className={s.chips}>
          {conditions.map((c) => (
            <li key={c.label} className={s.chip}>
              <span className={s.label}>{c.label}</span>
              {c.value}
            </li>
          ))}
        </ul>
      ) : null}
      {excerpt ? <p className={s.note}>{`“${excerpt}”`}</p> : null}
    </section>
  );
}
