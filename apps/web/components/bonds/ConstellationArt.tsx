import type { CSSProperties } from "react";
import { getConstellation, type SignId } from "@starlog/core";
import { FIGURES } from "./art/figures";
import { clip, layoutLabels } from "./art/labels";
import s from "./ConstellationArt.module.css";

type ConstellationArtProps = {
  sign: SignId;
  /** lit stars: the first N slots, or the exact slot indexes (a removed star leaves a gap) */
  lit: number | readonly number[];
  /** slots that just got their star: a small sparkle (motion only when allowed) */
  newSlots?: readonly number[];
  /** nickname per slot, drawn as a readable pill next to its star */
  labels?: readonly (string | null | undefined)[];
  /** rendered width and height in px */
  size: number;
  /** replaces the default accessible name */
  title?: string;
  /** inside a link or next to its own text: hidden from assistive tech */
  decorative?: boolean;
  /** the completion moment: stars light one by one, lines join, then the figure rises */
  reveal?: boolean;
  /** label text size in px at the rendered size (min 13) */
  labelPx?: number;
  className?: string;
};

/** Px at the rendered size → units of the 1000 box. */
const units = (px: number, size: number) => (px * 1000) / size;

const SPARKLE = "M0 -1L0.22 -0.22L1 0L0.22 0.22L0 1L-0.22 0.22L-1 0L-0.22 -0.22Z";

/**
 * A zodiac constellation as SVG: the faint figure outline, the star lines (gold between two lit
 * stars, dotted otherwise) and one star per slot (gold when lit, a hollow ring when empty).
 */
export function ConstellationArt({
  sign, lit, newSlots = [], labels, size, title, decorative = false, reveal = false, labelPx = 13, className,
}: ConstellationArtProps) {
  const def = getConstellation(sign);
  const litSet = new Set(typeof lit === "number" ? Array.from({ length: Math.min(lit, def.slots) }, (_, i) => i) : lit);
  const complete = litSet.size >= def.slots;
  const r = units(5, size);
  const font = units(Math.max(13, labelPx), size);
  const boxes = labels ? layoutLabels(def.stars, labels.map((l) => (l ? clip(l, 8) : null)), font, r * 2) : [];
  const name = title ?? `${def.ko}, 별 ${def.slots}개 중 ${litSet.size}개`;
  const order = (i: number) => ({ "--i": i }) as CSSProperties;

  return (
    <svg
      className={[s.art, complete ? s.complete : "", reveal ? s.reveal : "", className ?? ""].filter(Boolean).join(" ")}
      viewBox="0 0 1000 1000"
      width={size}
      height={size}
      {...(decorative ? { "aria-hidden": true, focusable: false } : { role: "img", "aria-label": name })}
    >
      <path className={s.figure} d={FIGURES[sign]} style={order(def.slots + 1)} />
      {def.lines.map(([a, b]) => {
        const on = litSet.has(a) && litSet.has(b);
        const [x1, y1] = def.stars[a]!;
        const [x2, y2] = def.stars[b]!;
        return <line key={`${a}-${b}`} className={on ? s.lineOn : s.lineOff} x1={x1} y1={y1} x2={x2} y2={y2} style={order(Math.max(a, b))} />;
      })}
      {def.stars.map(([x, y], i) => {
        const on = litSet.has(i);
        return (
          <g key={i} className={s.star} data-star={on ? "lit" : "empty"} style={order(i)}>
            {on ? <circle className={s.halo} cx={x} cy={y} r={r * 2.8} /> : null}
            <circle className={on ? s.dot : s.ring} cx={x} cy={y} r={on ? r * 1.15 : r} />
            {newSlots.includes(i) ? (
              <path data-new="" className={s.sparkle} d={SPARKLE} transform={`translate(${x} ${y}) scale(${r * 3.2})`} />
            ) : null}
          </g>
        );
      })}
      {boxes.map((box, i) =>
        box ? (
          <g key={`label-${i}`} className={s.label} style={order(i)}>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={box.h / 2} />
            <text x={box.x + box.w / 2} y={box.y + box.h / 2} fontSize={font} dominantBaseline="central" textAnchor="middle">
              {box.text}
            </text>
          </g>
        ) : null,
      )}
    </svg>
  );
}
