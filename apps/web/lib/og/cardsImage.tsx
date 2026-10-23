import type { ReactElement } from "react";
import { LUCKY_NOTICE, getCard, getConstellation, type Orientation, type SignId } from "@starlog/core";
import { GOLD, INK, INK_SUB, NIGHT, constellationSvg, starField } from "./bondsImage";

/**
 * The other share images (spec §9): the invite link's OG card, 오늘의 한 장, a chapter title card and
 * the weekly lucky numbers. Cards are drawn as framed name plates (satori cannot decode the WebP
 * scans). Never a question, a note or birth data.
 */

export const OG_CARD = { width: 1200, height: 630 } as const;
export const STORY = { width: 1080, height: 1920 } as const;

/** One card as a gold-framed plate: roman numeral or suit rank, the Korean name, 역방향 when reversed. */
function CardPlate({ cardId, orientation, width }: { cardId: string; orientation: Orientation; width: number }): ReactElement {
  const card = getCard(cardId);
  const height = Math.round(width * 1.62);
  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Math.round(width * 0.08),
        border: `4px solid ${GOLD}`,
        backgroundImage: "linear-gradient(160deg, #3a3290 0%, #1d1850 100%)",
        boxShadow: "0 18px 40px rgba(5,3,15,0.5)",
        color: INK,
      }}
    >
      {card.roman ? (
        <div style={{ display: "flex", color: GOLD, fontFamily: "Serif", fontSize: Math.round(width * 0.16), fontWeight: 700 }}>{card.roman}</div>
      ) : null}
      <div style={{ display: "flex", marginTop: 18, padding: "0 12px", textAlign: "center", fontFamily: "Serif", fontSize: Math.round(width * 0.13), fontWeight: 700 }}>
        {card.names.ko}
      </div>
      {orientation === "reversed" ? (
        <div style={{ display: "flex", marginTop: 10, color: INK_SUB, fontSize: Math.round(width * 0.08) }}>역방향</div>
      ) : null}
    </div>
  );
}

const frame = (width: number, height: number, children: ReactElement[] | ReactElement): ReactElement => (
  <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", backgroundColor: "#0d0a26", backgroundImage: NIGHT, color: INK, fontFamily: "Sans" }}>
    {starField(width, height, Math.round((width * height) / 14000))}
    {children}
  </div>
);

// ---- invite OG (1200×630) ----

export interface InviteOgData {
  /** null when the code is unknown or revoked: a generic card */
  ownerNickname: string | null;
  sign: SignId | null;
  filled: number;
  host: string;
}

