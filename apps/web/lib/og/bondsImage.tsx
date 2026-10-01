import type { ReactElement } from "react";
import { getConstellation, type SignId } from "@starlog/core";
import { FIGURES } from "@/components/bonds/art/figures";
import { layoutLabels } from "@/components/bonds/art/labels";

/**
 * The 별자리 인연 share image (spec §5), drawn for next/og (satori): the figure and star lines as SVG,
 * every friend's nickname as a pill at their star, the sign, the 인연 total, the owner's nickname, the
 * completion date and the site. Never a friend's score, message or birth date.
 */

export const SHARE_SIZES = {
  feed: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
} as const;
export type ShareSize = keyof typeof SHARE_SIZES;

export interface BondsShareData {
  sign: SignId;
  /** nickname per slot, in slot order */
  nicknames: string[];
  total: number;
  ownerNickname: string;
  completedAt: number;
  host: string;
}

export const INK = "#f1ecff";
export const INK_SUB = "#c9c1ea";
export const GOLD = "#f3dca1";
export const NIGHT = "linear-gradient(180deg, #0d0a26 0%, #16124a 55%, #2e2a78 100%)";

/** "2026년 10월 1일" in Korean time. */
export function koreanDate(ms: number): string {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(ms);
}

/** A fixed star field (the same on every render), as small absolutely placed dots. */
export function starField(width: number, height: number, count: number, seed = 11): ReactElement[] {
  let s = seed;
  const next = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => {
    const r = 1 + next() * 2.4;
    return (
      <div
        key={`dot-${i}`}
        style={{
          position: "absolute",
          left: next() * width,
          top: next() * height,
          width: r * 2,
          height: r * 2,
          borderRadius: 9999,
          backgroundColor: i % 7 === 0 ? GOLD : "#ffffff",
          opacity: 0.2 + next() * 0.5,
        }}
      />
    );
  });
}

/**
 * How to frame a sign in its square: the stars' bounding box centred and zoomed (up to 1.35x) so
 * its longer side spans about 720 of the 1000 units, leaving room for the nickname pills.
 */
export function framing(sign: SignId): { cx: number; cy: number; zoom: number } {
  const { stars } = getConstellation(sign);
  const xs = stars.map(([x]) => x);
  const ys = stars.map(([, y]) => y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return {
    cx: (Math.max(...xs) + Math.min(...xs)) / 2,
    cy: (Math.max(...ys) + Math.min(...ys)) / 2,
    zoom: Math.min(1.35, Math.max(1, 720 / Math.max(w, h))),
  };
}

/** Star positions in the framed square (see `framing`). */
export function framedStars(sign: SignId): Array<[number, number]> {
  const { cx, cy, zoom } = framing(sign);
  return getConstellation(sign).stars.map(([x, y]) => [(x - cx) * zoom + 500, (y - cy) * zoom + 500]);
}

/** The figure, lines and stars of a sign as an SVG `px` wide, framed; the first `lit` stars lit. */
export function constellationSvg(sign: SignId, px: number, lit = Infinity): ReactElement {
  const def = getConstellation(sign);
  const on = (i: number) => i < lit;
  const { cx, cy, zoom } = framing(sign);
  const side = 1000 / zoom;
  return (
    <svg width={px} height={px} viewBox={`${cx - side / 2} ${cy - side / 2} ${side} ${side}`}>
      <path d={FIGURES[sign]} fill="none" stroke="rgba(243,220,161,0.55)" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
      {def.lines.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={def.stars[a]![0]}
          y1={def.stars[a]![1]}
          x2={def.stars[b]![0]}
          y2={def.stars[b]![1]}
          stroke={on(a) && on(b) ? GOLD : "rgba(243,220,161,0.35)"}
          strokeWidth={on(a) && on(b) ? 5 : 3}
          strokeDasharray={on(a) && on(b) ? undefined : "4 12"}
          strokeLinecap="round"
        />
      ))}
      {def.stars.map(([x, y], i) => (
        <g key={`star-${i}`}>
          {on(i) ? <circle cx={x} cy={y} r={34} fill="rgba(243,220,161,0.18)" /> : null}
          {on(i) ? <circle cx={x} cy={y} r={15} fill={GOLD} /> : <circle cx={x} cy={y} r={13} fill="#0d0a26" stroke="rgba(243,220,161,0.7)" strokeWidth={3} />}
        </g>
      ))}
    </svg>
  );
}

