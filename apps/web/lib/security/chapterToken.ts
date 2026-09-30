import "server-only";
import type { Orientation, TemplateId } from "@starlog/core";
import type { BirthInput, TarotInputData } from "@/lib/api/inputs";
import type { FollowUpTurn } from "@/lib/ai/prompts/tarot";
import { canonicalJson, sha256, signToken, verifyToken, type SignedPayload } from "./sign";

/**
 * A chapter token travels with every opened reading. It carries what follow-ups need (the draw or
 * the birth input, the follow-up turns so far) and a digest of the reading, so the client can send
 * the reading back without being able to rewrite it. Stateless: the per-chapter cap counts turns.
 */

export type ChapterContext =
  | { kind: "tarot"; templateId: TemplateId; input: TarotInputData; cards: Array<[string, Orientation]> }
  | { kind: "saju"; birth: BirthInput };

interface ChapterPayload extends SignedPayload {
  k: "chapter";
  v: 1;
  ctx: ChapterContext;
  /** sha256 of the canonical reading JSON */
  h: string;
  turns: FollowUpTurn[];
  iat: number;
}

export async function readingDigest(reading: unknown): Promise<string> {
  return sha256(canonicalJson(reading));
}

export async function issueChapter(ctx: ChapterContext, reading: unknown, turns: FollowUpTurn[], secret: string, now: number): Promise<string> {
  const payload: ChapterPayload = { k: "chapter", v: 1, ctx, h: await readingDigest(reading), turns, iat: now };
  return signToken(payload, secret);
}

/** The chapter behind a token, or null when the token is forged or the reading was changed. */
export async function openChapter(token: unknown, reading: unknown, secret: string, now: number): Promise<{ ctx: ChapterContext; turns: FollowUpTurn[] } | null> {
  const p = await verifyToken<ChapterPayload>(token, "chapter", secret, now);
  if (!p || p.v !== 1 || !p.ctx || !Array.isArray(p.turns)) return null;
  if ((await readingDigest(reading)) !== p.h) return null;
  return { ctx: p.ctx, turns: p.turns };
}