export function inviteOgImage(data: InviteOgData): ReactElement {
  const { width, height } = OG_CARD;
  const def = data.sign ? getConstellation(data.sign) : null;
  const headline = data.ownerNickname && def ? `${data.ownerNickname}님의 ${def.ko} ${data.filled}/${def.slots}` : "별자리 인연 초대";
  return frame(width, height, [
    <div key="art" style={{ position: "absolute", right: 70, top: 55, display: "flex" }}>
      {constellationSvg(data.sign ?? "libra", 520, def ? data.filled : 2)}
    </div>,
    <div key="text" style={{ position: "absolute", left: 80, top: 150, width: 600, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", color: GOLD, fontSize: 30, fontWeight: 700, letterSpacing: 5 }}>별자리 인연</div>
      <div style={{ display: "flex", marginTop: 18, fontFamily: "Serif", fontSize: 64, fontWeight: 700, lineHeight: 1.25 }}>{headline}</div>
      <div style={{ display: "flex", marginTop: 22, color: INK_SUB, fontSize: 36 }}>
        {def ? "내 별자리에 별이 되어 주세요" : "친구의 별자리에 별이 되어 주세요"}
      </div>
    </div>,
    <div key="host" style={{ position: "absolute", left: 80, bottom: 56, display: "flex", color: GOLD, fontSize: 26, letterSpacing: 2 }}>
      {data.host}
    </div>,
  ]);
}

export function inviteOgText(data: InviteOgData): { serif: string; sans: string } {
  const def = data.sign ? getConstellation(data.sign) : null;
  return {
    serif: `${data.ownerNickname ?? ""}님의 ${def?.ko ?? ""} ${data.filled}/${def?.slots ?? ""} 별자리 인연 초대`,
    sans: `별자리 인연 내 친구의 별자리에 별이 되어 주세요 ${data.host}`,
  };
}

// ---- 이번 주 행운 번호 (story) ----

export interface LuckyShareData {
  numbers: number[];
  week: string;
  host: string;
}

export function luckyShareImage(data: LuckyShareData): ReactElement {
  const { width, height } = STORY;
  return frame(width, height, [
    <div key="body" style={{ position: "absolute", left: 0, top: 470, width, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", color: GOLD, fontSize: 36, fontWeight: 700, letterSpacing: 6 }}>이번 주 행운 번호</div>
      <div style={{ display: "flex", marginTop: 14, color: INK_SUB, fontSize: 32 }}>{data.week}</div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", marginTop: 110, width: 840, gap: 30 }}>
        {data.numbers.map((n) => (
          <div
            key={n}
            style={{
              width: 220,
              height: 220,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
              border: `6px solid ${GOLD}`,
              backgroundImage: "radial-gradient(circle at 40% 35%, rgba(243,220,161,0.28), rgba(13,10,38,0.6) 70%)",
              color: INK,
              fontFamily: "Serif",
              fontSize: 96,
              fontWeight: 700,
            }}
          >
            {String(n)}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", marginTop: 110, width: 860, justifyContent: "center", textAlign: "center", color: INK_SUB, fontSize: 34, lineHeight: 1.6 }}>
        {LUCKY_NOTICE}
      </div>
    </div>,
    <div key="host" style={{ position: "absolute", left: 0, bottom: 140, width, display: "flex", justifyContent: "center", color: GOLD, fontSize: 30, letterSpacing: 2 }}>
      {data.host}
    </div>,
  ]);
}

export function luckyShareText(data: LuckyShareData): { serif: string; sans: string } {
  return { serif: data.numbers.join(""), sans: `이번 주 행운 번호 ${data.week} ${LUCKY_NOTICE} ${data.host}` };
}

// ---- 결과 공유 (link preview and Kakao feed image, 1200×600) ----

/** 2:1 and 800px or more wide, as Kakao's feed recommends; link previews take it as well (owner 2026-10-23). */
export const SHARE_OG = { width: 1200, height: 600 } as const;

export interface ShareOgData {
  /** "친구가 공유한 타로 풀이" */
  label: string;
  /** tarot: the card names; saju: "연애운 풀이" */
  headline: string;
  /** A large gold line under the headline: the 인연 score ("인연 83점"). */
  big?: string;
  /** saju: the short conclusion; 한 장: its line; tarot: none (the cards say it) */
  body?: string;
  /**
   * tarot: the cards drawn. `src` is the face as a JPEG (satori cannot decode WebP), inlined by the
   * route; a face that could not be read is drawn as its name plate. Reversed ones are turned.
   */
  cards?: Array<{ cardId: string; src?: string; reversed: boolean }>;
  /** 별자리 인연: the constellation drawn on the right; `lit`: the first N stars, or the exact slots (a removed star leaves its gap). */
  sign?: SignId;
  lit?: number | readonly number[];
  /**
   * Saju: the five 기운 as a motif on the right (木火土金水 in their colours). A decoration, never the person's chart: the
   * pillars give a birth away (A2 SHARE-2), so a saju share has none to draw.
   */
  elements?: boolean;
  host: string;
}

const ELEMENTS: Array<[string, string]> = [
  ["木", "#7fc8a9"],
  ["火", "#f08a7e"],
  ["土", "#e3c07a"],
  ["金", "#d9d9e3"],
  ["水", "#7fa7e8"],
];

export function shareOgImage(data: ShareOgData): ReactElement {
  const { width, height } = SHARE_OG;
  const cards = (data.cards ?? []).slice(0, 3);
  const cardWidth = cards.length > 2 ? 148 : 176;
  const side = cards.length > 0 || data.sign !== undefined || data.elements === true;
  const textWidth = side ? 580 : 1050;
  return frame(width, height, [
    <div key="text" style={{ position: "absolute", left: 72, top: 58, width: textWidth, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", color: GOLD, fontSize: 24, fontWeight: 700, letterSpacing: 4 }}>STARLOG · 스타로그</div>
      <div style={{ display: "flex", marginTop: 20, color: INK_SUB, fontSize: 28 }}>{data.label}</div>
      <div style={{ display: "flex", marginTop: 12, fontFamily: "Serif", fontSize: side ? 42 : 48, fontWeight: 700, lineHeight: 1.3 }}>{data.headline}</div>
      {data.big ? <div style={{ display: "flex", marginTop: 6, color: GOLD, fontFamily: "Serif", fontSize: 96, fontWeight: 700, lineHeight: 1.1 }}>{data.big}</div> : null}
      {data.body ? <div style={{ display: "flex", marginTop: 14, color: INK, fontSize: 28, lineHeight: 1.45 }}>{data.body}</div> : null}
    </div>,
    data.sign ? (
      <div key="art" style={{ position: "absolute", right: 56, top: 70, display: "flex" }}>
        {constellationSvg(data.sign, 460, data.lit)}
      </div>
    ) : data.elements ? (
      <div key="elements" style={{ position: "absolute", right: 70, top: 0, height, width: 440, display: "flex", flexWrap: "wrap", alignContent: "center", justifyContent: "center", gap: 22 }}>
        {ELEMENTS.map(([name, color]) => (
          <div
            key={name}
            style={{ width: 120, height: 120, borderRadius: 60, display: "flex", alignItems: "center", justifyContent: "center", border: `4px solid ${color}`, color, fontFamily: "Serif", fontSize: 60, fontWeight: 700, backgroundColor: "rgba(255,255,255,0.04)" }}
          >
            {name}
          </div>
        ))}
      </div>
    ) : cards.length ? (
      <div key="cards" style={{ position: "absolute", right: 64, top: 0, height, display: "flex", alignItems: "center", gap: 16 }}>
        {cards.map((card, i) =>
          card.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${card.cardId}-${i}`}
              src={card.src}
              width={cardWidth}
              height={Math.round(cardWidth * (416 / 240))}
              // satori refuses `transform: undefined` (the whole image fails): an upright face carries no transform at all.
              style={{ borderRadius: 12, boxShadow: "0 18px 40px rgba(5,3,15,0.5)", ...(card.reversed ? { transform: "rotate(180deg)" } : {}) }}
            />
          ) : (
            <CardPlate key={`${card.cardId}-${i}`} cardId={card.cardId} orientation={card.reversed ? "reversed" : "upright"} width={cardWidth} />
          ),
        )}
      </div>
    ) : (
      <div key="none" style={{ display: "flex" }} />
    ),
    <div key="host" style={{ position: "absolute", left: 72, bottom: 44, display: "flex", color: GOLD, fontSize: 24, letterSpacing: 2 }}>
      {data.host}
    </div>,
  ]);
}

export function shareOgText(data: ShareOgData): { serif: string; sans: string } {
  return { serif: `${data.headline}${data.big ?? ""}${data.elements ? ELEMENTS.map(([name]) => name).join("") : ""}`, sans: `STARLOG · 스타로그 ${data.label} ${data.body ?? ""} ${data.host}` };
}

// ---- 프리미엄 풀이 (P5 task 23; 1080×1350, or the story size) ----

/** A premium share: the product's line, the cards or the year's title, the host. Never a question, a name or a birth. */
export interface PremiumShareData {
  /** "켈틱 크로스 10장" / "프리미엄 궁합 · 친구" / "2027년, 차근차근 쌓아 가는 해" */
  headline: string;
  cards: { cardId: string; orientation: Orientation }[];
  host: string;
  width: number;
  height: number;
}

export const PREMIUM_SHARE = { width: 1080, height: 1350 } as const;

export function premiumShareImage(data: PremiumShareData): ReactElement {
  const { width, height } = data;
  // Ten cards in two rows of five, five in one row; none for the year.
  const rows = data.cards.length > 5 ? [data.cards.slice(0, 5), data.cards.slice(5)] : data.cards.length ? [data.cards] : [];
  const plate = data.cards.length > 5 ? 170 : 180;
  const top = Math.round(height * (rows.length ? 0.2 : 0.36));
  return frame(width, height, [
    <div key="body" style={{ position: "absolute", left: 0, top, width, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", color: GOLD, fontSize: 30, fontWeight: 700, letterSpacing: 8 }}>STARLOG</div>
      <div style={{ display: "flex", marginTop: 34, width: 900, justifyContent: "center", textAlign: "center", fontFamily: "Serif", fontSize: rows.length ? 60 : 80, fontWeight: 700, lineHeight: 1.35 }}>
        {data.headline}
      </div>
      {rows.map((row, r) => (
        <div key={`row-${r}`} style={{ display: "flex", marginTop: r === 0 ? 80 : 26, gap: 18 }}>
          {row.map((card, i) => (
            <CardPlate key={`${card.cardId}-${r}-${i}`} cardId={card.cardId} orientation={card.orientation} width={plate} />
          ))}
        </div>
      ))}
    </div>,
    <div key="host" style={{ position: "absolute", left: 0, bottom: 110, width, display: "flex", justifyContent: "center", color: GOLD, fontSize: 30, letterSpacing: 2 }}>
      {data.host}
    </div>,
  ]);
}

export function premiumShareText(data: PremiumShareData): { serif: string; sans: string } {
  const names = data.cards.map((c) => `${getCard(c.cardId).roman ?? ""}${getCard(c.cardId).names.ko}`).join("");
  return { serif: `${data.headline}${names}`, sans: `STARLOG 역방향 ${data.host}` };
}
