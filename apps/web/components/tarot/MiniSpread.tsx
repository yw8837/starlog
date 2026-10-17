import type { CSSProperties } from "react";
import { sparklePath } from "@/components/characters/shapes";
import s from "./MiniSpread.module.css";

type SpreadKind = "three" | "celtic";

type MiniSpreadProps = {
  kind: SpreadKind;
  /** Sizes the picture (it fills a 60×60 box). */
  className?: string;
};

// 일반 타로: three backs fanned from one pivot under the middle card (box centre ≈ 30, 30).
const FAN = { w: 22, h: 35, pivotY: 49.5, rise: 20, turns: [-17, 0, 17] } as const;

// 켈틱 크로스 10장: the cross (1 centre, 2 across it, 3 below, 4 left, 5 above, 6 right) and the staff,
// 7 to 10 from the bottom up. Dealt in that order.
const CELTIC = { w: 8, h: 12.5 } as const;
const CELTIC_PLACES: readonly { x: number; y: number; turn?: number }[] = [
  { x: 21, y: 30 },
  { x: 21, y: 30, turn: 90 },
  { x: 21, y: 44.5 },
  { x: 9.25, y: 30 },
  { x: 21, y: 15.5 },
  { x: 32.75, y: 30 },
  { x: 50, y: 51 },
  { x: 50, y: 37 },
  { x: 50, y: 23 },
  { x: 50, y: 9 },
];

/**
 * A tiny spread for the 다리 화면 cards, drawn like the deck's back (navy, gold frame, a mark in the
 * middle): three backs in a fan, or the Celtic cross and its staff. Decorative only; the cards deal in
 * once and the fan opens a little on hover, both off under reduced motion.
 */
export function MiniSpread({ kind, className }: MiniSpreadProps) {
  return (
    <svg
      viewBox="0 0 60 60"
      className={className ? `${s.art} ${className}` : s.art}
      aria-hidden="true"
      focusable="false"
      data-spread={kind}
    >
      {kind === "three" ? (
        <g transform={`translate(30 ${FAN.pivotY})`}>
          {FAN.turns.map((turn, i) => (
            <g key={turn} className={s.slot} style={{ "--turn": `${turn}deg` } as CSSProperties}>
              <g transform={`translate(0 ${-FAN.rise})`}>
                <Back w={FAN.w} h={FAN.h} order={i} large />
              </g>
            </g>
          ))}
        </g>
      ) : (
        CELTIC_PLACES.map((place, i) => (
          <g key={i} transform={`translate(${place.x} ${place.y})${place.turn ? ` rotate(${place.turn})` : ""}`}>
            <Back w={CELTIC.w} h={CELTIC.h} order={i} />
          </g>
        ))
      )}
    </svg>
  );
}

/** One card back centred on (0, 0). */
function Back({ w, h, order, large = false }: { w: number; h: number; order: number; large?: boolean }) {
  const inset = large ? 2.2 : 1.15;
  return (
    <g className={s.deal} style={{ "--order": order } as CSSProperties} data-back="">
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={large ? 2.6 : 1.3} className={s.face} strokeWidth={large ? 0.7 : 0.45} />
      <rect
        x={-w / 2 + inset}
        y={-h / 2 + inset}
        width={w - inset * 2}
        height={h - inset * 2}
        rx={large ? 1.4 : 0.6}
        className={s.frame}
        strokeWidth={large ? 0.9 : 0.55}
      />
      {large ? <path d={sparklePath(0, 0, 4.4)} className={s.mark} /> : <circle r={0.95} className={s.mark} />}
    </g>
  );
}
