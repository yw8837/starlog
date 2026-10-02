import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { forfeitStatements, lockPaidLotForRefund, refundedLotStatements, refundingLot, revertRefund, revokeLotStatement, type Lot } from "./ledger";
import { markPaid, orderById, type OrderRow } from "./orders";
import { isPendingTossError, type TossClient, type TossError, type TossPayment } from "./tossTypes";

/**
 * Refunds and Toss reconciliation (spec 5.5, 5.6). The order and its lot leave use together before
 * the cancel call (M1), so nobody can open a reading while its payment is being cancelled. An
 * unknown answer is settled by looking the payment up, never by guessing or by the clock (M2).
 */

export type RefundOutcome = { ok: true } | { ok: false; code: "NOT_REFUNDABLE" | "PAY_FAILED" | "PAY_PENDING"; message?: string };

/** How long a `refunding` order waits before Toss is asked: far past the 30 s client timeout and Toss's own processing. */
export const REFUND_RECONCILE_AFTER_MS = 10 * 60_000;
/** A deleted account's payment is cancelled at most this many times automatically; then the runbook takes over. */
export const ORPHAN_MAX_ATTEMPTS = 5;

/** Toss replays an Idempotency-Key's first answer for 15 days: each attempt has its own key. */
export const cancelKey = (order: Pick<OrderRow, "id" | "cancel_attempt">) => `cancel-${order.id}-${order.cancel_attempt}`;

/**
 * Records a full cancellation Toss confirmed, in one batch, from what D1 holds now (never from what a
 * caller read earlier), so applying it twice changes nothing the second time:
 * - a lot locked for the refund leaves as a refund, booked once;
 * - a lot still in use (its reading open or opening) is revoked (minor 1): the payment is gone;
 * - the order becomes refunded and the payment row records the cancellation.
 */
export async function applyCancel(db: D1Binding, order: OrderRow, payment: TossPayment, now: number): Promise<void> {
  const [revoked] = await db.batch([
    revokeLotStatement(db, order.id),
    ...refundedLotStatements(db, order.id, now),
    db.prepare("UPDATE orders SET status = 'refunded', updated_at = ? WHERE id = ? AND status IN ('paid', 'refunding')").bind(now, order.id),
    db
      .prepare("UPDATE payments SET status = ?, canceled_amount = ?, canceled_at = COALESCE(canceled_at, ?), updated_at = ? WHERE order_id = ?")
      .bind(payment.status, payment.totalAmount - payment.balanceAmount, new Date(now).toISOString(), now, order.id),
  ]);
  // Cancelled in the dashboard while the reading was open or opening: it left use for good.
  if (revoked?.meta?.changes) console.warn(JSON.stringify({ evt: "pay.canceled_after_open", orderId: order.id }));
  console.info(JSON.stringify({ evt: "pay.refunded", orderId: order.id }));
}

async function nextAttempt(db: D1Binding, orderId: string, now: number): Promise<void> {
  await db.prepare("UPDATE orders SET cancel_attempt = cancel_attempt + 1, updated_at = ? WHERE id = ? AND status = 'refunding'").bind(now, orderId).run();
}

/**
 * Sends the cancel for a `refunding` order and settles what Toss answers (M2).
 * - CANCELED → applied.
 * - 409 processing, 5xx or no answer → stays `refunding` (PAY_PENDING); reconcileRefunding decides.
 * - Any other error → the payment is looked up first. CANCELED → applied. DONE → the cancel was
 *   refused: the reading comes back with a new attempt (an orphan just moves to its next attempt).
 *   Anything else → pending.
 */
