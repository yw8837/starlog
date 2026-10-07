export type Expression = "idle" | "happy" | "focus" | "surprise" | "wink";
export type Outfit = "tarot" | "hanbok";
export type CharacterAction = "none" | "shuffle" | "write" | "glow";

export interface CharacterProps {
  /**
   * Cat: tarot = astrologer (hat, star cape); hanbok = 색동 저고리 assistant with 복주머니.
   * Rabbit: tarot = librarian (glasses, ribbon, pencil, cardigan, book, quill; never a hat);
   * hanbok = leader in 남색 두루마기 with 붓 and 두루마리.
   */
  outfit: Outfit;
  /** Default "idle". A tap shows "happy" for the length of the reaction. */
  expression?: Expression;
  /** Rendered width and height in px. Default 160. */
  size?: number;
  /** Cat: shuffle, glow. Rabbit: write. Anything else renders as "none". */
  action?: CharacterAction;
  /** Wrap in a button that reacts to taps. Default true. */
  reactOnTap?: boolean;
  /** Accessible name. */
  label?: string;
  /** "plush" draws the raster cut-out (components/characters/plush.tsx) when the outfit has one. Default "vector". */
  art?: "vector" | "plush";
}
