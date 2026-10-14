import "server-only";
import type { Orientation, TemplateId } from "@starlog/core";
import type { MatchRelation } from "@/lib/ai/prompts/match";
import type { SajuProfile } from "@/lib/ai/prompts/saju";
import type { BirthInput, TarotInputData } from "@/lib/api/inputs";
import type { FollowUpTurn } from "@/lib/ai/prompts/tarot";
import type { PremiumId } from "@/lib/premium/products";
import type { SajuTopicId } from "@/lib/reading/types";
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
  /**
   * `opening`: opened with 오픈 기념 무료 (signed; absent on every other opening and on older tokens):
   * read and kept on the device only, so the follow-up and share routes refuse it.
   */
  | { kind: "tarot"; templateId: TemplateId; input: Omit<TarotInputData, "history">; cards: Array<[string, Orientation]>; opening?: true }
  /** 주제별 사주 chapters carry their topic (signed; `v` stays 1; a token without it is 전체 흐름). */
  | { kind: "saju"; birth: BirthInput; profile?: SajuProfile; topic?: SajuTopicId }
  /** P5 premium readings. The match token carries the partner's birth: signed, not encrypted, kept only in the user's own chapter (P5 spec §9). */
  | { kind: "tarot-deep"; input: Omit<TarotInputData, "history">; cards: Array<[string, Orientation]> }
  | {
    kind: "match";
    me: { birth: BirthInput; profile?: SajuProfile };
    partner: { birth: BirthInput; label?: string };
    relation: MatchRelation;
    concern?: string;
    cards: Array<[string, Orientation]>;
  }
  | { kind: "newyear-2027"; birth: BirthInput; profile?: SajuProfile };

export const isOpeningChapter = (ctx: ChapterContext) => ctx.kind === "tarot" && ctx.opening === true;

export const isPremiumChapter = (ctx: ChapterContext): ctx is Extract<ChapterContext, { kind: PremiumId }> =>
  ctx.kind === "tarot-deep" || ctx.kind === "match" || ctx.kind === "newyear-2027";

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

/**
 * The chapter behind a token for 결과 공유: like openChapter, but a token past its 7 days still counts.
 * The expiry only ends the follow-ups; the signature and the reading digest still prove the reading
 * is the one the server wrote, which is all a share needs.
 */
export async function openChapterForShare(
  token: unknown, reading: unknown, secret: string,
): Promise<{ id: string; ctx: ChapterContext } | null> {
  // verifyToken only refuses an expiry at or before `now`; 0 lets every expiry pass.
  const chapter = await openChapter(token, reading, secret, 0);
  return chapter ? { id: chapter.id, ctx: chapter.ctx } : null;
}
