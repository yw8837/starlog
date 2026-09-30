"use client";

import { useEffect, useEffectEvent } from "react";
import { Cat } from "@/components/characters/Cat";
import { Button } from "@/components/ui/Button";
import { prefersReducedMotion } from "@/lib/motion";
import s from "./ShuffleStage.module.css";

type ShuffleStageProps = {
  onDone: () => void;
  /** How long the cat shuffles before the fan appears. */
  duration?: number;
};

/** The cat shuffles for ~1.8s, then hands over to the fan. Skippable; skipped outright under reduced motion. */
export function ShuffleStage({ onDone, duration = 1800 }: ShuffleStageProps) {
  const finish = useEffectEvent(() => onDone());

  useEffect(() => {
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    const timer = window.setTimeout(() => finish(), duration);
    return () => window.clearTimeout(timer);
  }, [duration]);

  return (
    <div className={s.stage}>
      <div className={s.halo} aria-hidden="true" />
      <Cat outfit="tarot" action="shuffle" expression="focus" size={176} reactOnTap={false} />
      <p className={s.caption} role="status">
        카드를 섞고 있어요
      </p>
      <Button variant="ghost" size="md" onClick={onDone}>
        바로 펼치기
      </Button>
    </div>
  );
}
