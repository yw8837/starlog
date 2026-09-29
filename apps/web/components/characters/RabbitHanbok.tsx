import { Collar, Goreum, Sleeve } from "./HanbokParts";
import { RabbitEars, RabbitFeet, RabbitHead, RabbitPaw } from "./RabbitParts";
import type { Expression } from "./types";
import s from "./characters.module.css";

/** 붓: bamboo handle, cream ferrule, ink-black tuft; tip at the origin, handle pointing up. */
function Brush() {
  return (
    <g className={s.brush}>
      <g transform="translate(169 281) rotate(22)">
        <path d="M0 0C-4 -4 -5.2 -10 -4.4 -15H4.4C5.2 -10 4 -4 0 0Z" fill="#2B2340" />
        <path d="M-1.6 -12C-1.4 -8 -0.8 -5 0 -2" stroke="#6A5E86" strokeWidth="1" strokeLinecap="round" fill="none" />
        <rect x="-4.4" y="-19.5" width="8.8" height="5" rx="1" fill="#EADFC4" />
        <rect x="-3" y="-66" width="6" height="47" rx="2.4" fill="url(#sl-bamboo)" />
        <path d="M-3 -36H3M-3 -53H3" stroke="#9E7B3C" strokeWidth="1.2" />
        <ellipse cx="0" cy="-69.5" rx="2.8" ry="4" fill="none" stroke="#C23A4E" strokeWidth="1.6" />
      </g>
    </g>
  );
}

/** 두루마리 (명식): small rolled scroll with wooden knobs and a red tie. */
function Scroll() {
  return (
    <g transform="rotate(-10 116 272)">
      <rect x="95" y="265.5" width="42" height="13" rx="6.5" fill="url(#sl-scroll)" />
      <path d="M101 269H131" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
      <ellipse cx="94" cy="272" rx="3" ry="7.6" fill="#8C3B3B" />
      <ellipse cx="138" cy="272" rx="3" ry="7.6" fill="#7A3030" />
      <rect x="129" y="265.5" width="3.4" height="13" fill="#C23A4E" />
    </g>
  );
}

/** Saju leader: the same rabbit in a navy 두루마기 over a 저고리, holding a 붓 and a 두루마리. */
export function RabbitHanbok({ expression }: { expression: Expression }) {
  return (
    <g className={s.squish}>
      <path d="M98 288C94 248 114 218 150 218C186 218 206 248 202 288Z" fill="url(#sl-navy)" />
      <path d="M131 216L150 236L169 216Z" fill="#D6EBDD" />
      <path d="M170 219L134 251V288" stroke="#18204C" strokeWidth="1.6" fill="none" />
      <path d="M172 221L136.5 252.5V288" stroke="#5E6CC0" strokeWidth="1" fill="none" opacity=".6" />
      <path d="M98.5 288C94.5 262 100 240 117 226M201.5 288C205.5 262 200 240 183 226" stroke="#A3ADFF" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".5" filter="url(#sl-blur)" />
      <Collar band="#1D2658" tieX={134} tieY={250} />
      <Goreum x={134} y={250} />
      <RabbitFeet />
      <RabbitEars />
      <RabbitHead expression={expression} />
      <Sleeve x={106} y={234} angle={-20} fill="url(#sl-navy)" width={27} length={36} />
      <Sleeve x={194} y={232} angle={40} fill="url(#sl-navy)" width={27} length={32} />
      <Scroll />
      <RabbitPaw x={118} y={269} />
      <Brush />
      <RabbitPaw x={174} y={258} />
    </g>
  );
}
