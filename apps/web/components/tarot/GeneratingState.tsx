"use client";

import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { timeFraction, waitLine, type ChecklistStep, type GenerationKind } from "@/lib/reading/progress";
import { useElapsed } from "@/lib/reading/useElapsed";
import s from "./GeneratingState.module.css";

/** How long a 기다리는 동안 line stays before the next one. */
const TIP_MS = 8000;

type GeneratingStateProps = {
  /** Tarot: the cat reads, the rabbit librarian writes. Saju: roles swap, both in hanbok. */
  mode?: "tarot" | "saju";
  /** What is being generated: its usual length sets the line under the bar and how the bar creeps. */
  kind: GenerationKind;
  /** What is being written now (from the stream's section events). */
  caption: string;
  /** 0..1 from the stream; the bar shows the larger of this and the time's share, so it never stands still. */
  fraction: number;
  /** A full reading's steps (checklist() in lib/reading/progress.ts); page only. */
  steps?: readonly ChecklistStep[];
  /** 기다리는 동안 lines (lib/reading/waitingTips.ts), one at a time; page only. */
  tips?: readonly string[];
  /**
   * `page`: the whole screen while a full reading is written (the page's only heading).
   * `inline`: in place of the text that is on its way, under the cards already shown.
   */
  layout?: "page" | "inline";
  /** The page keeps its own stable live region; this caption then stays plain text. */
  live?: boolean;
};

/**
 * Waiting screen while a reading is written: the leader reads; the assistant joins near the end. The clock
 * starts with this screen (when the generation starts) and runs on through a quality retry. Only the caption
 * may be a live region: the clock, the steps and the tips change quietly.
 */
export function GeneratingState({ mode = "tarot", kind, caption, fraction, steps = [], tips = [], layout = "page", live = true }: GeneratingStateProps) {
  const inline = layout === "inline";
  const size = inline ? 120 : 188;
  const late = fraction >= 0.7;
  const elapsed = useElapsed();
  // Both only grow, so the bar never moves back.
  const shown = Math.max(fraction, timeFraction(kind, elapsed));
  const tip = !inline && tips.length > 0 ? Math.floor(elapsed / TIP_MS) % tips.length : -1;

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
        <span className={s.fill} style={{ transform: `scaleX(${Math.max(0.04, shown)})` }} />
      </div>
      <p className={s.hint}>
        <span className={s.elapsed}>{waitLine(kind, elapsed)}</span>
        {inline ? null : <span className={s.stay}>이 화면을 열어 둔 채로 기다려 주세요.</span>}
      </p>
      {tip >= 0 ? (
        <div className={s.tip}>
          <p className={s.tipLabel}>기다리는 동안</p>
          {/* Re-keyed per line to replay its fade (a plain swap under reduced motion, globals.css). */}
          <p key={tip} className={s.tipText}>
            {tips[tip]}
          </p>
        </div>
      ) : null}
      {!inline && steps.length > 0 ? (
        <ol className={s.steps} aria-label="풀이 순서">
          {steps.map((step, index) => (
            <li key={index} className={s.step} data-state={step.state}>
              <span className={s.mark} aria-hidden="true">
                {step.state === "done" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : null}
              </span>
              <span>{step.label}</span>
              {step.state === "done" ? <span className="sr-only">, 다 적었어요</span> : step.state === "now" ? <span className="sr-only">, 적고 있어요</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
