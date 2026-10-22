import type { ReactElement } from "react";
import { BIRTH_CARD_TITLE } from "@/lib/birthCard";
import { GOLD, INK, INK_SUB, NIGHT, starField } from "./bondsImage";

/**
 * 나를 닮은 타로 카드's link preview (1200×630, the size Kakao keeps uncropped): the card's Starlog face on
 * the left, the test's name, the card's numeral and name and its first trait on the right. Only the card:
 * nobody's birth date is ever drawn (there is none to draw: the route knows the slug alone).
 */

export const BIRTH_CARD_OG = { width: 1200, height: 630 } as const;

export interface BirthCardOgData {
  roman: string;
  name: string;
  trait: string;
  /** The face as a JPEG data URI (satori cannot decode WebP); undefined when it could not be read. */
  face?: string;
  host: string;
}

/** The JPEG's own 240×416: scaled up it only blurs, and the PNG grows by a fifth (470 KB against 380 KB). */
const FACE = { width: 240, height: 416 } as const;
const LINE = `${BIRTH_CARD_TITLE} · 스타로그`;

/** Long names (운명의 수레바퀴) step down so they stay on one line beside the card. */
const nameSize = (name: string) => (name.length <= 3 ? 112 : name.length <= 5 ? 92 : 72);

export function birthCardOgImage(data: BirthCardOgData): ReactElement {
  const { width, height } = BIRTH_CARD_OG;
  return (
    <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", backgroundColor: "#0d0a26", backgroundImage: NIGHT, color: INK, fontFamily: "Sans" }}>
      {starField(width, height, Math.round((width * height) / 14000))}
      <div style={{ position: "absolute", left: 140, top: (height - FACE.height) / 2, display: "flex" }}>
        {data.face ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.face} width={FACE.width} height={FACE.height} style={{ borderRadius: 16, boxShadow: "0 22px 48px rgba(5,3,15,0.55)" }} />
        ) : (
          <div
            style={{
              width: FACE.width,
              height: FACE.height,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              border: `4px solid ${GOLD}`,
              backgroundImage: "linear-gradient(160deg, #3a3290 0%, #1d1850 100%)",
              color: GOLD,
              fontFamily: "Serif",
              fontSize: 72,
              fontWeight: 700,
            }}
          >
            {data.roman}
          </div>
        )}
      </div>
      <div style={{ position: "absolute", left: 480, top: 150, width: 640, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", color: GOLD, fontSize: 32, fontWeight: 700, letterSpacing: 2 }}>{LINE}</div>
        <div style={{ display: "flex", marginTop: 34, color: GOLD, fontFamily: "Serif", fontSize: 40, fontWeight: 700 }}>{data.roman}</div>
        <div style={{ display: "flex", marginTop: 4, fontFamily: "Serif", fontSize: nameSize(data.name), fontWeight: 700, lineHeight: 1.2 }}>{data.name}</div>
        <div style={{ display: "flex", marginTop: 26, color: INK_SUB, fontSize: 34, lineHeight: 1.45 }}>{data.trait}</div>
      </div>
      <div style={{ position: "absolute", left: 480, bottom: 64, display: "flex", color: GOLD, fontSize: 26, letterSpacing: 2 }}>{data.host}</div>
    </div>
  );
}

/** The characters each font draws, so the subsets fetched for the image cover them. */
export function birthCardOgText(data: BirthCardOgData): { serif: string; sans: string } {
  return { serif: `${data.roman}${data.name}`, sans: `${LINE}${data.trait}${data.host}` };
}
