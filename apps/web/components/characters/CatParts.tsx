import type { ReactNode } from "react";
import { Face, type FaceSpec } from "./Face";
import { sparklePath, starPath } from "./shapes";
import type { Expression } from "./types";
import s from "./characters.module.css";

// Shared by both cat outfits, in the 300×300 art box.
export const CAT_FACE: FaceSpec = {
  eyes: [
    [120, 162],
    [180, 162],
  ],
  eyeRx: 13.5,
  eyeRy: 15.5,
  starEyes: true,
  nose: [150, 181],
  noseW: 6.5,
  philtrum: 3.5,
  lobe: 4.6,
  cheeks: [
    [100, 188],
    [200, 188],
  ],
  cheekRx: 13,
  cheekRy: 8,
};

const MIRROR = "matrix(-1 0 0 1 300 0)";

function Ear({ twitch }: { twitch?: boolean }) {
  return (
    <g className={twitch ? s.catEar : undefined}>
      <path d="M86 136C79 112 75 92 79 77C81 70 87 68 93 72C106 81 119 95 127 110Z" fill="url(#sl-cat-fur)" />
      <path d="M93 126C88 110 86 97 88 88C90 83 94 82 98 85C106 92 112 101 117 111Z" fill="url(#sl-ear)" />
    </g>
  );
}

export function CatEars() {
  return (
    <>
      <Ear twitch />
      <g transform={MIRROR}>
        <Ear />
      </g>
    </>
  );
}

/** Round head with chubby cheeks, forehead stripes, muzzle, whiskers and face. */
export function CatHead({ expression }: { expression: Expression }) {
  return (
    <g>
      <path d="M77 170C68 174 67 181 73 184C67 188 68 195 76 197C79 201 85 201 90 197Z" fill="#EBD8BE" />
      <path d="M223 170C232 174 233 181 227 184C233 188 232 195 224 197C221 201 215 201 210 197Z" fill="#DCC4A4" />
      <path d="M150 100C194 100 224 124 227 158C230 194 198 220 150 220C102 220 70 194 73 158C76 124 106 100 150 100Z" fill="url(#sl-cat-fur)" />
      <ellipse cx="116" cy="124" rx="22" ry="9" transform="rotate(-28 116 124)" fill="#fff" opacity=".5" filter="url(#sl-blush)" />
      <path d="M219 180C208 205 184 219 150 220" stroke="#DCD2FF" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".6" filter="url(#sl-blur)" />
      <g fill="#E0C197">
        <path d="M150 117C153.5 124 153.5 132 150 139C146.5 132 146.5 124 150 117Z" />
        <path d="M138.5 120C142.3 125.5 142 132 139 137C136 132 135.8 125.5 138.5 120Z" />
        <path d="M161.5 120C157.7 125.5 158 132 161 137C164 132 164.2 125.5 161.5 120Z" />
      </g>
      <ellipse cx="150" cy="191" rx="27" ry="16" fill="#FFFDF8" opacity=".75" filter="url(#sl-blur)" />
      <path d="M84 183L59 177M84 190L59 193M216 183L241 177M216 190L241 193" stroke="#CDB495" strokeWidth="1.6" strokeLinecap="round" />
      <Face spec={CAT_FACE} expression={expression} />
    </g>
  );
}

/** Striped tail curling up behind the right side; `tip` decorates the end. */
export function CatTail({ tip }: { tip?: ReactNode }) {
  return (
    <g className={s.tail}>
      <path d="M194 282C230 286 254 268 254 240C254 226 250 216 242 212C236 209 230 213 233 219C238 226 240 236 236 248C230 262 214 266 194 264Z" fill="url(#sl-cat-fur)" />
      <path d="M237.5 232C242 234 249 234 254 231M233 251C237 255 243 258 248 256" stroke="#E0C197" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      {tip}
    </g>
  );
}

export function TailStar() {
  return (
    <g>
      <circle cx="240" cy="209" r="11" fill="#F3DCA1" opacity=".45" filter="url(#sl-glow)" />
      <path d={starPath(240, 209, 8)} fill="url(#sl-gold)" stroke="#E9C46F" strokeWidth="1.6" strokeLinejoin="round" />
    </g>
  );
}

export function CatFeet() {
  return (
    <g>
      {[126, 174].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="283" rx="15" ry="8.5" fill="url(#sl-cat-fur)" />
          <path d={`M${x - 4} 281v4.5M${x + 4} 281v4.5`} stroke="#CDB495" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

export function CatPaw({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y} rx="12.5" ry="10" fill="url(#sl-cat-fur)" />
      <path d={`M${x - 3.6} ${y + 3}v5M${x + 3.6} ${y + 3}v5`} stroke="#CDB495" strokeWidth="1.4" strokeLinecap="round" />
    </g>
  );
}

function Card({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="20" height="30" rx="3" fill="url(#sl-card)" stroke="#FFE9B0" strokeWidth="1.2" />
      <rect x={x + 3} y={y + 3} width="14" height="24" rx="1.6" fill="none" stroke="#FFE9B0" strokeWidth=".8" opacity=".75" />
      <path d={sparklePath(x + 10, y + 15, 4.5)} fill="#FFE9B0" />
    </g>
  );
}

/** Deck cut in two halves above the paws; they riffle together every 1.6s. */
export function CardRiffle() {
  return (
    <g>
      <g className={s.riffleLeft}>
        <Card x={121} y={228} />
        <Card x={123} y={226} />
      </g>
      <g className={s.riffleRight}>
        <Card x={159} y={228} />
        <Card x={157} y={226} />
      </g>
      <g className={s.riffleFly}>
        <Card x={140} y={222} />
      </g>
    </g>
  );
}
