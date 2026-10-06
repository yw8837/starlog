import { z } from "zod";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { orderForUser } from "@/lib/pay/orders";
import { refundDeadline, refundUnusedOrder } from "@/lib/pay/refunds";
import { tossClient } from "@/lib/pay/toss";

const RefundBody = z.object({ orderId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/) });

/**
 * POST {orderId} → full refund of a paid reading that was never opened (내 정보 > 결제 내역 > 환불받기),
 * through the end of the REFUND_DAYS-th KST day after the payment; after that REFUND_WINDOW_CLOSED
 * (the reading can still be opened, and the operator still refunds company-side failures by hand).
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  const toss = tossClient();
  if (!toss) return errorResponse("PAY_UNAVAILABLE");
  const body = RefundBody.safeParse(await readJson(request, 1_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const order = await orderForUser(ctx.db, body.data.orderId, session.user.id);
  if (!order) return errorResponse("NOT_REFUNDABLE");
  // By the order alone, whatever its lot's state now: an opening released between this read and the
  // refund lock must not let a late refund through.
  const paid = await ctx.db.prepare("SELECT created_at FROM credit_lots WHERE order_id = ?").bind(order.id).first<{ created_at: number }>();
  if (paid && ctx.now > refundDeadline(paid.created_at)) return errorResponse("REFUND_WINDOW_CLOSED");
  const outcome = await refundUnusedOrder(ctx.db, toss, { order, reason: "구매자 요청: 열지 않은 풀이 환불", now: ctx.now });
  if (!outcome.ok) return errorResponse(outcome.code, outcome.message ? { message: outcome.message } : {});
  return json({ ok: true, status: "refunded" });
}
