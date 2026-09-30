import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import s from "./GeneratingState.module.css";

type GeneratingStateProps = {
  /** Tarot: the cat reads, the rabbit librarian writes. Saju: roles swap, both in hanbok. */
  mode?: "tarot" | "saju";
  /** What is being written now (from the stream's section events). */
  caption: string;
  /** 0..1 */
  fraction: number;
  /** A calm line under the caption, e.g. how long it usually takes. */
  hint?: string;
  /**
   * `page`: the whole screen while a full reading is written (the page's only heading).
   * `inline`: in place of the text that is on its way, under the cards already shown.
   */
  layout?: "page" | "inline";
  /** The page keeps its own stable live region; this caption then stays plain text. */
  live?: boolean;
};

/** Waiting screen while a reading is written: the leader reads; the assistant joins near the end. */
export function GeneratingState({ mode = "tarot", caption, fraction, hint, layout = "page", live = true }: GeneratingStateProps) {
  const inline = layout === "inline";
  const size = inline ? 120 : 188;
  const late = fraction >= 0.7;

  return (
    <section className={inline ? `${s.stage} ${s.inline}` : s.stage} aria-labelledby="generating-title" aria-busy="true">
      {/* The page's only heading while a full reading is written; inline, a section heading. */}
      {inline ? (
        <h2 id="generating-title" className="sr-only">
          풀이를 적고 있어요
        </h2>
      ) : (
        <h1 id="generating-title" className="sr-only">
          풀이를 적고 있어요
        </h1>
      )}
      <div className={s.characters}>
        <span className={s.glow} aria-hidden="true" />
        {mode === "tarot" ? (
          <Cat outfit="tarot" action="glow" expression="focus" size={size} reactOnTap={false} />
        ) : (
          <Rabbit outfit="hanbok" expression="focus" size={size} reactOnTap={false} />
        )}
        {late && !inline ? (
          <span className={s.rabbit}>
            {mode === "tarot" ? (
              <Rabbit outfit="tarot" action="write" expression="focus" size={112} reactOnTap={false} />
            ) : (
              <Cat outfit="hanbok" expression="happy" size={112} reactOnTap={false} />
            )}
          </span>
        ) : null}
      </div>
      <p id="generating-caption" className={s.caption} role={live ? "status" : undefined}>
        {/* Re-keyed per caption to replay its fade. */}
        <span key={caption} className={s.captionText}>
          {caption}
        </span>
      </p>
      <div className={s.track} aria-hidden="true">
        <span className={s.fill} style={{ transform: `scaleX(${Math.max(0.04, fraction)})` }} />
      </div>
      {hint ? <p className={s.hint}>{hint}</p> : null}
    </section>
  );
}
