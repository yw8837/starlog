import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json } from "@/lib/api/http";
import { myReview } from "@/lib/reviews/store";

/** GET ?readingId= → { review }: my review of one of my saved readings (null when there is none), hidden ones too. */
export async function GET(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "ME_LIMITER" });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const readingId = new URL(request.url).searchParams.get("readingId") ?? "";
  if (!/^[a-z0-9]{20}$/.test(readingId)) return errorResponse("BAD_REQUEST");
  return json({ review: await myReview(ctx.db, session.user.id, readingId) });
}
