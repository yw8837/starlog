import { z } from "zod";
import { openAccountRoute } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { confirmOrder, orderById } from "@/lib/pay/orders";
import { tossClient } from "@/lib/pay/toss";

const ConfirmBody = z.object({
  paymentKey: z.string().min(1).max(200),
  orderId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  amount: z.coerce.number().int().positive(),
});

/**
 * POST {paymentKey, orderId, amount} from /pay/success (Toss's successUrl query) → confirm with Toss
 * and grant the reading to the order's account, once. Safe to repeat.
 * - No session needed (M5): a card app or KakaoTalk can return the buyer in a browser without it.
 *   The order id and Toss's paymentKey are the proof, the amount must be the order's, and the grant
 *   goes to order.user_id. Rate-limited and same-origin like every payment POST.
 * - Not gated by STARLOG_PAYMENTS: a payment that already started must always be confirmable.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const toss = tossClient();
  if (!toss) return errorResponse("PAY_UNAVAILABLE");
  const body = ConfirmBody.safeParse(await readJson(request, 2_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const order = await orderById(ctx.db, body.data.orderId);
  if (!order) return errorResponse("BAD_REQUEST");
  const outcome = await confirmOrder(ctx.db, toss, { order, paymentKey: body.data.paymentKey, amount: body.data.amount, now: ctx.now });
  if (!outcome.ok) return errorResponse(outcome.code, outcome.message ? { message: outcome.message } : {});
  return json({
    status: "paid",
    orderId: outcome.order.id,
    productId: outcome.order.product_id,
    returnTo: outcome.order.return_to,
    signedIn: ctx.session?.user.id === outcome.order.user_id,
  });
}
