import "server-only";
import { DEFAULT_REVERSAL_RATE, TEMPLATES, createDeck, pickCards, type DrawnCard, type Orientation, type TemplateId } from "@starlog/core";
import { randomId, signToken, verifyToken, type SignedPayload } from "./sign";

/**
 * Server-fixed tarot draws. The server shuffles with a random seed, the client only says which
 * face-down positions were tapped, and the resulting cards travel as a signed draw token, so the
 * client can never choose or swap cards. Readings recompute the cards from the token.
 */

export const DRAW_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

interface DrawPayload extends SignedPayload {
  k: "draw";
  v: 1;
  seed: string;
  rate: number;
  templateId: TemplateId;
  picks: number[];
  /** [cardId, orientation] per slot, as drawn (checked against the recomputation) */
  cards: Array<[string, Orientation]>;
  iat: number;
  exp: number;
}

export interface OpenedDraw {
  templateId: TemplateId;
  cards: DrawnCard[];
}

/** Draws for `picks` (indexes into the shuffled deck, tap order). Throws RangeError on invalid picks. */
export async function issueDraw(templateId: TemplateId, picks: number[], secret: string, now: number): Promise<{ cards: DrawnCard[]; drawToken: string }> {
  const seed = randomId(16);
  const rate = DEFAULT_REVERSAL_RATE;
  const cards = drawCards(seed, rate, templateId, picks);
  const payload: DrawPayload = {
    k: "draw", v: 1, seed, rate, templateId, picks,
    cards: cards.map((c) => [c.cardId, c.orientation]),
    iat: now, exp: now + DRAW_TOKEN_TTL_MS,
  };
  return { cards, drawToken: await signToken(payload, secret) };
}

/** The draw behind a token, or null when the token is forged, expired or inconsistent. */
export async function openDraw(token: unknown, secret: string, now: number): Promise<OpenedDraw | null> {
  const p = await verifyToken<DrawPayload>(token, "draw", secret, now);
  if (!p || p.v !== 1 || !Object.hasOwn(TEMPLATES, p.templateId) || !Array.isArray(p.picks) || !Array.isArray(p.cards)) return null;
  let cards: DrawnCard[];
  try {
    cards = drawCards(p.seed, p.rate, p.templateId, p.picks);
  } catch {
    return null;
  }
  const same = cards.length === p.cards.length && cards.every((c, i) => c.cardId === p.cards[i]?.[0] && c.orientation === p.cards[i]?.[1]);
  return same ? { templateId: p.templateId, cards } : null;
}

function drawCards(seed: string, rate: number, templateId: TemplateId, picks: number[]): DrawnCard[] {
  if (typeof seed !== "string" || typeof rate !== "number") throw new RangeError("Bad draw");
  if (!picks.every((index) => Number.isInteger(index))) throw new RangeError("Card indexes must be integers");
  return pickCards(createDeck(seed, rate), TEMPLATES[templateId], picks);
}

/** 오늘의 한 장: fixed by the device id and the KST day, so repeat visits the same day see the same card. */
export function dailyCard(deviceId: string, day: string): { cardId: string; orientation: Orientation } {
  const deck = createDeck(`daily:${deviceId}:${day}`, DEFAULT_REVERSAL_RATE);
  return { cardId: deck.order[0]!, orientation: deck.orientations[0]! };
}

/** 1-45, fixed by the device id and the KST day (FNV-1a), like the card. */
export function dailyLuckyNumber(deviceId: string, day: string): number {
  let hash = 0x811c9dc5;
  for (const ch of `lucky:${deviceId}:${day}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % 45) + 1;
}
