import { CARDS } from "./cards";
import type { SpreadTemplate } from "./templates";

export type Orientation = "upright" | "reversed";

export interface DrawnCard {
  cardId: string;
  /** Korean position name from the template */
  position: string;
  orientation: Orientation;
  /** 0-based index into the template's positions (= tap order) */
  slot: number;
}

export interface DeckState {
  seed: string;
  /** all 78 card ids, shuffled */
  order: string[];
  /** orientations[i] belongs to order[i] */
  orientations: Orientation[];
}

export const DEFAULT_REVERSAL_RATE = 0.3;

// Seeded PRNG: xmur3 string hash expands the seed into four 32-bit words, which initialise
// xoshiro128**. Pure TypeScript and synchronous (no node:crypto / crypto.subtle), so the same
// seed yields the same deck on the server and in the browser.
function xmur3(str: string): () => number {
  let h = (1779033703 ^ str.length) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** xoshiro128** returning floats in [0, 1) */
function xoshiro128ss(seed: string): () => number {
  const next = xmur3(seed);
  let a = next(), b = next(), c = next(), d = next();
  if ((a | b | c | d) === 0) a = 1; // the all-zero state never leaves zero
  return () => {
    const r = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t;
    d = rotl(d, 11);
    return r / 4294967296;
  };
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** Pure and deterministic for a given (seed, reversalRate). Card order depends on the seed only. */
export function createDeck(seed: string, reversalRate: number): DeckState {
  if (!(reversalRate >= 0 && reversalRate <= 1)) {
    throw new RangeError(`reversalRate must be between 0 and 1, got ${reversalRate}`);
  }
  const rand = xoshiro128ss(seed);
  const order = CARDS.map(c => c.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const orientations = order.map((): Orientation => (rand() < reversalRate ? "reversed" : "upright"));
  return { seed, order, orientations };
}

/** `pickedIndexes` are indexes into `deck.order` in tap order; the n-th tap fills the n-th position. */
export function pickCards(deck: DeckState, template: SpreadTemplate, pickedIndexes: number[]): DrawnCard[] {
  if (pickedIndexes.length !== template.positions.length) {
    throw new Error(`Template "${template.id}" needs ${template.positions.length} cards, got ${pickedIndexes.length}`);
  }
  if (new Set(pickedIndexes).size !== pickedIndexes.length) {
    throw new Error("The same card cannot be picked twice");
  }
  return pickedIndexes.map((index, slot) => {
    const cardId = deck.order[index];
    const orientation = deck.orientations[index];
    if (!Number.isInteger(index) || cardId === undefined || orientation === undefined) {
      throw new RangeError(`Card index ${index} is outside the deck`);
    }
    return { cardId, position: template.positions[slot]!, orientation, slot };
  });
}
