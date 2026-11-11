import { z } from "zod";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { orderForUser } from "@/lib/pay/orders";
import { playClient } from "@/lib/pay/play";
import { paidWithPlay, refundUnusedPlayOrder } from "@/lib/pay/playOrders";
import { refundDeadline, refundUnusedOrder, type RefundOutcome } from "@/lib/pay/refunds";
import { tossClient } from "@/lib/pay/toss";

/** `amount`: what the buyer's screen showed and the buyer confirmed, in 원 (a screen from before it was sent: the whole payment). */
const RefundBody = z.object({ orderId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/), amount: z.number().int().positive().max(10_000_000).optional() });

/**
 * POST {orderId} → refund of what was never opened of a paid order (내 정보 > 결제한 풀이 > 환불받기): all of it, or for a
 * set with one reading opened the other's part (owner 2026-11-10; the amount from the catalog, never the request), through
 * the end of the REFUND_DAYS-th KST day after the payment; `amount` says what was refunded. After that REFUND_WINDOW_CLOSED
 * (the reading can still be opened, and the operator still refunds company-side failures by hand). Only the amount the buyer
 * confirmed is refunded (`amount`; none: the whole payment, all an older screen offered): if it is another amount now (a
 * reading opened meanwhile), REFUND_AMOUNT_CHANGED and nothing moves; the screen reloads and asks again.
 * An order paid with Google Play (the Android app) is refunded whole through Google under the same window and amount check
 * (lib/pay/playOrders.ts refundUnusedPlayOrder; a set with one reading opened goes to the operator); it needs this deploy's
 * Play client.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const body = RefundBody.safeParse(await readJson(request, 1_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const order = await orderForUser(ctx.db, body.data.orderId, session.user.id);
  if (!order) return errorResponse("NOT_REFUNDABLE");
  // By the order alone, whatever its lot's state now: an opening released between this read and the
  // refund lock must not let a late refund through. No lot at all: nothing to refund, nor a payment
  // time to check the window by.
  // A set holds two lots, written in one batch: the earliest is the payment time.
  const paid = await ctx.db.prepare("SELECT MIN(created_at) AS created_at FROM credit_lots WHERE order_id = ?").bind(order.id).first<{ created_at: number | null }>();
  if (paid?.created_at == null) return errorResponse("NOT_REFUNDABLE");
  if (ctx.now > refundDeadline(paid.created_at)) return errorResponse("REFUND_WINDOW_CLOSED");
  const expected = body.data.amount ?? order.amount_krw;
  // Each payment needs only its own provider: a Play order Google Play, a Toss order Toss.
  let outcome: RefundOutcome;
  if (await paidWithPlay(ctx.db, order.id)) {
    const play = playClient();
    if (!play) return errorResponse("PAY_UNAVAILABLE");
    outcome = await refundUnusedPlayOrder(ctx.db, play, { order, now: ctx.now, expected });
  } else {
    const toss = tossClient();
    if (!toss) return errorResponse("PAY_UNAVAILABLE");
    outcome = await refundUnusedOrder(ctx.db, toss, { order, reason: "구매자 요청: 열지 않은 풀이 환불", now: ctx.now, expected });
  }
  if (!outcome.ok) return errorResponse(outcome.code, outcome.message ? { message: outcome.message } : {});
  return json({ ok: true, status: "refunded", amount: outcome.amount });
}
