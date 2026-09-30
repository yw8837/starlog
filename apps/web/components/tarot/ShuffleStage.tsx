"use client";

import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/Button";
import { prefersReducedMotion } from "@/lib/motion";
import { wideArcStyle } from "./CardFan";
import fan from "./CardFan.module.css";
import s from "./ShuffleStage.module.css";

type ShuffleStageProps = {
  onDone: () => void;
  /** Put focus on "바로 펼치기" when the stage opens (the user asked for this shuffle). */
  focusSkip?: boolean;
};

/** One riffle: the deck splits in two, twelve cards spring back one by one, the pile squares up. */
const RIFFLE_MS = 1200;
const RIFFLES = 2;
/** Reduced motion: the stacked deck pulses in place, nothing travels. */
const GENTLE_MS = 800;
/** Cards in each half of the deck. */
const HALF = 6;
const SIDES = ["left", "right"] as const;

/**
 * The deck, cards only, where the fan will open (the fan's own geometry): it splits into two
 * stacks that riffle back together twice (~2.4s), then the fan opens out of it. Under reduced
 * motion the stacked deck pulses in place for 0.8s instead. 바로 펼치기 skips either way.
 */
export function ShuffleStage({ onDone, focusSkip = false }: ShuffleStageProps) {
  const [beat, setBeat] = useState(0);
  const skipRef = useRef<HTMLDivElement>(null);
  const finish = useEffectEvent(() => onDone());

  useEffect(() => {
    if (prefersReducedMotion()) {
      const timer = window.setTimeout(() => finish(), GENTLE_MS);
      return () => window.clearTimeout(timer);
    }
    const timers = [
      ...Array.from({ length: RIFFLES - 1 }, (_, i) => window.setTimeout(() => setBeat(i + 1), RIFFLE_MS * (i + 1))),
      window.setTimeout(() => finish(), RIFFLE_MS * RIFFLES),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  useEffect(() => {
    if (focusSkip) skipRef.current?.querySelector("button")?.focus();
  }, [focusSkip]);

  const timing = { ...wideArcStyle(), "--riffle": `${RIFFLE_MS}ms`, "--gentle": `${GENTLE_MS}ms` } as CSSProperties;

  return (
    <div className={`${fan.box} ${fan.wideBox}`}>
      <div className={`${fan.wide} ${s.scene}`} style={timing}>
        <div className={s.glow} aria-hidden="true" />
        {/* Keyed per riffle, so each one starts from the squared deck again. */}
        <div key={beat} className={s.deck} aria-hidden="true">
          <span className={s.floor} />
          {SIDES.map((side) => (
            <div key={side} className={s.half} data-side={side}>
              {Array.from({ length: HALF }, (_, n) => {
                // Top cards leave first, the two halves taking turns.
                const order = 2 * (HALF - 1 - n) + (side === "left" ? 0 : 1);
                return (
                  <span key={n} className={s.card} style={{ "--n": n, "--order": order } as CSSProperties}>
                    <img src="/cards/back.svg" alt="" draggable={false} />
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <div className={s.foot}>
          <p className={s.caption} role="status">
            카드를 섞고 있어요
          </p>
          <div ref={skipRef}>
            <Button variant="ghost" size="md" onClick={onDone}>
              바로 펼치기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
