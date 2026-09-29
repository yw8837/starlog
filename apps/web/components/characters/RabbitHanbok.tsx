import { Collar, Goreum } from "./HanbokParts";
import { Rim } from "./parts/Rim";
import { Sleeve } from "./parts/Sleeve";
import { DURUMAGI } from "./parts/silhouettes";
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

/** 두루마리 (명식): small rolled scroll with wooden knobs and a red tie, held upright at the side. */
function Scroll() {
  return (
    <g transform="rotate(-72 113 268)">
      <rect x="93" y="261.5" width="40" height="13" rx="6.5" fill="url(#sl-scroll)" />
      <path d="M99 265H127" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
      <ellipse cx="92" cy="268" rx="3" ry="7.6" fill="#8C3B3B" />
      <ellipse cx="134" cy="268" rx="3" ry="7.6" fill="#7A3030" />
      <rect x="123" y="261.5" width="3.4" height="13" fill="#C23A4E" />
    </g>
  );
}

/** Saju leader: the same rabbit in a long navy 두루마기 over a jade 저고리, holding a 붓 and a 두루마리. */
export function RabbitHanbok({ expression }: { expression: Expression }) {
  return (
    <g className={s.squish}>
      <path d={DURUMAGI} fill="url(#sl-durumagi)" />
      {/* jade 저고리 in the V, with its own small white 동정 */}
      <path d="M122 214L178 214L149 252Z" fill="#CFE8D7" />
      <path d="M134 220L149 236L164 220" stroke="#9FCBB0" strokeWidth="3" fill="none" />
      <path d="M135.5 218.5L149 233L162.5 218.5" stroke="#FFFFFF" strokeWidth="2" fill="none" />
      {/* front edge of the robe from the tie to the hem, with a lighter trim */}
      <path d="M137 259L135 291" stroke="#1B2352" strokeWidth="1.6" />
      <path d="M139.2 259.5L137.4 291" stroke="#8C98E6" strokeWidth="1.2" opacity=".75" />
      <Rim clip="sl-clip-durumagi" d="M86 286C91 278 97 267 101 254C107 233 121 217 150 217" color="#A9B3FF" width={6} opacity={0.65} />
      <Rim clip="sl-clip-durumagi" d="M150 217C179 217 193 233 199 254C203 267 209 278 214 286" color="#C2C9FF" width={6} opacity={0.6} />
      <Rim clip="sl-clip-durumagi" d="M86 286Q150 294 214 286" color="#8C98E6" width={4} opacity={0.55} />
      <Collar band="#1D2658" left={[126, 216]} right={[174, 216]} cross={[147, 247.5]} tie={[138, 258]} />
      <Goreum x={138} y={258} length={24} />
      <RabbitFeet />
      <RabbitEars />
      <RabbitHead expression={expression} />
      <Sleeve x={106} y={234} angle={-12} fill="url(#sl-durumagi)" width={27} length={35} />
      <Sleeve x={194} y={232} angle={40} fill="url(#sl-durumagi)" width={27} length={32} />
      <Scroll />
      <RabbitPaw x={113} y={269} />
      <Brush />
      <RabbitPaw x={174} y={258} />
    </g>
  );
}
