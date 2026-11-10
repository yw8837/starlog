import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { REFUND_DAYS } from "./catalog";
import {
  forfeitStatements,
  giftExpiry,
  lockPaidLotForRefund,
  refundTarget,
  refundedLotStatements,
  refundingLot,
  revertRefund,
  revokeLotStatement,
  type Lot,
  type RefundLock,
} from "./ledger";
import { markPaid, orderById, type OrderRow } from "./orders";
import { isPendingTossError, type TossClient, type TossError, type TossPayment } from "./tossTypes";

/**
 * Refunds and Toss reconciliation (spec 5.5, 5.6). The order and its lot leave use together before
 * the cancel call (M1), so nobody can open a reading while its payment is being cancelled. An
 * unknown answer is settled by looking the payment up, never by guessing or by the clock (M2).
 */

/** `amount`: what this refund cancelled, in 원 (a set's unopened part, or the whole payment). */
export type RefundOutcome = { ok: true; amount: number } | { ok: false; code: "NOT_REFUNDABLE" | "PAY_FAILED" | "PAY_PENDING"; message?: string };

/** How long a `refunding` order waits before Toss is asked: far past the 30 s client timeout and Toss's own processing. */
export const REFUND_RECONCILE_AFTER_MS = 10 * 60_000;
/** A deleted account's payment is cancelled at most this many times automatically; then the runbook takes over. */
export const ORPHAN_MAX_ATTEMPTS = 5;

/**
 * The last moment a buyer's 환불받기 works for a payment recorded at `paidAt` (its paid lot's
 * created_at): the end of the KST day REFUND_DAYS days later (paid 10-06 → 10-13 23:59:59.999 KST).
 */
export const refundDeadline = (paidAt: number) => giftExpiry(paidAt, REFUND_DAYS);

/** Toss replays an Idempotency-Key's first answer for 15 days: each attempt has its own key. */
export const cancelKey = (order: Pick<OrderRow, "id" | "cancel_attempt">) => `cancel-${order.id}-${order.cancel_attempt}`;

/** What Toss has cancelled of a payment, in 원. */
const canceledOf = (payment: TossPayment) => payment.totalAmount - payment.balanceAmount;

/**
 * What a payment Toss holds says about the refund in flight, whose `target` (ledger refundTarget) is what Toss holds
 * cancelled in all once it lands: `applied` (cancelled whole, or part of it at exactly the target: a set's unopened
 * reading), `refused` (DONE, or part of it short of the target: our cancel did not go through), or `other` (anything else,
 * such as more cancelled in the dashboard: left for the operator).
 */
function verdict(payment: TossPayment, target: number): "applied" | "refused" | "other" {
  if (payment.status === "CANCELED") return "applied";
  if (payment.status === "PARTIAL_CANCELED" && canceledOf(payment) === target) return "applied";
  if (payment.status === "DONE" || (payment.status === "PARTIAL_CANCELED" && canceledOf(payment) < target)) return "refused";
  return "other";
}

/**
 * Records a cancellation Toss confirmed, in one batch, from what D1 holds now (never from what a
 * caller read earlier), so applying it twice changes nothing the second time:
 * - a lot locked for the refund leaves as a refund, booked once;
 * - cancelled whole (CANCELED): a lot still in use (its reading open or opening) is revoked (minor 1), the payment is
 *   gone, and the order becomes refunded;
 * - cancelled in part (PARTIAL_CANCELED, only once the caller checked it is our refund's target: a set's unopened reading,
 *   owner 2026-11-10): the order is paid again for the reading it keeps, which stays in use;
 * - the payment row records the cancellation (what Toss has cancelled in all).
 */
