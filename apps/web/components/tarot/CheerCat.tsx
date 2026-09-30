"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Cat } from "@/components/characters/Cat";
import { starPath } from "@/components/characters/shapes";
import s from "./CheerCat.module.css";

type CheerCatProps = {
  /** Cards picked so far. Every time this goes up the cat cheers (hop, glow, star burst, happy face). */
  picks: number;
  /** The spread is complete: the cat keeps smiling. */
  done: boolean;
  /** Rendered size in px; place and scale it from the parent. */
  size?: number;
};

const CHEER_MS = 900;

// Stars that pop out around the cat's head on a cheer (art box units): start point and flight.
const BURST = [
  { x: 70, y: 120, dx: -24, dy: -22, r: 9 },
  { x: 228, y: 104, dx: 24, dy: -26, r: 10 },
  { x: 150, y: 58, dx: 0, dy: -30, r: 7 },
] as const;

/** The astrologer cat watching the fan; it reacts to each card the user picks. */
export function CheerCat({ picks, done, size = 128 }: CheerCatProps) {
  const [cheers, setCheers] = useState(0);
  const [happy, setHappy] = useState(false);
  const last = useRef(picks);

  useEffect(() => {
    const rose = picks > last.current;
    last.current = picks;
    if (!rose) {
      setHappy(false);
      return;
    }
    setCheers((n) => n + 1);
    setHappy(true);
    const timer = window.setTimeout(() => setHappy(false), CHEER_MS);
    return () => window.clearTimeout(timer);
  }, [picks]);

  return (
    // Two identical hop animations, swapped on every cheer, so each pick replays the hop.
    <div className={s.cheer} style={{ "--size": `${size}px` } as CSSProperties} data-cheer={cheers === 0 ? undefined : cheers % 2 ? "a" : "b"}>
      {cheers > 0 ? <span key={`glow-${cheers}`} className={s.glow} aria-hidden="true" /> : null}
      <div className={s.hop}>
        <Cat outfit="tarot" expression={happy || done ? "happy" : "idle"} size={size} reactOnTap={false} label="카드를 지켜보는 점성술사 고양이" />
      </div>
      {cheers > 0 ? (
        <svg key={`burst-${cheers}`} className={s.burst} viewBox="0 0 300 300" aria-hidden="true" focusable="false">
          {BURST.map((b, i) => (
            <path
              key={i}
              className={s.star}
              d={starPath(b.x, b.y, b.r)}
              fill="url(#sl-gold)"
              stroke="#FFE9B0"
              strokeWidth="1.5"
              strokeLinejoin="round"
              style={{ "--dx": `${b.dx}px`, "--dy": `${b.dy}px`, "--delay": `${i * 60}ms` } as CSSProperties}
            />
          ))}
        </svg>
      ) : null}
    </div>
  );
}
