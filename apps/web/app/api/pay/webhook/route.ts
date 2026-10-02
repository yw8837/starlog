import { z } from "zod";
import { clientKey, errorResponse, json, readJson } from "@/lib/api/http";
import { accountDb } from "@/lib/db";
import { orderById } from "@/lib/pay/orders";
import { syncOrderWithToss } from "@/lib/pay/refunds";
import { tossClient } from "@/lib/pay/toss";
import type { TossPayment } from "@/lib/pay/tossTypes";
import { rateLimit } from "@/lib/security/rateLimit";

const WebhookBody = z.object({
  eventType: z.string().max(64),
  data: z.object({ paymentKey: z.string().max(200), orderId: z.string().max(64) }).passthrough(),
}).passthrough();

/**
 * POST from Toss (개발자센터 > 웹훅, event PAYMENT_STATUS_CHANGED). Payment webhooks carry no
 * signature, so the body is only a hint: we re-query the payment by key and apply what Toss answers
 * (spec 5.6). 200 within 10 s; any other status makes Toss retry, up to 7 times.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await rateLimit("WEBHOOK_LIMITER", clientKey(request)))) return errorResponse("RATE_LIMIT");
  const body = WebhookBody.safeParse(await readJson(request, 64_000));
  if (!body.success || body.data.eventType !== "PAYMENT_STATUS_CHANGED") return json({ ok: true });
  const db = accountDb();
  const toss = tossClient();
  if (!db || !toss) return errorResponse("PAY_UNAVAILABLE");
  const order = await orderById(db, body.data.data.orderId);
  if (!order) return json({ ok: true });
  let payment: TossPayment;
  try {
    payment = await toss.getPayment(body.data.data.paymentKey);
  } catch {
    return errorResponse("PAY_PENDING");
  }
  await syncOrderWithToss(db, toss, order, payment, Date.now());
  return json({ ok: true });
}