export async function applyCancel(db: D1Binding, order: OrderRow, payment: TossPayment, now: number): Promise<void> {
  const whole = payment.status === "CANCELED";
  const results = await db.batch([
    ...(whole ? [revokeLotStatement(db, order.id)] : []),
    ...refundedLotStatements(db, order.id, now),
    whole
      ? db.prepare("UPDATE orders SET status = 'refunded', updated_at = ? WHERE id = ? AND status IN ('paid', 'refunding')").bind(now, order.id)
      : db.prepare("UPDATE orders SET status = 'paid', updated_at = ? WHERE id = ? AND status = 'refunding'").bind(now, order.id),
    db
      .prepare("UPDATE payments SET status = ?, canceled_amount = ?, canceled_at = COALESCE(canceled_at, ?), updated_at = ? WHERE order_id = ?")
      .bind(payment.status, canceledOf(payment), new Date(now).toISOString(), now, order.id),
  ]);
  // Cancelled in the dashboard while the reading was open or opening: it left use for good.
  if (whole && results[0]?.meta?.changes) console.warn(JSON.stringify({ evt: "pay.canceled_after_open", orderId: order.id }));
  console.info(JSON.stringify(whole ? { evt: "pay.refunded", orderId: order.id } : { evt: "pay.refunded_part", orderId: order.id, canceled: canceledOf(payment) }));
}

async function nextAttempt(db: D1Binding, orderId: string, now: number): Promise<void> {
  await db.prepare("UPDATE orders SET cancel_attempt = cancel_attempt + 1, updated_at = ? WHERE id = ? AND status = 'refunding'").bind(now, orderId).run();
}

/**
 * Sends the cancel for a `refunding` order and settles what Toss answers (M2). `lock`: the refund's own lock (null for an
 * orphan, cancelled whole); its amount goes to Toss as cancelAmount when it is less than the payment (a set's unopened
 * reading). Toss's answer counts only at the refund's target (verdict):
 * - applied (CANCELED, or PARTIAL_CANCELED at the target) → applied.
 * - 409 processing, 5xx or no answer → stays `refunding` (PAY_PENDING); reconcileRefunding decides.
 * - Any other error → the payment is looked up first. Applied → applied. Refused (still DONE, or cancelled short of the
 *   target) → the reading comes back with a new attempt (an orphan waits for reconcileRefunding). Anything else → pending.
 */
