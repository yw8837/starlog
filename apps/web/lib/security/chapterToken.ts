import "server-only";
import type { Orientation, TemplateId } from "@starlog/core";
import type { SajuProfile } from "@/lib/ai/prompts/saju";
import type { BirthInput, TarotInputData } from "@/lib/api/inputs";
import type { FollowUpTurn } from "@/lib/ai/prompts/tarot";
import { canonicalJson, sha256, signToken, verifyToken, type SignedPayload } from "./sign";

/**
 * A chapter token travels with every opened reading. It carries what follow-ups need (the draw or
 * the birth input, the follow-up turns so far) and a digest of the reading, so the client can send
 * the reading back without being able to rewrite it. The token expires 7 days after the reading
 * (follow-up turns keep the original expiry). The per-chapter cap is also counted server-side under
 * the chapter's id (spend.ts), so replaying an older token with fewer turns does not reset it.
 */

export const CHAPTER_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ChapterContext =
  | { kind: "tarot"; templateId: TemplateId; input: Omit<TarotInputData, "history">; cards: Array<[string, Orientation]> }
  | { kind: "saju"; birth: BirthInput; profile?: SajuProfile };

interface ChapterPayload extends SignedPayload {
  k: "chapter";
  v: 1;
  ctx: ChapterContext;
  /** sha256 of the canonical reading JSON */
  h: string;
  turns: FollowUpTurn[];
  iat: number;
  exp: number;
}

export async function readingDigest(reading: unknown): Promise<string> {
  return sha256(canonicalJson(reading));
}

/** `exp` defaults to 7 days from now (a new reading); follow-ups pass the chapter's own expiry. */
export async function issueChapter(
  ctx: ChapterContext, reading: unknown, turns: FollowUpTurn[], secret: string, now: number, exp = now + CHAPTER_TOKEN_TTL_MS,
): Promise<string> {
  const payload: ChapterPayload = { k: "chapter", v: 1, ctx, h: await readingDigest(reading), turns, iat: now, exp };
  return signToken(payload, secret);
}

/** The chapter behind a token, or null when the token is forged, expired or the reading was changed. */
export async function openChapter(
  token: unknown, reading: unknown, secret: string, now: number,
): Promise<{ id: string; ctx: ChapterContext; turns: FollowUpTurn[]; exp: number } | null> {
  const p = await verifyToken<ChapterPayload>(token, "chapter", secret, now);
  if (!p || p.v !== 1 || !p.ctx || !Array.isArray(p.turns) || typeof p.exp !== "number") return null;
  if ((await readingDigest(reading)) !== p.h) return null;
  // Every token of one chapter shares the reading digest and the original expiry.
  return { id: `${p.exp}.${p.h}`, ctx: p.ctx, turns: p.turns, exp: p.exp };
}