async function sendCancel(db: D1Binding, toss: TossClient, order: OrderRow, lot: Lot | null, reason: string, now: number): Promise<RefundOutcome> {
  let payment: TossPayment;
  try {
    payment = await toss.cancel(order.payment_key!, { reason, idempotencyKey: cancelKey(order) });
  } catch (error) {
    if (isPendingTossError(error)) {
      console.warn(JSON.stringify({ evt: "pay.refund_unknown", orderId: order.id }));
      return { ok: false, code: "PAY_PENDING" };
    }
    const refusal = error as TossError;
    const found = await toss.getPayment(order.payment_key!).catch(() => null);
    if (found?.status === "CANCELED") {
      payment = found;
    } else if (found?.status === "DONE") {
      if (lot) await revertRefund(db, order.id, now);
      else await nextAttempt(db, order.id, now);
      console.info(JSON.stringify({ evt: "pay.refund_refused", orderId: order.id, code: refusal.code }));
      return { ok: false, code: "PAY_FAILED", message: refusal.message || "환불하지 못했어요. 문의해 주세요." };
    } else {
      return { ok: false, code: "PAY_PENDING" };
    }
  }
  if (payment.status !== "CANCELED") {
    console.warn(JSON.stringify({ evt: "pay.refund_unexpected", orderId: order.id, status: payment.status }));
    return { ok: false, code: "PAY_PENDING" };
  }
  await applyCancel(db, order, payment, now);
  return { ok: true };
}

/**
 * A payment made under other Toss keys than these (a test payment once the deploy runs live keys).
 * These keys can neither look it up nor cancel it, so it is never sent to Toss: the operator settles
 * it by hand (runbook section 5). Logged with the order id.
 */
export async function paidUnderOtherKeys(db: D1Binding, toss: TossClient, orderId: string): Promise<boolean> {
  const row = await db.prepare("SELECT mode FROM payments WHERE order_id = ?").bind(orderId).first<{ mode: string }>();
  if (!row || row.mode === toss.mode) return false;
  console.warn(JSON.stringify({ evt: "pay.other_keys", orderId }));
  return true;
}

/** Shown when a payment can only be refunded by hand (paidUnderOtherKeys). */
export const OTHER_KEYS_MESSAGE = "이 결제는 바로 환불할 수 없어요. 문의해 주시면 확인하고 처리해 드릴게요.";

/**
 * Account deletion, for an unopened reading paid under other keys: its lot leaves use (revoked, with
 * its ledger row), the order stays as it is for the operator, and the deletion goes on.
 */
export async function setAsideForOperator(db: D1Binding, orderId: string, now: number): Promise<void> {
  const lot = await db.prepare("SELECT * FROM credit_lots WHERE order_id = ? AND status = 'active' AND units_left > 0").bind(orderId).first<Lot>();
  if (lot) await db.batch(forfeitStatements(db, lot, "revoked", now));
}

/** Cancels the payment of a paid reading that was never opened (the user's 환불, account deletion). */
export async function refundUnusedOrder(db: D1Binding, toss: TossClient, input: { order: OrderRow; reason: string; now: number }): Promise<RefundOutcome> {
  const { order, reason, now } = input;
  if (order.status !== "paid" || !order.payment_key) return { ok: false, code: "NOT_REFUNDABLE" };
  if (await paidUnderOtherKeys(db, toss, order.id)) return { ok: false, code: "NOT_REFUNDABLE", message: OTHER_KEYS_MESSAGE };
  const lot = await lockPaidLotForRefund(db, order.id, now);
  if (!lot) return { ok: false, code: "NOT_REFUNDABLE" };
  return sendCancel(db, toss, (await orderById(db, order.id)) ?? order, lot, reason, now);
}

const ORPHAN_REASON = "탈퇴한 계정에 도착한 결제 자동 취소";

/** A payment that went through for a deleted account (Task 7 left it `refunding`, with no lot): cancel it. */
export async function refundOrphan(db: D1Binding, toss: TossClient, order: OrderRow, now: number): Promise<RefundOutcome> {
  if (order.status !== "refunding" || order.fail_code !== "ACCOUNT_DELETED" || !order.payment_key) return { ok: false, code: "NOT_REFUNDABLE" };
  if (await paidUnderOtherKeys(db, toss, order.id)) return { ok: false, code: "NOT_REFUNDABLE" };
  return sendCancel(db, toss, order, null, ORPHAN_REASON, now);
}

