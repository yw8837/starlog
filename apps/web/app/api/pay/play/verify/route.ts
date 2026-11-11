import { z } from "zod";
import { openAccountRoute } from "@/lib/account/request";
import { errorResponse, json, readJson } from "@/lib/api/http";
import { playClient } from "@/lib/pay/play";
import { verifyPlayPurchase } from "@/lib/pay/playOrders";

/** `productId`: the Play product id (lib/pay/play.ts playProductId: tarot, tarot_deep, set_2027, …). */
const VerifyBody = z.object({
  purchaseToken: z.string().min(1).max(2000),
  productId: z.string().regex(/^[a-z0-9_.]{1,60}$/),
});

/**
 * POST {purchaseToken, productId} from the Android app after Google Play billing (and for each purchase the app finds
 * unfinished on start) → Google is asked about the purchase, and the reading is granted to the order it was made for, once
 * (lib/pay/playOrders.ts verifyPlayPurchase). Safe to repeat. Answers like /api/pay/confirm.
 * - No session needed, as for the Toss confirm: the token Google vouches for is the proof, and the purchase names its order
 *   and account; the grant goes to that order's account. No app user agent needed either. Rate-limited and same-origin.
 * - Not gated by STARLOG_PAYMENTS: a purchase that went through must always be recorded.
 */
export async function POST(request: Request): Promise<Response> {
  const ctx = await openAccountRoute(request, { limiter: "PAY_LIMITER", write: true });
  if (ctx instanceof Response) return ctx;
  const play = playClient();
  if (!play) return errorResponse("PAY_UNAVAILABLE");
  const body = VerifyBody.safeParse(await readJson(request, 3_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const outcome = await verifyPlayPurchase(ctx.db, play, { purchaseToken: body.data.purchaseToken, playProductId: body.data.productId, now: ctx.now });
  if (!outcome.ok) return errorResponse(outcome.code, outcome.message ? { message: outcome.message } : {});
  return json({
    status: "paid",
    orderId: outcome.order.id,
    productId: outcome.order.product_id,
    returnTo: outcome.order.return_to,
    signedIn: ctx.session?.user.id === outcome.order.user_id,
  });
}
