import { z } from "zod";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { deleteMyReview, listReviews, writeReview } from "@/lib/reviews/store";
import { REVIEW_MAX, reviewProblem } from "@/lib/reviews/text";

/**
 * 풀이 후기 (docs/superpowers/specs/2026-10-13-starlog-reviews-design.md).
 * GET ?product=&sort=recent|helpful&before= → { reviews, next, summary }: the visible reviews, public;
 * for a signed-in viewer each says whether they marked it 도움돼요 (helpfulByMe).
 * POST {readingId, rating, body?} → { review }: writes or rewrites the review of one of my saved readings.
 * DELETE ?id= → { deleted }: my review goes.
 */

const WriteBody = z.object({
  readingId: z.string().regex(/^[a-z0-9]{20}$/),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(REVIEW_MAX * 2).default(""),
});

/** What a reading that takes no review is told, by why (writeReview). */
const REFUSED: Partial<Record<string, string>> = {
  "owner-pass": "운영자 패스로 연 풀이에는 후기를 남길 수 없어요.",
  "test-payment": "시험 결제로 연 풀이에는 후기를 남길 수 없어요.",
  "review-account": "심사용 계정의 풀이에는 후기를 남길 수 없어요.",
  removed: "운영 원칙에 따라 숨긴 후기가 있는 풀이에는 후기를 다시 남길 수 없어요.",
};

export async function GET(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "ME_LIMITER" });
  if (ctx instanceof Response) return ctx;
  const params = new URL(request.url).searchParams;
  const product = params.get("product") ?? undefined;
  return json(
    await listReviews(ctx.db, {
      product: product && /^[a-z0-9-]{3,20}$/.test(product) ? product : undefined,
      sort: params.get("sort") === "helpful" ? "helpful" : "recent",
      before: params.get("before") ?? undefined,
      viewer: ctx.session?.user.id,
    }),
  );
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const body = WriteBody.safeParse(await readJson(request, 4_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const problem = reviewProblem(body.data.body);
  if (problem) return errorResponse("BAD_REQUEST", { field: "body", message: problem });
  const result = await writeReview(ctx.db, ctx.accountSecret, {
    userId: session.user.id,
    nickname: session.user.nickname,
    readingId: body.data.readingId,
    rating: body.data.rating,
    body: body.data.body,
    now: ctx.now,
  });
  if (!result.ok) {
    const refused = REFUSED[result.reason];
    return refused ? errorResponse("NOT_AVAILABLE", { message: refused }) : errorResponse("FORBIDDEN", { message: "내 계정에 저장된 풀이에만 후기를 남길 수 있어요." });
  }
  return json({ review: result.review });
}

export async function DELETE(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[a-z0-9]{16}$/.test(id)) return errorResponse("BAD_REQUEST");
  return json({ deleted: await deleteMyReview(ctx.db, session.user.id, id) });
}
