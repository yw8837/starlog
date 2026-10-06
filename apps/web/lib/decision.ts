import type { DeckState, Orientation } from "@starlog/core";
// Written by scripts/check-decision-db.mjs from content/kb/decision.ko.json: only the fields the
// /now page shows (56 KB raw, 17 KB gzip), bundled so the page draws in the browser with no server.
import data from "./decision.generated.json";

/** go: 끌리는 쪽으로 가도 돼요 · wait: 조금 더 지켜봐요 · rethink: 다른 길도 살펴봐요 */
export type Lean = "go" | "wait" | "rethink";

export interface DecisionEntry {
  lean: Lean;
  /** Three oracle lines; one is shown per draw. */
  answers: readonly string[];
  /** Why this card says so, tied to what is drawn on it. */
  why: string;
  /** One small thing to do today. */
  tip: string;
}

/** One draw of 지금의 한 장: the card, its side and the line picked for this draw. */
export interface NowDraw {
  cardId: string;
  orientation: Orientation;
  lean: Lean;
  answer: string;
  why: string;
}

type RawEntry = { lean: string; answers: string[]; why: string; tip: string };
const DB: Record<string, Partial<Record<Orientation, RawEntry>>> = data;

const toLean = (value: string): Lean => (value === "go" || value === "wait" || value === "rethink" ? value : "wait");

/** The entry for one card side. Throws for an id the DB does not know (the checker keeps all 78 x 2). */
export function decisionFor(cardId: string, orientation: Orientation): DecisionEntry {
  const entry = DB[cardId]?.[orientation];
  if (!entry) throw new Error(`No 지금의 한 장 entry for ${cardId} (${orientation})`);
  return { ...entry, lean: toLean(entry.lean) };
}

/**
 * The card at `index` of the shuffled deck, with one of its answers chosen by `random` (0 <= random < 1,
 * e.g. Math.random()), so the same card can say something different on another draw.
 */
export function drawNow(deck: DeckState, index: number, random: number): NowDraw {
  const cardId = deck.order[index];
  const orientation = deck.orientations[index];
  if (!Number.isInteger(index) || cardId === undefined || orientation === undefined) {
    throw new RangeError(`Card index ${index} is outside the deck`);
  }
  const { lean, answers, why } = decisionFor(cardId, orientation);
  const pick = Math.min(answers.length - 1, Math.max(0, Math.floor(random * answers.length)));
  return { cardId, orientation, lean, answer: answers[pick] ?? answers[0] ?? "", why };
}
