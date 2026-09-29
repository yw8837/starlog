import { CardRiffle, CatEars, CatFeet, CatHead, CatPaw, CatTail } from "./CatParts";
import { Collar, Goreum, Sleeve } from "./HanbokParts";
import { sparklePath } from "./shapes";
import type { CharacterAction, Expression } from "./types";
import s from "./characters.module.css";

/** 복주머니: gathered red pouch, gold cord and 복 medallion; (x, y) is the top of its neck. */
function Pouch({ x, y, glow }: { x: number; y: number; glow: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {glow && <circle className={s.pouchGlow} cx="0" cy="14" r="24" fill="#F3DCA1" opacity=".6" filter="url(#sl-soft)" />}
      <path d="M-10 2C-23 8 -22 30 0 31C22 30 23 8 10 2Z" fill="url(#sl-pouch)" />
      <path d="M-12 4Q-7 -4 0 0Q7 -4 12 4Q6 1 0 3.5Q-6 1 -12 4Z" fill="#E86478" />
      <path d="M-6 1C-11 -7 -4 -11 0 -3C4 -11 11 -7 6 1" stroke="url(#sl-gold)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="0" cy="-2" r="2.6" fill="url(#sl-gold)" />
      <circle cx="0" cy="17" r="6.2" fill="none" stroke="url(#sl-gold)" strokeWidth="1.6" />
      <path d={sparklePath(0, 17, 4)} fill="url(#sl-gold)" />
      <ellipse cx="-8.5" cy="12" rx="2.6" ry="5" transform="rotate(20 -8.5 12)" fill="#fff" opacity=".35" />
      {glow && <path className={s.crystalSpark} d={sparklePath(13, 8, 3.6)} fill="#FFE9B0" />}
    </g>
  );
}

/** Saju assistant: the same cream cat in a 색동 저고리, carrying a 복주머니. */
export function CatHanbok({ expression, action }: { expression: Expression; action: CharacterAction }) {
  const shuffling = action === "shuffle";
  return (
    <>
      <CatTail />
      <g className={s.squish}>
        <path d="M102 286C100 268 106 254 116 248H184C194 254 200 268 198 286Z" fill="url(#sl-navy)" />
        <path d="M150 216C122 216 104 232 99 254C98 260 100 265 107 266Q150 272 193 266C200 265 202 260 201 254C196 232 178 216 150 216Z" fill="url(#sl-jeogori)" />
        <Collar band="#3A4590" tieX={136} tieY={247} />
        <Goreum x={136} y={247} />
        <CatFeet />
        <CatEars />
        <CatHead expression={expression} />
        {shuffling ? (
          <>
            {/* pouch tied at the right hip while both paws handle the cards */}
            <Pouch x={186} y={258} glow={false} />
            <Sleeve x={110} y={231} angle={-36} fill="url(#sl-saekdong)" cuff="#FFFFFF" />
            <Sleeve x={190} y={231} angle={36} fill="url(#sl-saekdong)" cuff="#FFFFFF" />
            <CardRiffle />
            <CatPaw x={131} y={263} />
            <CatPaw x={169} y={263} />
          </>
        ) : (
          <>
            <Sleeve x={108} y={233} angle={-24} fill="url(#sl-saekdong)" cuff="#FFFFFF" />
            <CatPaw x={122} y={266} />
            <Sleeve x={192} y={233} angle={58} fill="url(#sl-saekdong)" cuff="#FFFFFF" length={30} />
            <Pouch x={166} y={252} glow={action === "glow"} />
            <CatPaw x={166} y={250} />
          </>
        )}
      </g>
    </>
  );
}
