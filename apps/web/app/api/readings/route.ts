import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json } from "@/lib/api/http";
import { READINGS_PAGE, deleteAllReadings, deleteReading, listReadings } from "@/lib/readings/store";

/**
 * GET [?before=<cursor>][&limit=n] → { readings, next }: the readings saved in my account, newest
 * first, READINGS_PAGE at a time. 내 정보 and the result pages follow `next` (lib/storage/sync.ts).
 * A cursor that does not parse starts from the newest.
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER" });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit") ?? READINGS_PAGE);
  return json(await listReadings(ctx.db, ctx.accountSecret, session.user.id, {
    before: params.get("before") ?? undefined,
    limit: Number.isInteger(limit) ? limit : READINGS_PAGE,
  }));
}

/** DELETE ?id=<id> → removes one saved reading; ?all=1 → all of them (개인정보 파기 on request). */
export async function DELETE(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const params = new URL(request.url).searchParams;
  if (params.get("all") === "1") return json({ deleted: await deleteAllReadings(ctx.db, session.user.id) });
  const id = params.get("id") ?? "";
  if (!/^[a-z0-9]{20}$/.test(id)) return errorResponse("BAD_REQUEST");
  return json({ deleted: (await deleteReading(ctx.db, session.user.id, id)) ? 1 : 0 });
}
