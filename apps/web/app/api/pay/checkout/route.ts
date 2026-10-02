import { openAccountRoute, requireSession } from "@/lib/account/request";
import { errorResponse, json } from "@/lib/api/http";
import { productById, sellable } from "@/lib/pay/catalog";
import { payProvider, paymentsMode, salesOpen, tossClientKey } from "@/lib/pay/mode";
import { tossClient } from "@/lib/pay/toss";
import { premiumOpen } from "@/lib/premium/flags";
import { isPremiumId } from "@/lib/premium/products";

/**
 * GET ?product= → what the checkout page needs before any order exists: the product, the server's
 * price, the buyer's Toss customerKey and the widget client key. The key is read at run time, so it
 * always pairs with TOSS_SECRET_KEY. No order exists until the buyer confirms the 청약철회 notice
 * (POST /api/pay/orders).
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER" });
  if (ctx instanceof Response) return ctx;
  const session = requireSession(ctx);
  if (session instanceof Response) return session;
  if (!salesOpen(paymentsMode(), ctx.owner)) return errorResponse("NOT_AVAILABLE");
  if (!tossClient()) return errorResponse("PAY_UNAVAILABLE");
  const product = productById(new URL(request.url).searchParams.get("product") ?? "");
  if (!product || !sellable(product, ctx.now)) return errorResponse("NOT_AVAILABLE");
  // P5: like the order itself (orders/route.ts), a premium checkout also needs STARLOG_PREMIUM.
  if (isPremiumId(product.id) && !premiumOpen(product.id, ctx.owner, ctx.now)) return errorResponse("NOT_AVAILABLE");
  const mock = payProvider() === "mock";
  return json({
    productId: product.id,
    name: product.name,
    amount: product.krw,
    customerKey: session.user.customer_key,
    provider: mock ? "mock" : "toss",
    clientKey: mock ? null : tossClientKey(),
  });
}
