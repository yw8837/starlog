import "server-only";
import { openJson, sealJson } from "@/lib/account/secrets";
import { canonicalJson, sha256 } from "./sign";

/**
 * 감질맛 맛보기 (spec 2026-10-14-teaser-second-card-design): the free teaser shows the second card cut about halfway
 * (`teaserCut`), and hands the device both cards in full sealed (AES-GCM, lib/account/secrets.ts) under their own key.
 * The seal opens only for the same draw token and reading input, so the paid reading can carry on from the cut; the
 * hidden part never leaves the server as text. Anything that does not open is no seal: the reading is written as before.
 */

export interface WrittenCard {
  heading: string;
  body: string;
}

/** The draw token lives 24 hours (drawToken.ts); a seal never outlives a week either way. */
export const TEASER_SEAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Two sealed 250–350-character paragraphs come to about 5,000 characters; anything longer is no seal (inputs.ts). */
export const MAX_TEASER_SEAL_CHARS = 12_000;

interface TeaserPayload {
  v: 1;
  exp: number;
  first: WrittenCard;
  second: WrittenCard;
}

/** Its own key, like the premium resume token's: the signing secret under the label `teaser-v1`. */
const keyOf = (secret: string) => `teaser-v1:${secret}`;

/** The AES-GCM additional data: the draw token and the reading input (keys in any order), so no other draw or question opens it. */
async function contextOf(binding: { drawToken: string; input: unknown }): Promise<string> {
  return `teaser-v1:${await sha256(binding.drawToken)}:${await sha256(canonicalJson(binding.input))}`;
}

export async function sealTeaser(cards: readonly [WrittenCard, WrittenCard], binding: { drawToken: string; input: unknown }, secret: string, now: number): Promise<string> {
  const [first, second] = cards;
  const payload: TeaserPayload = { v: 1, exp: now + TEASER_SEAL_TTL_MS, first, second };
  return sealJson(payload, keyOf(secret), await contextOf(binding));
}

const isCard = (value: unknown): value is WrittenCard =>
  typeof value === "object" && value !== null && typeof (value as WrittenCard).heading === "string" && typeof (value as WrittenCard).body === "string";

/** The two cards in full, or null when the seal is missing, altered, expired, or made for another draw or input. */
export async function openTeaserSeal(seal: unknown, binding: { drawToken: string; input: unknown }, secret: string, now: number): Promise<[WrittenCard, WrittenCard] | null> {
  if (typeof seal !== "string" || seal.length === 0 || seal.length > MAX_TEASER_SEAL_CHARS) return null;
  const p = await openJson<TeaserPayload>(seal, keyOf(secret), await contextOf(binding));
  if (!p || p.v !== 1 || typeof p.exp !== "number" || p.exp <= now || !isCard(p.first) || !isCard(p.second)) return null;
  return [{ heading: p.first.heading, body: p.first.body }, { heading: p.second.heading, body: p.second.body }];
}

/** Where the cut may fall: 요. 다. ? ! … followed by a space or the end. */
const SENTENCE_END = /(?:요\.|다\.|[?!…])(?=\s|$)/g;

/**
 * The part of the second card the teaser shows: up to the sentence end nearest half its characters, never under 35% or
 * over 65% of them; with no sentence end there, up to the space nearest half (the screen adds "…" either way).
 */
export function teaserCut(body: string): string {
  const text = body.trim();
  const [lo, hi, half] = [text.length * 0.35, text.length * 0.65, text.length / 2];
  const nearest = (ends: number[]) => ends.filter((at) => at >= lo && at <= hi).sort((a, b) => Math.abs(a - half) - Math.abs(b - half))[0];
  const sentence = nearest([...text.matchAll(SENTENCE_END)].map((m) => m.index + m[0].length));
  const space = nearest([...text.matchAll(/\s/g)].map((m) => m.index));
  return text.slice(0, sentence ?? space ?? Math.round(half)).trimEnd();
}
