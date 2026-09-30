"use client";

import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import { Cat } from "@/components/characters/Cat";
import { CatPaw } from "@/components/characters/CatParts";
import { starPath } from "@/components/characters/shapes";
import { Button } from "@/components/ui/Button";
import { prefersReducedMotion } from "@/lib/motion";
import s from "./ShuffleStage.module.css";

type ShuffleStageProps = {
  onDone: () => void;
  /** Put focus on "바로 펼치기" when the stage opens (the user asked for this shuffle). */
  focusSkip?: boolean;
};

/** One riffle: the deck splits, ten cards spring back together, the pile squares up. */
const RIFFLE_MS = 1300;
const RIFFLES = 2;
/** After the riffles the cat fans the deck out in its paws, then the stage hands over. */
const FAN_MS = 600;
const SHUFFLE_MS = RIFFLE_MS * RIFFLES + FAN_MS;

const CAT_SIZE = 210;
/** Cards in each half of the deck. */
const HALF = 5;
const SIDES = ["left", "right"] as const;
/** The little fan the cat opens at the end (degrees). */
const FAN = [-33, -22, -11, 0, 11, 22, 33];
/** The cat's paws in its 300×300 art box (action "none"); drawn again over the deck so it sits between them. */
const PAWS = [
  [131, 259],
  [169, 259],
] as const;
// Sparkles over the deck as it fans out: start point in the art box and flight offset.
const SPARKS = [
  { x: 112, y: 196, dx: -22, dy: -26, r: 7 },
  { x: 190, y: 190, dx: 24, dy: -24, r: 8 },
  { x: 152, y: 176, dx: 2, dy: -34, r: 6 },
] as const;

/**
 * The cat riffles a small deck of card backs between its paws (twice, ~1.3s each), then fans it
 * open, ~3.2s in all. Skippable; skipped outright under reduced motion.
 */
export function ShuffleStage({ onDone, focusSkip = false }: ShuffleStageProps) {
  const [beat, setBeat] = useState(0);
  const skipRef = useRef<HTMLDivElement>(null);
  const finish = useEffectEvent(() => onDone());

  useEffect(() => {
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    const timers = [
      ...Array.from({ length: RIFFLES }, (_, i) => window.setTimeout(() => setBeat(i + 1), RIFFLE_MS * (i + 1))),
      window.setTimeout(() => finish(), SHUFFLE_MS),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  useEffect(() => {
    if (focusSkip) skipRef.current?.querySelector("button")?.focus();
  }, [focusSkip]);

  const fanning = beat >= RIFFLES;
  const scene = { "--size": `${CAT_SIZE}px`, "--riffle": `${RIFFLE_MS}ms` } as CSSProperties;

  return (
    <div className={s.stage}>
      <div className={s.scene} style={scene}>
        <div className={s.halo} aria-hidden="true" />
        <Cat outfit="tarot" expression={fanning ? "happy" : "focus"} size={CAT_SIZE} reactOnTap={false} label="카드를 섞는 점성술사 고양이" />
        {/* Deck and paws float with the cat (same idle float), so the paws stay on the cat's own. */}
        <div className={s.props} aria-hidden="true">
          <div key={beat} className={fanning ? s.deck : `${s.deck} ${s.squareUp}`}>
            {fanning
              ? FAN.map((angle, k) => (
                  <span key={k} className={`${s.card} ${s.fanned}`} style={{ "--a": `${angle}deg`, "--k": k } as CSSProperties}>
                    <img src="/cards/back.svg" alt="" draggable={false} />
                  </span>
                ))
              : SIDES.map((side) => (
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
          <svg className={s.paws} viewBox="0 0 300 300" focusable="false">
            {PAWS.map(([x, y]) => (
              <CatPaw key={x} x={x} y={y} />
            ))}
            {fanning
              ? SPARKS.map((spark, i) => (
                  <path
                    key={i}
                    className={s.spark}
                    d={starPath(spark.x, spark.y, spark.r)}
                    fill="url(#sl-gold)"
                    stroke="#FFE9B0"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                    style={{ "--dx": `${spark.dx}px`, "--dy": `${spark.dy}px`, "--delay": `${120 + i * 70}ms` } as CSSProperties}
                  />
                ))
              : null}
          </svg>
        </div>
      </div>
      <p className={s.caption} role="status">
        카드를 섞고 있어요
      </p>
      <div ref={skipRef}>
        <Button variant="ghost" size="md" onClick={onDone}>
          바로 펼치기
        </Button>
      </div>
    </div>
  );
}
