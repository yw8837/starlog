import type { Outfit } from "./types";

/**
 * Raster "plush" art the owner picked on 2026-10-07: one cut-out per character and outfit, served from
 * /public/characters as <name>.v<N>-<px>.webp (600 and 300 px squares, feet on the bottom edge).
 * Bump the version in the file name when an image changes; the files are cached for a week.
 */
const PLUSH: Record<"cat" | "rabbit", Partial<Record<Outfit, string>>> = {
  cat: { tarot: "/characters/cat-tarot.v1" },
  rabbit: { hanbok: "/characters/rabbit-hanbok.v2" },
};

/** The plush image base path for a character and outfit, or null when that outfit has no plush art yet. */
export function plushSrc(character: "cat" | "rabbit", outfit: Outfit): string | null {
  return PLUSH[character][outfit] ?? null;
}

/** Draws a plush cut-out in the 300×300 character box, feet on the floor shadow (cy 287). */
export function PlushArt({ src, size }: { src: string; size: number }) {
  return <image href={`${src}-${size > 100 ? 600 : 300}.webp`} x="3" y="-6" width="294" height="294" preserveAspectRatio="xMidYMax meet" />;
}
