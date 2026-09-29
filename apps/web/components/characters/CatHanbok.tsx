import { CardRiffle, CatEars, CatFeet, CatHead, CatPaw, CatTail, TailStar } from "./CatParts";
import { Collar, Goreum } from "./HanbokParts";
import { Sleeve } from "./parts/Sleeve";
import { sparklePath } from "./shapes";
import type { CharacterAction, Expression } from "./types";
import s from "./characters.module.css";

/** 복주머니 body: gathered red pouch with a gold 복 medallion; (x, y) is the top of its neck. */
function Pouch({ x, y, glow }: { x: number; y: number; glow: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(.85)`}>
      {glow && <circle className={s.pouchGlow} cx="0" cy="15" r="24" fill="#F3DCA1" opacity=".6" filter="url(#sl-soft)" />}
      <path d="M-10 2C-23 8 -22 30 0 31C22 30 23 8 10 2Z" fill="url(#sl-pouch)" />
      <path d="M-12 4Q-7 -4 0 0Q7 -4 12 4Q6 1 0 3.5Q-6 1 -12 4Z" fill="#E86478" />
      <circle cx="0" cy="17" r="6.2" fill="none" stroke="url(#sl-gold)" strokeWidth="1.6" />
      <path d={sparklePath(0, 17, 4)} fill="url(#sl-gold)" />
      <ellipse cx="-8.5" cy="12" rx="2.6" ry="5" transform="rotate(20 -8.5 12)" fill="#fff" opacity=".35" />
      {glow && <path className={s.crystalSpark} d={sparklePath(13, 8, 3.6)} fill="#FFE9B0" />}
    </g>
  );
}

/** The pouch dangling on its gold string from a paw at (x, y): string loop above, pouch below. */
function PouchInPaw({ x, y, glow }: { x: number; y: number; glow: boolean }) {
  return (
    <g>
      <path d={`M${x} ${y + 12}V${y - 6}`} stroke="url(#sl-gold)" strokeWidth="1.8" />
      <Pouch x={x} y={y + 12} glow={glow} />
      <CatPaw x={x} y={y} />
      <path d={`M${x - 1.5} ${y - 8}c-5 -8 6 -11 3 -1`} stroke="#E9C46F" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </g>
  );
}

/** Saju assistant: the same cream cat in a 색동 저고리 and navy 바지, carrying a 복주머니. */
export function CatHanbok({ expression, action }: { expression: Expression; action: CharacterAction }) {
  const shuffling = action === "shuffle";
  return (
    <>
      <CatTail tip={<TailStar />} />
      <g className={s.squish}>
        <path d="M104 286C101 272 104 262 110 256H190C196 262 199 272 196 286Z" fill="url(#sl-navy)" />
        <path d="M150 268V284" stroke="#1B2352" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M150 216C122 216 104 232 99 254C98 260 100 265 107 266Q150 272 193 266C200 265 202 260 201 254C196 232 178 216 150 216Z" fill="url(#sl-jeogori)" />
        <Collar band="#3A4590" left={[130, 217]} right={[170, 217]} cross={[151, 238]} tie={[136, 246]} />
        <Goreum x={136} y={246} length={18} />
        <CatFeet />
        <CatEars />
        <CatHead expression={expression} />
        {shuffling ? (
          <>
            {/* pouch tied at the right hip while both paws handle the cards */}
            <Pouch x={188} y={258} glow={false} />
            <Sleeve x={110} y={231} angle={-36} fill="url(#sl-saekdong)" cuff="#FFFFFF" />
            <Sleeve x={190} y={231} angle={36} fill="url(#sl-saekdong)" cuff="#FFFFFF" />
            <CardRiffle />
            <CatPaw x={131} y={263} />
            <CatPaw x={169} y={263} />
          </>
        ) : (
          <>
            <Sleeve x={108} y={233} angle={6} fill="url(#sl-saekdong)" cuff="#FFFFFF" length={32} />
            <CatPaw x={105} y={266} />
            <Sleeve x={192} y={233} angle={70} fill="url(#sl-saekdong)" cuff="#FFFFFF" length={28} />
            <PouchInPaw x={167} y={243} glow={action === "glow"} />
          </>
        )}
      </g>
    </>
  );
}
