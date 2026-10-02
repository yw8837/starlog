import { openAccountRoute } from "@/lib/account/request";
import { CLEAR_SESSION, revokeSession } from "@/lib/account/session";
import { json, serializeCookie } from "@/lib/api/http";

/** POST → ends this device's session (the D1 row is revoked, the cookie cleared). Our own pages only. */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  if (ctx.session) await revokeSession(ctx.db, ctx.session.id, ctx.now);
  return json({ ok: true }, { cookies: [serializeCookie(CLEAR_SESSION)] });
}
