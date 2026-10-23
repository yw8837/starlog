import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { syncRevisionInForce } from "@/lib/legal";
import { MOVE_MAX_BYTES, MoveBody, moveReadings } from "@/lib/readings/move";

/**
 * POST {chapters: [{id, chapterToken, reading, title?, summary?}]} (at most MOVE_BATCH) → {moved: [{id, readingId}],
 * kept: [{id, reason}]}: moves readings this device kept into my account, when I ask (account sync, lib/readings/move.ts).
 * Only what the server can vouch for moves; the rest stays on the device. Logged in, from our own pages, and from the
 * privacy revision of SYNC_REVISION_DATE (before it, 409 NOT_AVAILABLE `reason: "not-yet"`).
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "AUTH_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  if (!syncRevisionInForce(ctx.now)) return errorResponse("NOT_AVAILABLE", { reason: "not-yet" });
  const body = MoveBody.safeParse(await readJson(request, MOVE_MAX_BYTES));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const result = await moveReadings(ctx.db, { signing: ctx.secret, account: ctx.accountSecret }, session.user.id, body.data.chapters, ctx.now);
  console.info(JSON.stringify({ evt: "readings.moved", moved: result.moved.length, kept: result.kept.length }));
  return json(result);
}
