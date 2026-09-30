import "server-only";
import type { Orientation, Who } from "@starlog/core";
import data from "./cards.generated.json";

/**
 * Runtime card knowledge base: the prompt/validator fields of content/kb/cards/*.json, bundled as
 * one module (Workers have no file system). Regenerate with `node scripts/build-kb-runtime.mjs`.
 */

export type ReversedMode = "blocked" | "internalized" | "excess" | "waning";
export type TopicAngle = "love" | "contact" | "work" | "choice" | "self" | "group";

export interface KbFact {
  id: string;
  ko: string;
  /** 1 = core (first sentence of a card section), 2 = supporting, 3 = background */
  salience: number;
}

export interface KbCard {
  id: string;
  names: { ko: string; en: string; koAliases?: string[] };
  arcana: "major" | "minor";
  suit?: string;
  rank?: string;
  number: number;
  roman?: string;
  element: string;
  keywordsKo: string[];
  imagery: {
    facts: KbFact[];
    /** `regex` is a JS RegExp source; a match in a card section is an invented image detail */
    misdescriptions: Array<{ wrong: string; correct: string; regex: string }>;
    glosses: Array<{ factId: string; ko: string }>;
  };
  core: { upright: string[]; reversed: string[]; oneLine: { upright: string; reversed: string }; shadow: string };
  reversedModes: { default: ReversedMode; allowed: ReversedMode[]; gloss: Partial<Record<ReversedMode, string>> };
  topics: Record<TopicAngle, { upright: string; reversed: string }>;
  positionHints: Record<string, { upright: string; reversed: string }>;
  actionHints: Array<{ orientation: Orientation | "both"; ko: string }>;
  cautions: Array<{ code: string; doNotClaim: string; instead: string }>;
  combinations: Array<{ with?: string; withGroup?: string; ko: string }>;
  court?: { asAttitude: string };
  stage?: string;
  safety: { highRisk: boolean; forbid: string[] };
}

interface KbData {
  schema: string;
  schemaVersion: number;
  topicMap: Record<Who, Record<string, TopicAngle[]>>;
  positionFallback: Record<string, { position?: string; topic?: TopicAngle }>;
  highRisk: string[];
  cards: KbCard[];
}

const KB = data as unknown as KbData;
const BY_ID: ReadonlyMap<string, KbCard> = new Map(KB.cards.map((card) => [card.id, card]));

export const KB_CARDS: readonly KbCard[] = KB.cards;

export function kbCard(id: string): KbCard {
  const card = BY_ID.get(id);
  if (!card) throw new Error(`No KB entry for card ${id}`);
  return card;
}

/** Reading angles for a topic, main angle first (`_index.json` topicMap). Falls back to "self". */
export function topicAngles(who: Who, topicId: string): TopicAngle[] {
  return KB.topicMap[who]?.[topicId] ?? ["self"];
}

/**
 * The card's lens for a spread position. Missing hints follow `positionFallback`: a sibling
 * position's hint first, then the topic angle named there (null when neither exists).
 */
export function positionHint(card: KbCard, position: string, orientation: Orientation): string | null {
  const direct = card.positionHints[position];
  if (direct) return direct[orientation];
  const fallback = KB.positionFallback[position];
  const sibling = fallback?.position ? card.positionHints[fallback.position] : undefined;
  if (sibling) return sibling[orientation];
  return fallback?.topic ? card.topics[fallback.topic][orientation] : null;
}
