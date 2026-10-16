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

// ---- 오늘의 한 장 (story) ----

export interface DailyShareData {
  cardId: string;
  orientation: Orientation;
  keyword: string;
  summary: string;
  date: string;
  host: string;
}

export function dailyShareImage(data: DailyShareData): ReactElement {
  const { width, height } = STORY;
  return frame(width, height, [
    <div key="body" style={{ position: "absolute", left: 0, top: 220, width, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", color: GOLD, fontSize: 36, fontWeight: 700, letterSpacing: 6 }}>오늘의 한 장</div>
      <div style={{ display: "flex", marginTop: 12, color: INK_SUB, fontSize: 32 }}>{data.date}</div>
      <div style={{ display: "flex", marginTop: 90 }}>
        <CardPlate cardId={data.cardId} orientation={data.orientation} width={440} />
      </div>
      <div style={{ display: "flex", marginTop: 80, color: GOLD, fontFamily: "Serif", fontSize: 64, fontWeight: 700 }}>{data.keyword}</div>
      <div style={{ display: "flex", marginTop: 36, width: 840, justifyContent: "center", textAlign: "center", fontSize: 44, lineHeight: 1.55 }}>
        {data.summary}
      </div>
    </div>,
    <div key="host" style={{ position: "absolute", left: 0, bottom: 140, width, display: "flex", justifyContent: "center", color: GOLD, fontSize: 30, letterSpacing: 2 }}>
      {data.host}
    </div>,
  ]);
}

export function dailyShareText(data: DailyShareData): { serif: string; sans: string } {
  const card = getCard(data.cardId);
  return { serif: `${card.roman ?? ""}${card.names.ko}${data.keyword}`, sans: `오늘의 한 장 역방향 ${data.date} ${data.summary} ${data.host}` };
}

// ---- chapter title card (story) ----

export interface ChapterShareData {
  title: string;
  cards: { cardId: string; orientation: Orientation }[];
  host: string;
}

export function chapterShareImage(data: ChapterShareData): ReactElement {
  const { width, height } = STORY;
  return frame(width, height, [
    <div key="body" style={{ position: "absolute", left: 0, top: 470, width, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", color: GOLD, fontSize: 34, fontWeight: 700, letterSpacing: 6 }}>나의 이야기 한 장</div>
      <div style={{ display: "flex", marginTop: 40, width: 880, justifyContent: "center", textAlign: "center", fontFamily: "Serif", fontSize: 76, fontWeight: 700, lineHeight: 1.35 }}>
        {data.title}
      </div>
      <div style={{ display: "flex", marginTop: 110, gap: 34 }}>
        {data.cards.map((card, i) => (
          <CardPlate key={`${card.cardId}-${i}`} cardId={card.cardId} orientation={card.orientation} width={data.cards.length > 2 ? 290 : 340} />
        ))}
      </div>
    </div>,
    <div key="host" style={{ position: "absolute", left: 0, bottom: 140, width, display: "flex", justifyContent: "center", color: GOLD, fontSize: 30, letterSpacing: 2 }}>
      {data.host}
    </div>,
  ]);
}

export function chapterShareText(data: ChapterShareData): { serif: string; sans: string } {
  const names = data.cards.map((c) => `${getCard(c.cardId).roman ?? ""}${getCard(c.cardId).names.ko}`).join("");
  return { serif: `${data.title}${names}`, sans: `나의 이야기 한 장 역방향 ${data.host}` };
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

// ---- 결과 공유 (link preview, 1200×630) ----

export interface ShareOgData {
  /** "친구가 공유한 타로 풀이" */
  label: string;
  /** tarot: the card names; saju: "연애운 풀이" */
  headline: string;
  /** saju: the short conclusion; tarot: none (the cards say it) */
  body?: string;
  /**
   * tarot: the cards drawn. `src` is the face as a JPEG (satori cannot decode WebP), inlined by the
   * route; a face that could not be read is drawn as its name plate. Reversed ones are turned.
   */
  cards?: Array<{ cardId: string; src?: string; reversed: boolean }>;
  host: string;
}

export function shareOgImage(data: ShareOgData): ReactElement {
  const { width, height } = OG_CARD;
  const cards = (data.cards ?? []).slice(0, 3);
  const cardWidth = cards.length > 2 ? 150 : 180;
  const textWidth = cards.length ? 560 : 1040;
  return frame(width, height, [
    <div key="text" style={{ position: "absolute", left: 80, top: 96, width: textWidth, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", color: GOLD, fontSize: 26, fontWeight: 700, letterSpacing: 8 }}>STARLOG</div>
      <div style={{ display: "flex", marginTop: 8, fontFamily: "Serif", fontSize: 64, fontWeight: 700 }}>스타로그</div>
      <div style={{ display: "flex", marginTop: 26, color: INK_SUB, fontSize: 32 }}>{data.label}</div>
      <div style={{ display: "flex", marginTop: 18, fontFamily: "Serif", fontSize: cards.length ? 38 : 44, fontWeight: 700, lineHeight: 1.35 }}>{data.headline}</div>
      {data.body ? (
        <div style={{ display: "flex", marginTop: 18, color: INK, fontSize: 32, lineHeight: 1.5 }}>{data.body}</div>
      ) : null}
    </div>,
    cards.length ? (
      <div key="cards" style={{ position: "absolute", right: 70, top: 0, height, display: "flex", alignItems: "center", gap: 18 }}>
        {cards.map((card, i) =>
          card.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${card.cardId}-${i}`}
              src={card.src}
              width={cardWidth}
              height={Math.round(cardWidth * (416 / 240))}
              style={{ borderRadius: 12, boxShadow: "0 18px 40px rgba(5,3,15,0.5)", transform: card.reversed ? "rotate(180deg)" : undefined }}
            />
          ) : (
            <CardPlate key={`${card.cardId}-${i}`} cardId={card.cardId} orientation={card.reversed ? "reversed" : "upright"} width={cardWidth} />
          ),
        )}
      </div>
    ) : (
      <div key="none" style={{ display: "flex" }} />
    ),
    <div key="host" style={{ position: "absolute", left: 80, bottom: 56, display: "flex", color: GOLD, fontSize: 26, letterSpacing: 2 }}>
      {data.host}
    </div>,
  ]);
}

export function shareOgText(data: ShareOgData): { serif: string; sans: string } {
  return { serif: `스타로그${data.headline}`, sans: `STARLOG ${data.label} ${data.body ?? ""} ${data.host}` };
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
