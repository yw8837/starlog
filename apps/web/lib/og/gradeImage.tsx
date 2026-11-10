import type { ReactElement } from "react";
import type { GradeLetter } from "@starlog/core";
import { GOLD, INK, INK_SUB, NIGHT, starField } from "./bondsImage";
import { OG_CARD, STORY } from "./cardsImage";

/**
 * 올해의 사주 등급's share pictures (spec 2026-11-11 C): the link preview (1200×630) and the story picture (1080×1920). The year,
 * the grade in a moon (the CSS badge's shapes), its nickname and line, 사주주 in hanbok (the owner's art, as PNG) and the host.
 * Only what the address holds: never a birth, an observation, a score or a share (확정 사항 2).
 */

export const GRADE_OG = OG_CARD;
export const GRADE_STORY = STORY;

export interface GradeOgData {
  /** "2026 병오년 · 올해의 사주 등급" */
  eyebrow: string;
  grade: GradeLetter;
  nickname: string;
  line: string;
  /** 사주주 as a PNG data URI; undefined when it could not be read */
  art?: string;
  host: string;
}

const SHADE = "#1b1748";
/** where the moon's shadow sits, as the card's CSS: none for S, a sliver for A, most for B, all for C */
const SHADOW_X: Readonly<Record<GradeLetter, number | null>> = { S: null, A: -24, B: 26, C: 50 };

/** Plain functions, not components: the picture's tree holds their elements as they are (satori and the route's test read it). */
function moon(grade: GradeLetter, px: number): ReactElement {
  const shadow = SHADOW_X[grade];
  const dark = grade === "B" || grade === "C";
  return (
    <div style={{ position: "relative", width: px, height: px, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={px} height={px} viewBox="0 0 100 100" style={{ position: "absolute", left: 0, top: 0 }}>
        <defs>
          <clipPath id="moon">
            <circle cx="50" cy="50" r="50" />
          </clipPath>
          <radialGradient id="lit" cx="38%" cy="34%" r="70%">
            <stop offset="0%" stopColor="#fff6d8" />
            <stop offset="45%" stopColor="#f3dca1" />
            <stop offset="100%" stopColor="#e2b95f" />
          </radialGradient>
        </defs>
        {/* elements only inside <svg>: satori refuses a fragment there */}
        {grade === "C" ? <circle cx="50" cy="50" r="48.5" fill={SHADE} stroke={GOLD} strokeOpacity="0.6" strokeWidth="2" /> : <circle cx="50" cy="50" r="50" fill="url(#lit)" />}
        {shadow === null || grade === "C" ? null : <circle cx={shadow} cy="50" r="50" fill={SHADE} clipPath="url(#moon)" />}
      </svg>
      <div style={{ display: "flex", color: dark ? GOLD : "#2b2140", fontFamily: "Serif", fontSize: Math.round(px * 0.54), fontWeight: 700, lineHeight: 1 }}>{grade}</div>
    </div>
  );
}

const artOf = (art: string | undefined, px: number): ReactElement | null =>
  // eslint-disable-next-line @next/next/no-img-element
  art ? <img src={art} width={px} height={px} /> : null;

export function gradeOgImage(data: GradeOgData, size: { width: number; height: number }): ReactElement {
  const { width, height } = size;
  const story = height > width;
  return (
    <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", backgroundColor: "#0d0a26", backgroundImage: NIGHT, color: INK, fontFamily: "Sans" }}>
      {starField(width, height, Math.round((width * height) / 14000))}
      {story ? (
        <div style={{ position: "absolute", left: 0, top: 0, width, height, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 210 }}>
          <div style={{ display: "flex", color: GOLD, fontSize: 44, fontWeight: 700, letterSpacing: 2 }}>{data.eyebrow}</div>
          <div style={{ display: "flex", marginTop: 70 }}>
            {moon(data.grade, 300)}
          </div>
          <div style={{ display: "flex", marginTop: 50, fontFamily: "Serif", fontSize: 88, fontWeight: 700 }}>{data.nickname}</div>
          <div style={{ display: "flex", marginTop: 30 }}>
            {artOf(data.art, 460)}
          </div>
          <div style={{ display: "flex", marginTop: 30, width: 820, justifyContent: "center", textAlign: "center", fontSize: 46, lineHeight: 1.5, wordBreak: "keep-all" }}>{data.line}</div>
          <div style={{ position: "absolute", bottom: 150, display: "flex", color: GOLD, fontSize: 38, letterSpacing: 3 }}>{data.host}</div>
        </div>
      ) : (
        <>
          <div style={{ position: "absolute", left: 70, top: 105, display: "flex" }}>
            {artOf(data.art, 420)}
          </div>
          <div style={{ position: "absolute", left: 520, top: 70, width: 620, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ display: "flex", color: GOLD, fontSize: 32, fontWeight: 700, letterSpacing: 2 }}>{data.eyebrow}</div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 30 }}>
              {moon(data.grade, 170)}
              <div style={{ display: "flex", marginLeft: 34, fontFamily: "Serif", fontSize: 64, fontWeight: 700, lineHeight: 1.25, width: 380, wordBreak: "keep-all" }}>{data.nickname}</div>
            </div>
            <div style={{ display: "flex", marginTop: 34, color: INK_SUB, fontSize: 34, lineHeight: 1.5, wordBreak: "keep-all" }}>{data.line}</div>
          </div>
          <div style={{ position: "absolute", left: 520, bottom: 56, display: "flex", color: GOLD, fontSize: 26, letterSpacing: 2 }}>{data.host}</div>
        </>
      )}
    </div>
  );
}

/** The characters each font draws, so the subsets fetched cover them. */
export function gradeOgText(data: GradeOgData): { serif: string; sans: string } {
  return { serif: `${data.grade}${data.nickname}`, sans: `${data.eyebrow}${data.line}${data.host}` };
}
