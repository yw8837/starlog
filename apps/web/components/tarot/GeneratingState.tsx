"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import s from "./GeneratingState.module.css";

export const GENERATING_CAPTIONS = [
  "카드를 다시 읽는 중이에요",
  "세 장의 연결을 살피는 중이에요",
  "이야기로 옮겨 적는 중이에요",
] as const;

type GeneratingStateProps = {
  onDone: () => void;
  /** Fixture latency (P3 replaces it with the real generation). */
  duration?: number;
};

/** Waiting screen while a reading is written: the cat reads, the rabbit writes on the last step. */
export function GeneratingState({ onDone, duration = 2500 }: GeneratingStateProps) {
  const [step, setStep] = useState(0);
  const finish = useEffectEvent(() => onDone());

  useEffect(() => {
    const per = duration / GENERATING_CAPTIONS.length;
    const timers = [
      ...GENERATING_CAPTIONS.slice(1).map((_, i) => window.setTimeout(() => setStep(i + 1), per * (i + 1))),
      window.setTimeout(() => finish(), duration),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [duration]);

  const last = step === GENERATING_CAPTIONS.length - 1;

  return (
    <section className={s.stage} aria-labelledby="generating-caption">
      <div className={s.characters}>
        <span className={s.glow} aria-hidden="true" />
        <Cat outfit="tarot" action="glow" expression="focus" size={188} reactOnTap={false} />
        {last ? (
          <span className={s.rabbit}>
            <Rabbit outfit="tarot" action="write" expression="focus" size={112} reactOnTap={false} />
          </span>
        ) : null}
      </div>
      <p id="generating-caption" key={step} className={s.caption} role="status">
        {GENERATING_CAPTIONS[step]}
      </p>
      <ol className={s.dots} aria-hidden="true">
        {GENERATING_CAPTIONS.map((caption, i) => (
          <li key={caption} className={i <= step ? s.dotOn : undefined} />
        ))}
      </ol>
    </section>
  );
}
