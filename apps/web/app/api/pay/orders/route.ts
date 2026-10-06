import { z } from "zod";
import { openAccountRoute, requireSession } from "@/lib/account/request";
import { safeReturnTo } from "@/lib/account/returnTo";
import { isReviewer } from "@/lib/account/review";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { productById, sellable } from "@/lib/pay/catalog";
import { paymentsMode, salesOpen } from "@/lib/pay/mode";
import { RECONCILE_AFTER_MS, createOrder, orderById, orderHistory, reconcileConfirming, type OrderRow } from "@/lib/pay/orders";
import { reconcileRefunding } from "@/lib/pay/refunds";
import { tossClient } from "@/lib/pay/toss";
import { premiumOpen } from "@/lib/premium/flags";
import { isPremiumId } from "@/lib/premium/products";

/** `ack: true` = the buyer ticked the 청약철회 notice on the checkout page (its time is kept on the order). */
const OrderBody = z.object({ productId: z.string().max(40), returnTo: z.string().max(200).optional(), ack: z.literal(true) });

/** POST {productId, returnTo?, ack: true} → a new order at the catalog price, plus Toss's success and fail URLs. */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  // The review account buys like the owner pass (lib/account/review.ts), premium excepted.
  if (!salesOpen(paymentsMode(), ctx.owner || (await isReviewer(session.user, ctx.accountSecret)))) return errorResponse("NOT_AVAILABLE");
  if (!tossClient()) return errorResponse("PAY_UNAVAILABLE");
  const body = OrderBody.safeParse(await readJson(request, 2_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const product = productById(body.data.productId);
  if (!product || !sellable(product, ctx.now)) return errorResponse("NOT_AVAILABLE");
  // P5: premium orders also need STARLOG_PREMIUM (lib/premium/flags.ts).
  if (isPremiumId(product.id) && !premiumOpen(product.id, ctx.owner, ctx.now)) return errorResponse("NOT_AVAILABLE");
  const order = await createOrder(ctx.db, { userId: session.user.id, product, returnTo: safeReturnTo(body.data.returnTo), now: ctx.now });
  const origin = new URL(request.url).origin;
  console.info(JSON.stringify({ evt: "pay.order_created", orderId: order.id, productId: product.id }));
  return json({ orderId: order.id, orderName: order.order_name, amount: order.amount_krw, successUrl: `${origin}/pay/success`, failUrl: `${origin}/pay/fail` });
}

/**
 * GET ?id= → one order's status, settling a lost confirm with Toss. No session needed: the success
 * page may run in another browser (spec 5.3); the 24-character order id is the proof.
 * GET → 결제 내역 (session).
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER" });
  if (ctx instanceof Response) return ctx;
  const toss = tossClient();
  const id = new URL(request.url).searchParams.get("id");
  if (id !== null) {
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return errorResponse("BAD_REQUEST");
    let order = await orderById(ctx.db, id);
    if (!order) return errorResponse("BAD_REQUEST");
    if (toss) order = await reconcileConfirming(ctx.db, toss, order, ctx.now);
    if (toss) order = await reconcileRefunding(ctx.db, toss, order, ctx.now);
    return json({ orderId: order.id, productId: order.product_id, status: order.status, returnTo: order.return_to, signedIn: ctx.session?.user.id === order.user_id });
  }
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  if (toss) {
    const { results } = await ctx.db
      .prepare("SELECT * FROM orders WHERE user_id = ? AND status IN ('confirming', 'refunding') AND updated_at < ?")
      .bind(session.user.id, ctx.now - RECONCILE_AFTER_MS)
      .all<OrderRow>();
    for (const stale of results) {
      await reconcileConfirming(ctx.db, toss, stale, ctx.now);
      await reconcileRefunding(ctx.db, toss, stale, ctx.now);
    }
  }
  return json({ orders: await orderHistory(ctx.db, session.user.id) });
}