/**
 * A `refunding` order whose cancel answer was unknown, looked up REFUND_RECONCILE_AFTER_MS later.
 * - CANCELED at Toss → refunded.
 * - Still DONE → a refund: the reading comes back (revertRefund, next attempt). An orphan: the
 *   next attempt is sent, up to ORPHAN_MAX_ATTEMPTS.
 * - PARTIAL_CANCELED → logged for the operator. The look-up failing → unchanged.
 */
export async function reconcileRefunding(db: D1Binding, toss: TossClient, order: OrderRow, now: number): Promise<OrderRow> {
  if (order.status !== "refunding" || !order.payment_key || now - order.updated_at < REFUND_RECONCILE_AFTER_MS) return order;
  if (await paidUnderOtherKeys(db, toss, order.id)) return order;
  const payment = await toss.getPayment(order.payment_key).catch(() => null);
  if (!payment) return order;
  const lot = await refundingLot(db, order.id);
  if (payment.status === "CANCELED") {
    await applyCancel(db, order, payment, now);
  } else if (payment.status === "DONE" && lot) {
    await revertRefund(db, order.id, now);
    console.info(JSON.stringify({ evt: "pay.refund_reverted", orderId: order.id }));
  } else if (payment.status === "DONE" && order.fail_code === "ACCOUNT_DELETED") {
    if (order.cancel_attempt >= ORPHAN_MAX_ATTEMPTS) {
      console.error(JSON.stringify({ evt: "pay.orphan_refund_stuck", orderId: order.id }));
    } else {
      await nextAttempt(db, order.id, now);
      const next = await orderById(db, order.id);
      if (next) await refundOrphan(db, toss, next, now);
    }
  } else if (payment.status === "PARTIAL_CANCELED") {
    console.warn(JSON.stringify({ evt: "pay.partial_cancel", orderId: order.id }));
  }
  return (await orderById(db, order.id)) ?? order;
}

/** Brings an order in line with a payment Toss reported (webhook): the one place Toss's word is applied. */
export async function syncOrderWithToss(db: D1Binding, toss: TossClient, order: OrderRow, payment: TossPayment, now: number): Promise<void> {
  if (payment.orderId !== order.id) return;
  if (payment.status === "DONE") {
    if (order.status === "created" || order.status === "confirming" || order.status === "failed") {
      // A deleted account's payment is left `refunding`; the Cron Trigger cancels it (the webhook answers within 10 s).
      if (payment.totalAmount === order.amount_krw) await markPaid(db, order, payment, toss.mode, now);
      else console.error(JSON.stringify({ evt: "pay.webhook_amount_mismatch", orderId: order.id }));
    }
    return;
  }
  if (payment.status === "CANCELED") {
    if (order.status === "paid" || order.status === "refunding") {
      // An unopened reading is locked so it leaves as a refund; one open or opening is revoked (applyCancel).
      if (order.status === "paid") await lockPaidLotForRefund(db, order.id, now);
      await applyCancel(db, order, payment, now);
    }
    return;
  }
  if (payment.status === "PARTIAL_CANCELED") {
    // Only the operator cancels part of a payment (the Toss dashboard). Record it; the operator decides about the reading (runbook).
    await db
      .prepare("UPDATE payments SET status = ?, canceled_amount = ?, updated_at = ? WHERE order_id = ?")
      .bind(payment.status, payment.totalAmount - payment.balanceAmount, now, order.id)
      .run();
    console.warn(JSON.stringify({ evt: "pay.partial_cancel", orderId: order.id }));
    return;
  }
  if (payment.status === "ABORTED" || payment.status === "EXPIRED") {
    await db
      .prepare("UPDATE orders SET status = 'failed', fail_code = ?, updated_at = ? WHERE id = ? AND status IN ('created', 'confirming')")
      .bind(payment.status, now, order.id)
      .run();
  }
}
