import { z } from "zod";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import type { MatchRelation } from "@/lib/ai/prompts/match";
import { errorResponse, json, readJson } from "@/lib/api/http";
import type { BirthInput } from "@/lib/api/inputs";
import { profileOf } from "@/lib/api/sajuRequest";
import type { SajuProfile } from "@/lib/ai/prompts/saju";
import { answeredTurns } from "@/lib/api/chapterTurns";
import type { D1Binding } from "@/lib/db/d1";
import { MatchBody, READING_MAX_BYTES } from "@/lib/premium/inputs";
import { openPartner, sealPartner } from "@/lib/premium/partnerSeal";
import { PREMIUM, PREMIUM_CHAPTER_TTL_MS } from "@/lib/premium/products";
import { inputHash, openResume } from "@/lib/premium/resume";
import { readingForUser } from "@/lib/readings/store";
import { chapterIdOf, issueChapter, openChapter, type ChapterContext } from "@/lib/security/chapterToken";

/**
 * POST {readingId, sealed} or {readingId, input, resume} → {chapterToken, followUpsLeft} (review 2026-10-17 H3).
 * A 궁합's chapter token again for the device that wrote it, whose copy came back from the account without one (a
 * logout, a reading delivered after a cut-off, 409 opened). The partner comes from the device only: the seal it kept
 * (this server's AES-GCM, kept across a logout), or the tab's own input, which the reading's resume token vouches for
 * by its input hash, sealed anew. The account still holds no partner (owner 2026-10-16). The token is the same
 * chapter (same expiry and reading), so the follow-ups already answered stay counted.
 */

const ReadingId = z.string().regex(/^[a-z0-9]{20}$/);
const Body = z.union([
  z.object({ readingId: ReadingId, sealed: z.string().min(1).max(2_000) }),
  z.object({ readingId: ReadingId, resume: z.string().min(1).max(120_000), input: MatchBody }),
]);

interface MatchCopy {
  kind: "match";
  reading: unknown;
  me: { birth: BirthInput; profile?: SajuProfile };
  relation: MatchRelation;
  partnerLabel?: string;
  concern?: string;
}

const refused = () => errorResponse("BAD_TOKEN", { message: PARTNER_MISSING });
const PARTNER_MISSING = "이 기기에서 이어서 물어볼 수 있는 풀이가 아니에요.";

/** Paid for as the reading was opened (a purchase, not a test payment on a production deploy): the follow-ups' book. */
async function paidFor(db: D1Binding, userId: string, readingId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT r.source AS source, p.mode AS mode FROM readings r
       LEFT JOIN unlocks u ON u.id = r.unlock_id
       LEFT JOIN credit_lots l ON l.id = json_extract(u.allocations, '$[0][0]')
       LEFT JOIN payments p ON p.order_id = l.order_id
       WHERE r.id = ? AND r.user_id = ?`,
    )
    .bind(readingId, userId)
    .first<{ source: string; mode: string | null }>();
  return row?.source === "paid" && !(process.env.NODE_ENV === "production" && row.mode === "test");
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const parsed = Body.safeParse(await readJson(request, READING_MAX_BYTES));
  if (!parsed.success) return errorResponse("BAD_REQUEST");
  const body = parsed.data;
  const userId = session.user.id;

  const saved = await readingForUser(ctx.db, ctx.accountSecret, userId, body.readingId);
  const copy = saved?.chapter as unknown as MatchCopy | undefined;
  if (!saved || copy?.kind !== "match") return refused();
  const exp = saved.createdAt + PREMIUM_CHAPTER_TTL_MS;
  if (exp <= ctx.now) return refused();

  const chapterId = await chapterIdOf(copy.reading, exp);
  let sealed: string;
  let profile: ReturnType<typeof profileOf>;
  if ("sealed" in body) {
    if (!(await openPartner(body.sealed, ctx.secret, chapterId))) return refused();
    sealed = body.sealed;
    profile = copy.me.profile;
  } else {
    const hash = await inputHash("match", body.input, ctx.secret);
    const resume = await openResume(body.resume, { product: "match", subject: userId, inputHash: hash }, ctx.secret, ctx.now);
    if (!resume?.unlockId) return refused();
    const delivered = await ctx.db
      .prepare("SELECT 1 AS x FROM unlocks WHERE id = ? AND user_id = ? AND status = 'delivered' AND reading_id = ?")
      .bind(resume.unlockId, userId, body.readingId)
      .first();
    if (!delivered) return refused();
    sealed = await sealPartner(body.input.partner.birth, ctx.secret, chapterId);
    profile = profileOf(body.input.me);
  }

  const chapterCtx: ChapterContext = {
    kind: "match",
    me: { birth: copy.me.birth, ...(profile ? { profile } : {}) },
    partner: { sealed, ...(copy.partnerLabel ? { label: copy.partnerLabel } : {}) },
    relation: copy.relation,
    ...(copy.concern ? { concern: copy.concern } : {}),
    paid: await paidFor(ctx.db, userId, body.readingId),
  };
  const chapterToken = await issueChapter(chapterCtx, copy.reading, [], ctx.secret, ctx.now, exp);
  const chapter = await openChapter(chapterToken, copy.reading, ctx.secret, ctx.now);
  const answered = chapter ? await answeredTurns(chapter.id) : null;
  if (answered === null) return errorResponse("AI_UNAVAILABLE");
  return json({ chapterToken, followUpsLeft: Math.max(0, PREMIUM.match.followUps - answered) });
}
