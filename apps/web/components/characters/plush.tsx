import type { CharacterAction, Outfit } from "./types";

/**
 * Raster "plush" art the owner picked on 2026-10-07: cut-outs per character, outfit and pose, served from
 * /public/characters as <name>.v<N>-<px>.webp (600 and 300 px squares, feet on the bottom edge).
 * Bump the version in the file name when an image changes; the files are cached for a week.
 * Poses: the tarot cat holds a card while it shuffles or reads (shuffle, glow); the tarot rabbit writes
 * in its book for "write". Expressions are not drawn yet: every pose has one face.
 */
const PLUSH = {
  cat: {
    tarot: { idle: "/characters/cat-tarot.v1", shuffle: "/characters/cat-tarot-card.v1", glow: "/characters/cat-tarot-card.v1" },
    hanbok: { idle: "/characters/cat-hanbok.v1" },
  },
  rabbit: {
    tarot: { idle: "/characters/rabbit-tarot.v1", write: "/characters/rabbit-tarot-write.v1" },
    hanbok: { idle: "/characters/rabbit-hanbok.v2" },
  },
} as const satisfies Record<"cat" | "rabbit", Record<Outfit, Partial<Record<CharacterAction | "idle", string>>>>;

/** The plush image base path for a character, outfit and action (the outfit's idle pose when the action has none). */
export function plushSrc(character: "cat" | "rabbit", outfit: Outfit, action: CharacterAction = "none"): string {
  const poses: Partial<Record<CharacterAction | "idle", string>> = PLUSH[character][outfit];
  return poses[action] ?? poses.idle!;
}

/** Draws a plush cut-out in the 300×300 character box, feet on the floor shadow (cy 287). */
export function PlushArt({ src, size }: { src: string; size: number }) {
  return <image href={`${src}-${size > 100 ? 600 : 300}.webp`} x="3" y="-6" width="294" height="294" preserveAspectRatio="xMidYMax meet" />;
}
