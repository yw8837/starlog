import type { ReactElement } from "react";
import { GOLD, INK, INK_SUB, NIGHT, starField } from "./bondsImage";

/**
 * 2027년 나의 키워드's link preview (1200×630, the size Kakao keeps uncropped): the 일주, its keyword big, and
 * "2027년 나의 키워드 · 스타로그" with the host. Only the 일주 and its fixed keyword: never a birth date.
 */

export const KEYWORD_OG = { width: 1200, height: 630 } as const;

export interface KeywordOgData {
  /** "갑자" */
  iljuKo: string;
  keyword: string;
  /** "2027년 나의 키워드 · 스타로그" */
  footer: string;
  host: string;
}

export function keywordOgImage(data: KeywordOgData): ReactElement {
  const { width, height } = KEYWORD_OG;
  // Six syllables still fit the width at this size; shorter keywords get a little more.
  const size = data.keyword.replace(/\s/g, "").length > 4 ? 120 : 140;
  return (
    <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", backgroundColor: "#0d0a26", backgroundImage: NIGHT, color: INK, fontFamily: "Sans" }}>
      {starField(width, height, 60, 27)}
      <div style={{ position: "absolute", left: 0, top: 0, width, height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", color: GOLD, fontSize: 36, fontWeight: 700, letterSpacing: 2 }}>{`${data.iljuKo}일주의 2027년`}</div>
        <div style={{ display: "flex", marginTop: 26, padding: "0 60px", fontFamily: "Serif", fontSize: size, fontWeight: 700, lineHeight: 1.2, color: INK, textAlign: "center" }}>
          {data.keyword}
        </div>
        <div style={{ display: "flex", marginTop: 34, width: 120, height: 3, backgroundColor: GOLD, opacity: 0.7 }} />
        <div style={{ display: "flex", marginTop: 30, color: INK_SUB, fontSize: 32, fontWeight: 700 }}>{data.footer}</div>
      </div>
      <div style={{ position: "absolute", left: 0, bottom: 40, width, display: "flex", justifyContent: "center", color: GOLD, fontSize: 24, letterSpacing: 2 }}>{data.host}</div>
    </div>
  );
}

/** The characters each font draws, for the subset fetch (lib/og/googleFont.ts). */
export function keywordOgText(data: KeywordOgData): { serif: string; sans: string } {
  return { serif: data.keyword, sans: `${data.iljuKo}일주의 2027년 ${data.footer} ${data.host}` };
}