async function sendCancel(db: D1Binding, toss: TossClient, order: OrderRow, lock: RefundLock | null, reason: string, now: number): Promise<RefundOutcome> {
  const target = lock ? await refundTarget(db, order) : order.amount_krw;
  const part = lock && lock.amount < order.amount_krw ? { amount: lock.amount } : {};
  let payment: TossPayment;
  try {
    payment = await toss.cancel(order.payment_key!, { reason, idempotencyKey: cancelKey(order), ...part });
  } catch (error) {
    if (isPendingTossError(error)) {
      console.warn(JSON.stringify({ evt: "pay.refund_unknown", orderId: order.id }));
      return { ok: false, code: "PAY_PENDING" };
    }
    const refusal = error as TossError;
    const found = await toss.getPayment(order.payment_key!).catch(() => null);
    const seen = found ? verdict(found, target) : "other";
    if (found && seen === "applied") {
      payment = found;
    } else if (seen === "refused") {
      // A refund: the reading comes back under the next attempt. An orphan keeps this attempt: only
      // reconcileRefunding moves it on, right before it sends the next one (ORPHAN_MAX_ATTEMPTS in all).
      if (lock) await revertRefund(db, order.id, now);
      console.info(JSON.stringify({ evt: "pay.refund_refused", orderId: order.id, code: refusal.code }));
      return { ok: false, code: "PAY_FAILED", message: refusal.message || "환불하지 못했어요. 문의해 주세요." };
    } else {
      return { ok: false, code: "PAY_PENDING" };
    }
  }
  if (verdict(payment, target) !== "applied") {
    console.warn(JSON.stringify({ evt: "pay.refund_unexpected", orderId: order.id, status: payment.status }));
    return { ok: false, code: "PAY_PENDING" };
  }
  await applyCancel(db, order, payment, now);
  return { ok: true, amount: lock ? lock.amount : canceledOf(payment) };
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
 * Account deletion, for an unopened reading paid under other keys: its lots (both of a set) leave use
 * (revoked, with their ledger rows), the order stays as it is for the operator, and the deletion goes on.
 */
export async function setAsideForOperator(db: D1Binding, orderId: string, now: number): Promise<void> {
  const { results } = await db.prepare("SELECT * FROM credit_lots WHERE order_id = ? AND status = 'active' AND units_left > 0").bind(orderId).all<Lot>();
  if (results.length) await db.batch(results.flatMap((lot) => forfeitStatements(db, lot, "revoked", now)));
}

/**
 * Cancels the payment of the readings of an order that were never opened (the user's 환불, account deletion): all of it, or
 * for a set with one reading opened, the other's part (lockPaidLotForRefund's amount, from the catalog).
 */
export async function refundUnusedOrder(db: D1Binding, toss: TossClient, input: { order: OrderRow; reason: string; now: number }): Promise<RefundOutcome> {
  const { order, reason, now } = input;
  if (order.status !== "paid" || !order.payment_key) return { ok: false, code: "NOT_REFUNDABLE" };
  if (await paidUnderOtherKeys(db, toss, order.id)) return { ok: false, code: "NOT_REFUNDABLE", message: OTHER_KEYS_MESSAGE };
  const lock = await lockPaidLotForRefund(db, order.id, now);
  if (!lock) return { ok: false, code: "NOT_REFUNDABLE" };
  return sendCancel(db, toss, (await orderById(db, order.id)) ?? order, lock, reason, now);
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
 * - A refund (its lots locked), by its target (verdict): applied (PARTIAL_CANCELED at the target, a set's unopened reading)
 *   → applied; refused (still DONE, or cancelled short of it) → the reading comes back (revertRefund, next attempt); other
 *   → logged for the operator.
 * - An orphan still DONE: the next attempt is sent, up to ORPHAN_MAX_ATTEMPTS.
 * - PARTIAL_CANCELED otherwise → logged for the operator. The look-up failing → unchanged.
 */
export async function reconcileRefunding(db: D1Binding, toss: TossClient, order: OrderRow, now: number): Promise<OrderRow> {
  if (order.status !== "refunding" || !order.payment_key || now - order.updated_at < REFUND_RECONCILE_AFTER_MS) return order;
  if (await paidUnderOtherKeys(db, toss, order.id)) return order;
  const payment = await toss.getPayment(order.payment_key).catch(() => null);
  if (!payment) return order;
  const lot = await refundingLot(db, order.id);
  const seen = lot ? verdict(payment, await refundTarget(db, order)) : null;
  if (payment.status === "CANCELED" || seen === "applied") {
    await applyCancel(db, order, payment, now);
  } else if (seen === "refused") {
    await revertRefund(db, order.id, now);
    console.info(JSON.stringify({ evt: "pay.refund_reverted", orderId: order.id }));
  } else if (payment.status === "DONE" && !lot && order.fail_code === "ACCOUNT_DELETED") {
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
    // Our refund of a set's unopened reading landing (its lots locked, at its target): applied as the buyer's own call does.
    if (order.status === "refunding" && (await refundingLot(db, order.id)) && verdict(payment, await refundTarget(db, order)) === "applied") {
      await applyCancel(db, order, payment, now);
      return;
    }
    // Recorded already (that refund applied before this event came, or this very event again): nothing new.
    const recorded = await db.prepare("SELECT status, canceled_amount FROM payments WHERE order_id = ?").bind(order.id).first<{ status: string; canceled_amount: number }>();
    if (recorded?.status === payment.status && recorded.canceled_amount === canceledOf(payment)) return;
    // Otherwise only the operator cancels part of a payment (the Toss dashboard). Record it; the operator decides about the reading (runbook).
    await db
      .prepare("UPDATE payments SET status = ?, canceled_amount = ?, updated_at = ? WHERE order_id = ?")
      .bind(payment.status, canceledOf(payment), now, order.id)
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
