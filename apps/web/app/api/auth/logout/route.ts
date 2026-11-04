import { openAccountRoute } from "@/lib/account/request";
import { clearSession, revokeSession } from "@/lib/account/session";
import { json, serializeCookie } from "@/lib/api/http";
import { DAILY_COOKIE } from "@/lib/security/dailyCookie";

/**
 * POST → ends this device's session (the D1 row is revoked, the cookie cleared). Our own pages only. `sl_daily` goes too: it
 * names the account's 오늘의 한 장 (code review 2026-11-04).
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  if (ctx.session) await revokeSession(ctx.db, ctx.session.id, ctx.now);
  return json({ ok: true }, { cookies: [serializeCookie(clearSession()), serializeCookie({ name: DAILY_COOKIE, value: "", maxAge: 0 })] });
}
