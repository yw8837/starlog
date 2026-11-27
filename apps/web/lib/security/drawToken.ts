import "server-only";
import { DEFAULT_REVERSAL_RATE, TEMPLATES, createDeck, pickCards, type DeckState, type DrawnCard, type Orientation, type TemplateId } from "@starlog/core";
import { keyedHash, randomId, signToken, verifyToken, type SignedPayload } from "./sign";

/**
 * Server-fixed tarot draws. The server shuffles with a random seed, the client only says which
 * face-down positions were tapped, and the resulting cards travel as a signed draw token, so the
 * client can never choose or swap cards. Readings recompute the cards from the token.
 */

export const DRAW_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 이어 읽기 (spec 2026-11-26 beyond trend §3): the card drawn on /now, laid in the first position. The browser drew it, so
 * the server takes it as said (asked for by hand, it lets someone choose the first card of their own reading: accepted
 * by the spec, no effect on price or count).
 */
export interface KeptCard {
  cardId: string;
  orientation: Orientation;
}

/** The spreads a draw may keep a card in: the standard three-card ones (never 켈틱 크로스 10장, 오늘의 한 장 or 궁합's). */
export const KEEP_TEMPLATES: ReadonlySet<TemplateId> = new Set<TemplateId>(["relationship-contact", "relationship", "work", "choice", "self-flow", "group"]);

/** v1: the server dealt every position. v2 (이어 읽기): `keep` is the first position, `picks` deal the rest. */
type DrawPayload = SignedPayload & {
  k: "draw";
  seed: string;
  rate: number;
  templateId: TemplateId;
  picks: number[];
  /** [cardId, orientation] per slot, as drawn (checked against the recomputation) */
  cards: Array<[string, Orientation]>;
  iat: number;
  exp: number;
} & ({ v: 1 } | { v: 2; keep: [string, Orientation] });

export interface OpenedDraw {
  templateId: TemplateId;
  cards: DrawnCard[];
}

/**
 * Draws for `picks` (indexes into the shuffled deck, tap order). Throws RangeError on invalid picks. With `keep` (이어 읽기,
 * a standard three-card spread only) that card is the first position and `picks` deal the others from the deck without
 * it; the token is then a `v: 2` one carrying it. Without, the token is the `v: 1` one, as before.
 */
export async function issueDraw(templateId: TemplateId, picks: number[], secret: string, now: number, keep?: KeptCard): Promise<{ cards: DrawnCard[]; drawToken: string }> {
  const seed = randomId(16);
  const rate = DEFAULT_REVERSAL_RATE;
  const cards = drawCards(seed, rate, templateId, picks, keep);
  const common = { k: "draw" as const, seed, rate, templateId, picks, cards: cards.map((c): [string, Orientation] => [c.cardId, c.orientation]), iat: now, exp: now + DRAW_TOKEN_TTL_MS };
  const payload: DrawPayload = keep ? { ...common, v: 2, keep: [keep.cardId, keep.orientation] } : { ...common, v: 1 };
  return { cards, drawToken: await signToken(payload, secret) };
}

/** The draw behind a token, or null when the token is forged, expired or inconsistent. */
export async function openDraw(token: unknown, secret: string, now: number): Promise<OpenedDraw | null> {
  const p = await verifyToken<DrawPayload>(token, "draw", secret, now);
  if (!p || (p.v !== 1 && p.v !== 2) || !Object.hasOwn(TEMPLATES, p.templateId) || !Array.isArray(p.picks) || !Array.isArray(p.cards)) return null;
  // v2 recomputes with its kept card (a token issued while 이어 읽기 was on still opens after it is switched off).
  if (p.v === 2 && (!Array.isArray(p.keep) || p.keep.length !== 2)) return null;
  let cards: DrawnCard[];
  try {
    cards = drawCards(p.seed, p.rate, p.templateId, p.picks, p.v === 2 ? { cardId: p.keep[0], orientation: p.keep[1] } : undefined);
  } catch {
    return null;
  }
  const same = cards.length === p.cards.length && cards.every((c, i) => c.cardId === p.cards[i]?.[0] && c.orientation === p.cards[i]?.[1]);
  return same ? { templateId: p.templateId, cards } : null;
}

function drawCards(seed: string, rate: number, templateId: TemplateId, picks: number[], keep?: KeptCard): DrawnCard[] {
  if (typeof seed !== "string" || typeof rate !== "number") throw new RangeError("Bad draw");
  if (!picks.every((index) => Number.isInteger(index))) throw new RangeError("Card indexes must be integers");
  const deck = createDeck(seed, rate);
  const template = TEMPLATES[templateId];
  if (!keep) return pickCards(deck, template, picks);
  // 이어 읽기: the kept card is taken out of the deck, the picks deal positions 2..n from what is left, as today.
  if (!KEEP_TEMPLATES.has(templateId)) throw new RangeError(`Template "${templateId}" keeps no card`);
  if (keep.orientation !== "upright" && keep.orientation !== "reversed") throw new RangeError("Bad orientation");
  const at = deck.order.indexOf(keep.cardId);
  if (at < 0) throw new RangeError(`Unknown card id: ${keep.cardId}`);
  const rest: DeckState = { seed: deck.seed, order: deck.order.filter((_, i) => i !== at), orientations: deck.orientations.filter((_, i) => i !== at) };
  const dealt = pickCards(rest, { ...template, positions: template.positions.slice(1) }, picks);
  return [
    { cardId: keep.cardId, position: template.positions[0]!, orientation: keep.orientation, slot: 0 },
    ...dealt.map((card) => ({ ...card, position: template.positions[card.slot + 1]!, slot: card.slot + 1 })),
  ];
}

/** 오늘의 한 장: fixed by the device id and the KST day, so repeat visits the same day see the same card. */
export function dailyCard(deviceId: string, day: string): { cardId: string; orientation: Orientation } {
  const deck = createDeck(`daily:${deviceId}:${day}`, DEFAULT_REVERSAL_RATE);
  return { cardId: deck.order[0]!, orientation: deck.orientations[0]! };
}

export interface DealtCard {
  cardId: string;
  orientation: Orientation;
}

export const DAILY_DEAL_SIZE = 3;

/**
 * 오늘의 한 장's three face-down cards for a device and KST day: distinct cards with their
 * orientations, dealt from a deck seeded by HMAC(secret, device + day) under its own subkey. The
 * same device gets the same three all day (a refresh cannot re-roll), and nobody without the secret
 * can tell which card lies where before the pick.
 */
export async function dailyDeal(deviceId: string, day: string, secret: string): Promise<DealtCard[]> {
  const seed = await keyedHash(`${deviceId}:${day}`, secret, "starlog/daily-deal/v1");
  const deck = createDeck(`daily-deal:${seed}`, DEFAULT_REVERSAL_RATE);
  return deck.order.slice(0, DAILY_DEAL_SIZE).map((cardId, i) => ({ cardId, orientation: deck.orientations[i]! }));
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
