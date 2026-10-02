import { issueDeleteIntent } from "@/lib/account/deletion";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { json } from "@/lib/api/http";

/** POST (our own pages only) → the URL that starts the Kakao re-check for deleting this account. */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const intent = await issueDeleteIntent(session.id, ctx.secret, ctx.now);
  return json({ url: `/api/auth/kakao/start?purpose=delete&intent=${encodeURIComponent(intent)}` });
}
