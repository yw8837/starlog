/**
 * Where each nickname pill goes next to its star, in the 1000×1000 art box. Pure, so the page art
 * (ConstellationArt) and the share image (next/og) place labels the same way. A pill tries the spots
 * around its star in a fixed order and takes the first that stays inside the box and clears every
 * star and every earlier pill; when none does, the spot with the least overlap wins.
 */

export interface LabelBox {
  /** top-left corner and size, in box units */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

const MARGIN = 8;

/** Rough advance of one character in em: Hangul and CJK full width, Latin and digits narrower. */
function charEm(ch: string): number {
  if (/[ᄀ-ᇿ㄰-㆏가-힣　-鿿]/.test(ch)) return 1;
  if (ch === " ") return 0.32;
  if (/[A-Z0-9]/.test(ch)) return 0.66;
  return 0.56;
}

/** Pill width for `text` at `font` units: text width plus padding on both sides. */
export function pillWidth(text: string, font: number): number {
  const em = Array.from(text).reduce((sum, ch) => sum + charEm(ch), 0);
  return Math.round(em * font + font * 1.1);
}

export const pillHeight = (font: number) => Math.round(font * 1.7);

/** `text` cut to `max` characters with an ellipsis (the art is small; lists show the full name). */
export function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}

const overlapArea = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export function boxesOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/**
 * One box per label (null where there is no label). `font` is the label size in box units, `starRadius`
 * the clearance kept around every star.
 */
export function layoutLabels(
  stars: readonly (readonly [number, number])[],
  labels: readonly (string | null | undefined)[],
  font: number,
  starRadius = font * 0.5,
  size = 1000,
): Array<LabelBox | null> {
  const h = pillHeight(font);
  const gap = starRadius + font * 0.25;
  const starBoxes = stars.map(([x, y]) => ({ x: x - starRadius, y: y - starRadius, w: starRadius * 2, h: starRadius * 2 }));
  const placed: LabelBox[] = [];
  return stars.map(([sx, sy], i) => {
    const text = labels[i];
    if (!text) return null;
    const w = pillWidth(text, font);
    const spots = [
      { x: sx + gap * 0.6, y: sy - gap - h },
      { x: sx - gap * 0.6 - w, y: sy - gap - h },
      { x: sx + gap * 0.6, y: sy + gap },
      { x: sx - gap * 0.6 - w, y: sy + gap },
      { x: sx + gap * 1.2, y: sy - h / 2 },
      { x: sx - gap * 1.2 - w, y: sy - h / 2 },
      { x: sx - w / 2, y: sy - gap * 1.3 - h },
      { x: sx - w / 2, y: sy + gap * 1.3 },
    ];
    let best: { box: LabelBox; cost: number } | null = null;
    for (const spot of spots) {
      const box: LabelBox = {
        x: Math.min(Math.max(spot.x, MARGIN), size - MARGIN - w),
        y: Math.min(Math.max(spot.y, MARGIN), size - MARGIN - h),
        w,
        h,
        text,
      };
      const moved = Math.abs(box.x - spot.x) + Math.abs(box.y - spot.y);
      const cost =
        placed.reduce((sum, p) => sum + overlapArea(box, { x: p.x - 4, y: p.y - 4, w: p.w + 8, h: p.h + 8 }), 0) * 4 +
        starBoxes.reduce((sum, s) => sum + overlapArea(box, s), 0) +
        moved * 2;
      if (!best || cost < best.cost) best = { box, cost };
      if (cost === 0) break;
    }
    placed.push(best!.box);
    return best!.box;
  });
}
