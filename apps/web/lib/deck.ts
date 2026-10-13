import { cardImage } from "@starlog/core";
import { createLocalStore } from "@/lib/sessionStore";

/**
 * The card design this device shows (내 정보 → 카드 디자인): which art the faces are drawn in and which
 * back they wear. Kept in localStorage under `starlog.deck`; safe to import from any client component.
 * The images are built by scripts/build-starlog-deck.mjs into public/cards/starlog and public/cards/backs.
 */

/** "starlog" is the Starlog deck (public/cards/starlog); "rws1909" the 1909 scans in public/cards. */
export const FRONT_DECKS = ["starlog", "rws1909"] as const;
export type FrontDeck = (typeof FRONT_DECKS)[number];

export const CARD_BACKS = ["constellation", "navy-gold", "ribbon-garden", "moon-guardian"] as const;
export type CardBack = (typeof CARD_BACKS)[number];

export type DeckPrefs = { front: FrontDeck; back: CardBack };

export const DEFAULT_DECK_PREFS: DeckPrefs = { front: "starlog", back: "constellation" };

export const DECK_KEY = "starlog.deck";

const pick = <T extends string>(options: readonly T[], value: unknown, fallback: T): T => options.find((option) => option === value) ?? fallback;

/** What is stored, a half at a time: a name that is not an option falls back to its default; anything but an object to null. */
function parseDeckPrefs(value: unknown): DeckPrefs | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const stored = value as Record<string, unknown>;
  return { front: pick(FRONT_DECKS, stored.front, DEFAULT_DECK_PREFS.front), back: pick(CARD_BACKS, stored.back, DEFAULT_DECK_PREFS.back) };
}

const store = createLocalStore<DeckPrefs>(DECK_KEY, parseDeckPrefs);

/** The saved choice, the defaults for what is not saved; on the server and while hydrating, the defaults. */
export function useDeckPrefs(): DeckPrefs {
  return store.useValue() ?? DEFAULT_DECK_PREFS;
}

/** Saves a change to one half or both; every mounted card and setting updates at once. */
export function setDeckPrefs(change: Partial<DeckPrefs>): void {
  store.save({ ...(store.read() ?? DEFAULT_DECK_PREFS), ...change });
}

type ImageSize = "lg" | "sm";

const file = (name: string, size: ImageSize) => (size === "sm" ? `${name}-sm.webp` : `${name}.webp`);

/** A face: the 600x1040 file, or the 240x416 one. */
export function faceImage(cardId: string, size: ImageSize, deck: FrontDeck): string {
  return deck === "rws1909" ? cardImage(cardId, size) : `/cards/starlog/${file(cardId, size)}`;
}

/** A back, in the same two sizes. */
export function backImage(back: CardBack, size: ImageSize): string {
  return `/cards/backs/${file(back, size)}`;
}
