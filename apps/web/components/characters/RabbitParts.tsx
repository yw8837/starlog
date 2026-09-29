import type { ReactNode } from "react";
import { Face, type FaceSpec } from "./Face";
import type { Expression } from "./types";
import s from "./characters.module.css";

// Shared by both rabbit outfits, in the 300×300 art box.
export const RABBIT_FACE: FaceSpec = {
  eyes: [
    [124, 167],
    [176, 167],
  ],
  eyeRx: 10.5,
  eyeRy: 12.5,
  nose: [150, 186],
  noseW: 5,
  philtrum: 3,
  lobe: 3.7,
  cheeks: [
    [102, 191],
    [198, 191],
  ],
  cheekRx: 12,
  cheekRy: 7.5,
  teeth: true,
};

/** Left ear stands up; the right ear folds over at the tip and twitches. */
export function RabbitEars() {
  return (
    <>
      <g>
        <path d="M112 128C100 96 96 56 104 32C110 16 124 18 128 34C134 60 136 96 136 124Z" fill="url(#sl-rabbit-fur)" />
        <path d="M114.5 118C106 92 104 62 109 42C112 33 119 33 122 42C127 64 129 92 129 116Z" fill="url(#sl-ear)" />
      </g>
      <g className={s.earFlop}>
        <path d="M166 124C168 94 176 64 190 48C198 40 208 42 210 52C212 70 202 100 190 128Z" fill="url(#sl-rabbit-fur)" />
        <path d="M171 116C173 92 180 70 190 58C195 53 201 55 202 60C203 74 196 96 186 118Z" fill="url(#sl-ear)" />
        <ellipse cx="200" cy="62" rx="10" ry="5" transform="rotate(20 200 62)" fill="#7A6A9A" opacity=".3" filter="url(#sl-blur)" />
        <path d="M189 50C197 38 213 38 224 48C232 56 235 70 232 84C230 89 225 89 223 84C220 72 212 62 198 58C193 57 190 54 189 50Z" fill="url(#sl-rabbit-fur)" />
        <path d="M197 45C207 42 218 46 225 54" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".8" />
      </g>
    </>
  );
}

/** Moves with the folded ear's twitch; draw it after the head so it sits on top. */
export function OnFoldedEar({ children }: { children: ReactNode }) {
  return <g className={s.earFlop}>{children}</g>;
}

export function RabbitHead({ expression }: { expression: Expression }) {
  return (
    <g>
      <path d="M150 110C192 110 219 132 221 164C223 198 192 222 150 222C108 222 77 198 79 164C81 132 108 110 150 110Z" fill="url(#sl-rabbit-fur)" />
      <ellipse cx="118" cy="132" rx="20" ry="8" transform="rotate(-26 118 132)" fill="#fff" opacity=".7" filter="url(#sl-blush)" />
      <path d="M213 184C203 206 182 221 150 222" stroke="#D8CFFF" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".7" filter="url(#sl-blur)" />
      <ellipse cx="150" cy="196" rx="24" ry="14" fill="#FFFFFF" opacity=".8" filter="url(#sl-blur)" />
      <Face spec={RABBIT_FACE} expression={expression} />
    </g>
  );
}

export function RabbitFeet() {
  return (
    <g>
      {[127, 173].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="284" rx="17" ry="8.5" fill="url(#sl-rabbit-fur)" />
          <path d={`M${x - 4} 282v4M${x + 4} 282v4`} stroke="#C9BFD9" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

export function RabbitPaw({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y} rx="11.5" ry="9.5" fill="url(#sl-rabbit-fur)" />
      <path d={`M${x - 3.4} ${y + 2.6}v4.6M${x + 3.4} ${y + 2.6}v4.6`} stroke="#C9BFD9" strokeWidth="1.3" strokeLinecap="round" />
    </g>
  );
}
