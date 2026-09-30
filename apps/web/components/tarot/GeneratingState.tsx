"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import s from "./GeneratingState.module.css";

export const GENERATING_CAPTIONS = {
  tarot: ["카드를 다시 읽는 중이에요", "세 장의 연결을 살피는 중이에요", "이야기로 옮겨 적는 중이에요"],
  saju: ["명식을 다시 살피는 중이에요", "오행과 대운을 맞춰 보는 중이에요", "이야기로 옮겨 적는 중이에요"],
} as const;

type GeneratingStateProps = {
  onDone: () => void;
  /** Tarot: the cat reads, the rabbit librarian writes. Saju: roles swap, both in hanbok. */
  mode?: "tarot" | "saju";
  /** Fixture latency (P3 replaces it with the real generation). */
  duration?: number;
};

/** Waiting screen while a reading is written: the leader reads, the assistant joins on the last step. */
export function GeneratingState({ onDone, mode = "tarot", duration = 2500 }: GeneratingStateProps) {
  const [step, setStep] = useState(0);
  const finish = useEffectEvent(() => onDone());
  const captions = GENERATING_CAPTIONS[mode];

  useEffect(() => {
    const per = duration / captions.length;
    const timers = [
      ...captions.slice(1).map((_, i) => window.setTimeout(() => setStep(i + 1), per * (i + 1))),
      window.setTimeout(() => finish(), duration),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [duration, captions]);

  const last = step === captions.length - 1;

  return (
    <section className={s.stage} aria-labelledby="generating-title">
      {/* The page's only heading while the reading is written; the chapter view (with its own h1) replaces this screen. */}
      <h1 id="generating-title" className="sr-only">
        풀이를 적고 있어요
      </h1>
      <div className={s.characters}>
        <span className={s.glow} aria-hidden="true" />
        {mode === "tarot" ? (
          <Cat outfit="tarot" action="glow" expression="focus" size={188} reactOnTap={false} />
        ) : (
          <Rabbit outfit="hanbok" expression="focus" size={188} reactOnTap={false} />
        )}
        {last ? (
          <span className={s.rabbit}>
            {mode === "tarot" ? (
              <Rabbit outfit="tarot" action="write" expression="focus" size={112} reactOnTap={false} />
            ) : (
              <Cat outfit="hanbok" expression="happy" size={112} reactOnTap={false} />
            )}
          </span>
        ) : null}
      </div>
      {/* One live region for the whole wait; only the text inside it changes (the span re-keys to replay its fade). */}
      <p id="generating-caption" className={s.caption} role="status">
        <span key={step} className={s.captionText}>
          {captions[step]}
        </span>
      </p>
      <ol className={s.dots} aria-hidden="true">
        {captions.map((caption, i) => (
          <li key={caption} className={i <= step ? s.dotOn : undefined} />
        ))}
      </ol>
    </section>
  );
}
