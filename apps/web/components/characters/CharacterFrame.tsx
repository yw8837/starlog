"use client";

import type { CSSProperties, ReactNode } from "react";
import { starPath } from "./shapes";
import type { Expression } from "./types";
import { useTapReaction } from "./useTapReaction";
import s from "./characters.module.css";

type CharacterFrameProps = {
  size: number;
  reactOnTap: boolean;
  label: string;
  /** Speech bubble shown for the length of a tap reaction. */
  line: string;
  expression: Expression;
  /** Draws the character in the 300×300 art box for the expression to show. */
  children: (expression: Expression) => ReactNode;
};

// Three stars that pop out around the head on a tap: start point and flight offset.
const BURST = [
  { x: 76, y: 124, dx: -26, dy: -24, r: 8 },
  { x: 222, y: 104, dx: 24, dy: -28, r: 9 },
  { x: 240, y: 156, dx: 30, dy: -4, r: 6 },
] as const;

/** Shared stage for a character: floor shadow, idle float, tap hop, star burst, speech bubble. */
export function CharacterFrame({ size, reactOnTap, label, line, expression, children }: CharacterFrameProps) {
  const { ref, active, tapId, trigger } = useTapReaction();
  const shown: Expression = active ? "happy" : expression;
  const style = { "--sl-size": `${size}px` } as CSSProperties;

  const layer = { viewBox: "0 0 300 300", width: size, height: size, "aria-hidden": true, focusable: false } as const;

  // Three stacked layers in one grid cell: the floor shadow, the character, the tap burst. The idle
  // float moves the character's HTML wrapper (a compositor transform), so the filtered SVG art is
  // not repainted on every frame; the shadow stays on the floor.
  const art = (
    <>
      <svg className={s.art} {...layer}>
        <ellipse className={s.shadow} cx="150" cy="287" rx="84" ry="9" fill="#05030F" opacity=".5" filter="url(#sl-soft)" />
      </svg>
      <span className={s.float}>
        <svg className={s.art} {...layer}>
          <g className={s.hop}>{children(shown)}</g>
        </svg>
      </span>
      <svg className={s.art} {...layer}>
        <g className={s.burst}>
          {BURST.map((b, i) => (
            <path
              key={i}
              className={s.burstStar}
              d={starPath(b.x, b.y, b.r)}
              fill="url(#sl-gold)"
              stroke="#FFE9B0"
              strokeWidth="1.5"
              strokeLinejoin="round"
              style={{ "--dx": `${b.dx}px`, "--dy": `${b.dy}px`, "--delay": `${i * 60}ms` } as CSSProperties}
            />
          ))}
        </g>
      </svg>
      {active && (
        // Keyed per tap: a re-tap mounts a fresh bubble, restarting its pop-in and fade-out.
        <span key={tapId} className={s.bubble} aria-hidden="true">
          {line}
        </span>
      )}
    </>
  );

  if (!reactOnTap) {
    return (
      <div className={s.frame} role="img" aria-label={label} style={style}>
        {art}
      </div>
    );
  }
  return (
    <button ref={ref} type="button" className={`${s.frame} ${s.tappable}`} aria-label={label} onClick={trigger} style={style}>
      {art}
    </button>
  );
}
