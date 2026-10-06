import { deleteAccount, issueDeleteIntent } from "@/lib/account/deletion";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { isReviewer } from "@/lib/account/review";
import { clearSession } from "@/lib/account/session";
import { json, serializeCookie } from "@/lib/api/http";
import { tossClient } from "@/lib/pay/toss";

/**
 * POST (our own pages only) → the URL that starts the Kakao re-check for deleting this account.
 * The review account (lib/account/review.ts) has no Kakao login to re-check: it is deleted right
 * here, as the Kakao callback would (settle, refund unopened purchases, erase), and the URL is where
 * 내 정보 says how that went.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  if (isReviewer(session.user)) {
    const outcome = await deleteAccount(ctx.db, tossClient(), { userId: session.user.id, now: ctx.now });
    if (!outcome.ok) return json({ url: `/me?delete=${outcome.code === "PENDING" ? "pending" : outcome.code === "IN_USE" ? "in-use" : "refund-failed"}` });
    return json({ url: "/me?account=deleted" }, { cookies: [serializeCookie(clearSession())] });
  }
  const intent = await issueDeleteIntent(session.id, ctx.secret, ctx.now);
  return json({ url: `/api/auth/kakao/start?purpose=delete&intent=${encodeURIComponent(intent)}` });
}
