import { CardRiffle, CatEars, CatFeet, CatHead, CatPaw, CatTail, TailStar } from "./CatParts";
import { Rim } from "./parts/Rim";
import { CAPE_LEFT, CAPE_RIGHT } from "./parts/silhouettes";
import { sparklePath, starPath } from "./shapes";
import type { CharacterAction, Expression } from "./types";
import s from "./characters.module.css";

function Cape() {
  return (
    <g>
      <path d={CAPE_LEFT} fill="url(#sl-cape)" />
      <path d={CAPE_RIGHT} fill="url(#sl-cape)" />
      <Rim clip="sl-clip-cape" d="M96 258C104 236 124 224 150 224" color="#9C94F0" width={5} opacity={0.6} />
      <Rim clip="sl-clip-cape" d="M196 238C202 246 209 262 208 276C207 282 206 285 205 287" color="#B9B0FF" width={6} opacity={0.6} />
      <path d="M150 234C136 246 129 268 130 288M150 234C164 246 171 268 170 288" stroke="url(#sl-gold)" strokeWidth="1.8" fill="none" />
      <g fill="url(#sl-gold)">
        <path d={starPath(108, 262, 4.6)} />
        <path d={starPath(191, 268, 4.2)} />
        <path d={sparklePath(117, 279, 3.2)} />
        <path d={sparklePath(183, 249, 3)} />
      </g>
      <circle cx="150" cy="231" r="6.5" fill="url(#sl-gold)" />
      <circle cx="148" cy="229" r="1.9" fill="#fff" opacity=".85" />
    </g>
  );
}

function AstrologerHat() {
  return (
    <g className={s.hat}>
      <g transform="rotate(-7 150 104)">
        <ellipse cx="150" cy="120" rx="66" ry="8" fill="#1A1440" opacity=".28" filter="url(#sl-blush)" />
        <ellipse cx="150" cy="104" rx="80" ry="13" fill="url(#sl-brim)" />
        <path d="M71 102C90 94 210 94 229 102" stroke="#7C75D8" strokeWidth="1.6" fill="none" opacity=".6" />
        <path d="M96 104C106 78 124 46 144 18C150 9 160 9 164 18C180 50 196 78 204 104Q150 114 96 104Z" fill="url(#sl-hat)" />
        <path d="M106 98C116 74 128 50 142 26C132 52 122 76 116 100Z" fill="#fff" opacity=".13" />
        <path d="M146 22C150 6 166-2 180 2C191 5 197 14 197 26C189 17 177 13 167 17C162 19 160 24 160 28Z" fill="url(#sl-hat)" />
        <g className={s.hatStar}>
          <circle cx="198" cy="29" r="11" fill="#F3DCA1" opacity=".4" filter="url(#sl-glow)" />
          <path d={starPath(198, 29, 7.5)} fill="url(#sl-gold)" stroke="#E9C46F" strokeWidth="1.4" strokeLinejoin="round" />
        </g>
        <path d="M100 91Q150 100 200 91L203.5 101Q150 111 96.5 101Z" fill="url(#sl-gold)" />
        <path d="M102 93Q150 101 198 93" stroke="#FFF4D2" strokeWidth="1.2" fill="none" opacity=".8" />
        <path d="M134 55a12 12 0 1 0 12 16a9.5 9.5 0 1 1-12-16z" fill="url(#sl-gold)" />
        <path d={starPath(168, 60, 7)} fill="url(#sl-gold)" stroke="#E9C46F" strokeWidth="1" strokeLinejoin="round" />
        <circle cx="156" cy="38" r="1.6" fill="#FFE9B0" />
        <circle cx="181" cy="80" r="1.4" fill="#FFE9B0" />
        <circle cx="122" cy="86" r="1.3" fill="#FFE9B0" />
      </g>
    </g>
  );
}

function CrystalBall() {
  return (
    <g>
      <circle className={s.crystalGlow} cx="150" cy="251" r="30" fill="#CDB8FF" opacity=".6" filter="url(#sl-soft)" />
      <path d="M131 275Q150 268 169 275L173 284Q150 291 127 284Z" fill="url(#sl-gold)" />
      <circle cx="150" cy="251" r="21" fill="url(#sl-crystal)" />
      <path d="M139 257q8 6 17-1q6-6 2-12" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".55" />
      <ellipse cx="143" cy="242" rx="6" ry="3.6" transform="rotate(-32 143 242)" fill="#fff" opacity=".9" />
      <path className={s.crystalSpark} d={sparklePath(158, 257, 4.2)} fill="#FFE9B0" />
    </g>
  );
}

/** Tarot leader: cream astrologer cat in a navy star cape and bent-tip hat. */
export function CatTarot({ expression, action }: { expression: Expression; action: CharacterAction }) {
  return (
    <>
      <CatTail tip={<TailStar />} />
      <g className={s.squish}>
        <path d="M100 286C96 246 116 216 150 216C184 216 204 246 200 286Z" fill="url(#sl-cat-fur)" />
        <ellipse cx="150" cy="262" rx="20" ry="22" fill="#FFFDF8" opacity=".6" filter="url(#sl-blur)" />
        <Cape />
        <CatFeet />
        <CatEars />
        <CatHead expression={expression} />
        {action === "glow" ? (
          <>
            <CrystalBall />
            <CatPaw x={126} y={258} />
            <CatPaw x={174} y={258} />
          </>
        ) : action === "shuffle" ? (
          <>
            <CardRiffle />
            <CatPaw x={133} y={263} />
            <CatPaw x={167} y={263} />
          </>
        ) : (
          <>
            <CatPaw x={131} y={259} />
            <CatPaw x={169} y={259} />
          </>
        )}
      </g>
      <AstrologerHat />
    </>
  );
}