/** Nickname pills over an art box `px` wide whose top-left corner is (left, top); `stars` in framed units. */
function pills(stars: readonly (readonly [number, number])[], nicknames: string[], px: number, left: number, top: number, fontPx: number): ReactElement[] {
  const unit = px / 1000;
  const boxes = layoutLabels(stars, nicknames, fontPx / unit, 26);
  return boxes.flatMap((box, i) =>
    box
      ? [
          <div
            key={`pill-${i}`}
            style={{
              position: "absolute",
              left: left + box.x * unit,
              top: top + box.y * unit,
              width: box.w * unit,
              height: box.h * unit,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 9999,
              backgroundColor: "rgba(13,10,38,0.84)",
              border: "2px solid rgba(243,220,161,0.6)",
              color: INK,
              fontFamily: "Sans",
              fontSize: fontPx,
              fontWeight: 700,
            }}
          >
            {box.text}
          </div>,
        ]
      : [],
  );
}

export function bondsShareImage(data: BondsShareData, size: ShareSize): ReactElement {
  const { width, height } = SHARE_SIZES[size];
  const def = getConstellation(data.sign);
  const story = size === "story";
  const art = story ? 960 : 820;
  const artLeft = (width - art) / 2;
  const artTop = story ? 450 : 226;
  const fontPx = story ? 40 : 38;
  return (
    <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", backgroundColor: "#0d0a26", backgroundImage: NIGHT, color: INK, fontFamily: "Sans" }}>
      {starField(width, height, story ? 140 : 110)}
      <div style={{ position: "absolute", left: 0, top: story ? 170 : 70, width, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", color: GOLD, fontSize: 32, fontWeight: 700, letterSpacing: 6 }}>별자리 인연</div>
        <div style={{ display: "flex", alignItems: "flex-end", marginTop: 14 }}>
          <span style={{ fontFamily: "Serif", fontSize: story ? 104 : 92, fontWeight: 700, lineHeight: 1.1 }}>{def.ko}</span>
          <span style={{ marginLeft: 18, marginBottom: story ? 14 : 12, fontSize: 38, color: INK_SUB, lineHeight: 1.2 }}>{`· ${def.en}`}</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: artLeft, top: artTop, display: "flex" }}>{constellationSvg(data.sign, art)}</div>
      {pills(framedStars(data.sign), data.nicknames, art, artLeft, artTop, fontPx)}
      <div style={{ position: "absolute", left: 0, top: artTop + art + (story ? 40 : 4), width, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "flex-end", color: INK_SUB, fontSize: 40 }}>
          <span style={{ marginBottom: story ? 22 : 18, lineHeight: 1.2 }}>인연</span>
          <span style={{ marginLeft: 16, color: GOLD, fontFamily: "Serif", fontSize: story ? 124 : 104, fontWeight: 700, lineHeight: 1.1 }}>{String(data.total)}</span>
          <span style={{ marginLeft: 6, marginBottom: story ? 22 : 18, lineHeight: 1.2 }}>점</span>
        </div>
        <div style={{ display: "flex", marginTop: 8, fontSize: 34, color: INK }}>{`${data.ownerNickname}님의 ${def.ko} · ${koreanDate(data.completedAt)} 완성`}</div>
      </div>
      <div style={{ position: "absolute", left: 0, bottom: story ? 120 : 48, width, display: "flex", justifyContent: "center", color: GOLD, fontSize: 28, letterSpacing: 2 }}>
        {data.host}
      </div>
    </div>
  );
}

/** Every character the image draws, per font, for the glyph subsets. */
export function bondsShareText(data: BondsShareData): { serif: string; sans: string } {
  const def = getConstellation(data.sign);
  return {
    serif: `${def.ko}${data.total}`,
    sans: `별자리 인연 · ${def.en} 인연 점 ${data.nicknames.join("")} ${data.ownerNickname}님의 ${def.ko} ${koreanDate(data.completedAt)} 완성 ${data.host}`,
  };
}
