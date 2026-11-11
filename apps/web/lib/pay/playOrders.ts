import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { isConstraintError } from "@/lib/db/sqlErrors";
import { lockPaidLotForRefund, paidLotStatements, revertRefund } from "./ledger";
import { LIVE_ACCOUNT, orderById, type ConfirmOutcome, type OrderRow } from "./orders";
import { PlayError, isPendingPlayError, playAccountTag, playProductId, productFromPlayId, sha256Hex, type PlayClient, type PlayPurchase } from "./play";
import { REFUND_RECONCILE_AFTER_MS, applyCancel, type RefundOutcome } from "./refunds";
import type { TossPayment } from "./tossTypes";

/**
 * Google Play purchases from the Android app (plan 2026-11-11, W1). Google is the source of truth: a purchase is granted
 * only once Google says it is purchased, for the order and the account the app sent with it, and an unknown answer is
 * never guessed. The token is the key: a purchase token is recorded once (play_purchases), in the batch that marks its
 * order paid. A purchase is consumed only after it was granted; one Google never hears consumed is refunded by Google
 * after three days (a deleted account's purchase is left that way on purpose).
 */

export const PLAY_METHOD = "Google Play";
/**
 * 환불받기 (or account deletion) on a set with one reading opened: Google's orders.refund refunds an order whole only, so
 * the unopened reading's part is refunded by hand (runbook section 11).
 */
export const PLAY_SET_PART_MESSAGE = "세트 중 하나를 이미 열어서 앱에서는 바로 환불할 수 없어요. 문의해 주시면 확인하고 처리해 드릴게요.";
const PLAY_REFUND_FAILED_MESSAGE = "환불하지 못했어요. 문의해 주세요.";
/** A Play purchase that arrives for an account deleted meanwhile: never granted nor consumed, so Google refunds it. */
export const PLAY_ORPHAN_MESSAGE = "탈퇴한 계정이라 이 결제는 Google Play에서 자동으로 환불돼요.";
/** meta key: the time of the last run of applyVoidedPlay that went through (ms). */
export const PLAY_VOIDED_SINCE = "play_voided_since";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Google lists voided purchases of the past 30 days only, and refuses an older startTime. */
const VOIDED_WINDOW_MS = 30 * DAY_MS;
/** Google filters by when it saw a record voided, not by its voided time: each run looks an hour behind the last one. */
const VOIDED_OVERLAP_MS = 60 * 60_000;

/** The order a recorded token paid: ok, or the deleted account's answer. Null for a token never recorded. */
async function recordedOutcome(db: D1Binding, token: string): Promise<ConfirmOutcome | null> {
  const order = await db.prepare("SELECT o.* FROM play_purchases pp JOIN orders o ON o.id = pp.order_id WHERE pp.purchase_token = ?").bind(token).first<OrderRow>();
  if (!order) return null;
  return order.fail_code === "ACCOUNT_DELETED" ? { ok: false, code: "PAY_FAILED", message: PLAY_ORPHAN_MESSAGE } : { ok: true, order };
}

/** Consumes a granted purchase; a failure is logged and left for the cron (consumePendingPlay). True once consumed. */
async function consume(db: D1Binding, play: PlayClient, purchase: { token: string; playProductId: string; orderId: string }, now: number): Promise<boolean> {
  try {
    await play.consume(purchase.playProductId, purchase.token);
  } catch (error) {
    console.warn(JSON.stringify({ evt: "pay.play_consume_failed", orderId: purchase.orderId, status: error instanceof PlayError ? error.status : 0 }));
    return false;
  }
  await db.prepare("UPDATE play_purchases SET consumed_at = ? WHERE purchase_token = ? AND consumed_at IS NULL").bind(now, purchase.token).run();
  return true;
}

/**
 * POST /api/pay/play/verify: the purchase the app made for one of our orders (the order id rode as obfuscatedProfileId, the
 * account's playAccountTag as obfuscatedAccountId). Safe to repeat.
 * - A token recorded before → its order, nothing changes.
 * - Google does not know the token, or could not be asked → PAY_PENDING (never a guess); pending (2) → PAY_PENDING;
 *   canceled (1) → PAY_FAILED.
 * - Purchased (0): the order must exist, be for this product and this account, and not be paid already (created,
 *   confirming or failed, as markPaid: the cron closes an order left `created` an hour, and a pending purchase may land
 *   later) → else BAD_REQUEST. Then one batch: the order paid (or `refunding` + ACCOUNT_DELETED for a deleted account), the
 *   payment (mode 'play'), the token, the paid lots. A constraint failure is "already" only when the token is recorded;
 *   anything else is logged and thrown.
 * - Then the purchase is consumed (a failure leaves it to the cron; the grant stands). A deleted account's is not: Google
 *   refunds it after three days, and the cron applies the refund (applyVoidedPlay).
 */
export async function verifyPlayPurchase(db: D1Binding, play: PlayClient, input: { purchaseToken: string; playProductId: string; now: number }): Promise<ConfirmOutcome> {
  const { purchaseToken: token, playProductId: playId, now } = input;
  const recorded = await recordedOutcome(db, token);
  if (recorded) return recorded;
  const product = productFromPlayId(playId);
  if (!product) return { ok: false, code: "BAD_REQUEST" };
  const tokenHash = await sha256Hex(token);
  /** A short id of the token for log lines (never the token). */
  const tokenId = tokenHash.slice(0, 12);
  let purchase: PlayPurchase | null;
  try {
    purchase = await play.getPurchase(playId, token);
  } catch (error) {
    const status = error instanceof PlayError ? error.status : 0;
    const reason = error instanceof PlayError ? error.reason : "UNKNOWN";
    // Google busy or silent: ask again later. Anything else (our credentials refused, …) is ours to fix: the purchase stays
    // unfinished in the app, which sends it again, and Google keeps it for three days.
    if (isPendingPlayError(error)) console.warn(JSON.stringify({ evt: "pay.play_verify_unknown", status, reason, token: tokenId }));
    else console.error(JSON.stringify({ evt: "pay.play_verify_refused", status, reason, token: tokenId }));
    return { ok: false, code: "PAY_PENDING" };
  }
  if (!purchase) {
    console.warn(JSON.stringify({ evt: "pay.play_unknown_token", token: tokenId }));
    return { ok: false, code: "PAY_PENDING" };
  }
  if (purchase.purchaseState === 2) return { ok: false, code: "PAY_PENDING" };
  if (purchase.purchaseState === 1) return { ok: false, code: "PAY_FAILED" };
  const order = purchase.obfuscatedProfileId ? await orderById(db, purchase.obfuscatedProfileId) : null;
  if (
    !order ||
    playProductId(order.product_id) !== playId ||
    purchase.obfuscatedAccountId !== (await playAccountTag(order.user_id)) ||
    !["created", "confirming", "failed"].includes(order.status)
  ) {
    console.warn(JSON.stringify({ evt: "pay.play_mismatch", orderId: order?.id ?? null }));
    return { ok: false, code: "BAD_REQUEST" };
  }
  const paymentKey = `play_${tokenHash}`;
  try {
    await db.batch([
      db
        .prepare(
          `UPDATE orders SET
             status = CASE WHEN ${LIVE_ACCOUNT} THEN 'paid' ELSE 'refunding' END,
             fail_code = CASE WHEN ${LIVE_ACCOUNT} THEN NULL ELSE 'ACCOUNT_DELETED' END,
             payment_key = ?, updated_at = ?
           WHERE id = ? AND status IN ('created', 'confirming', 'failed')`,
        )
        .bind(paymentKey, now, order.id),
      db
        .prepare("INSERT INTO payments (payment_key, order_id, method, total_amount, status, approved_at, receipt_url, mode, updated_at) VALUES (?, ?, ?, ?, 'DONE', ?, NULL, 'play', ?)")
        .bind(paymentKey, order.id, PLAY_METHOD, order.amount_krw, purchase.purchaseTimeMillis === null ? null : new Date(purchase.purchaseTimeMillis).toISOString(), now),
      db
        .prepare("INSERT INTO play_purchases (purchase_token, order_id, play_product_id, google_order_id, test, purchased_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(token, order.id, playId, purchase.orderId, purchase.test ? 1 : 0, purchase.purchaseTimeMillis, now),
      ...paidLotStatements(db, { userId: order.user_id, orderId: order.id, productId: order.product_id, now }),
    ]);
  } catch (error) {
    if (!isConstraintError(error)) throw error;
    const already = await recordedOutcome(db, token);
    if (already) return already;
    console.error(JSON.stringify({ evt: "pay.play_mark_paid_failed", orderId: order.id, message: error instanceof Error ? error.message : String(error) }));
    throw error;
  }
  const after = (await orderById(db, order.id)) ?? order;
  if (after.fail_code === "ACCOUNT_DELETED") {
    console.warn(JSON.stringify({ evt: "pay.play_for_deleted_account", orderId: order.id }));
    return { ok: false, code: "PAY_FAILED", message: PLAY_ORPHAN_MESSAGE };
  }
  console.info(JSON.stringify({ evt: "pay.paid", orderId: order.id, mode: "play" }));
  if (purchase.consumptionState === 1) {
    await db.prepare("UPDATE play_purchases SET consumed_at = ? WHERE purchase_token = ? AND consumed_at IS NULL").bind(now, token).run();
  } else {
    await consume(db, play, { token, playProductId: playId, orderId: order.id }, now);
  }
  return { ok: true, order: after };
}

/** The cron: consumes, oldest first and at most `limit`, the purchases of paid orders not consumed yet. Returns how many. */
export async function consumePendingPlay(db: D1Binding, play: PlayClient, now: number, limit: number): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT pp.purchase_token AS token, pp.play_product_id AS playProductId, pp.order_id AS orderId
       FROM play_purchases pp JOIN orders o ON o.id = pp.order_id
       WHERE pp.consumed_at IS NULL AND pp.voided_at IS NULL AND o.status = 'paid'
       ORDER BY pp.created_at LIMIT ?`,
    )
    .bind(limit)
    .all<{ token: string; playProductId: string; orderId: string }>();
  let consumed = 0;
  for (const purchase of results) if (await consume(db, play, purchase, now)) consumed++;
  return consumed;
}

/**
 * A voided Play purchase in the shape applyCancel reads (refunds.ts): `status` CANCELED (cancelled whole) and, through
 * canceledOf, `totalAmount` (recorded as payments.canceled_amount). The other fields only complete the type.
 */
function voidedAsCancel(order: OrderRow): TossPayment {
  return { paymentKey: order.payment_key ?? "", orderId: order.id, status: "CANCELED", totalAmount: order.amount_krw, balanceAmount: 0, method: PLAY_METHOD, approvedAt: null, receiptUrl: null };
}

/**
 * The cron: applies what Google voided (refunded or revoked: the buyer's refund through Google, the operator's in Play
 * Console with revoke, a chargeback, or Google's own refund of a purchase never consumed) since the last run, an hour of
 * overlap included, as a whole Toss cancellation is (syncOrderWithToss): a paid order's unopened lots leave as a refund,
 * an opened one is revoked, and the order becomes refunded; a deleted account's `refunding` order is closed the same way.
 * Tokens we never recorded are ignored; a token applied before is skipped (voided_at). The time of this run is stored only
 * once every item went through, so a failure is retried whole next time.
 */
export async function applyVoidedPlay(db: D1Binding, play: PlayClient, now: number): Promise<number> {
  const stored = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(PLAY_VOIDED_SINCE).first<{ value: string }>();
  const oldest = now - VOIDED_WINDOW_MS + VOIDED_OVERLAP_MS;
  const since = stored && Number.isFinite(Number(stored.value)) ? Number(stored.value) : oldest;
  const voided = await play.listVoided({ startTime: Math.max(since - VOIDED_OVERLAP_MS, oldest) });
  let applied = 0;
  for (const item of voided) {
    const recorded = await db.prepare("SELECT order_id FROM play_purchases WHERE purchase_token = ? AND voided_at IS NULL").bind(item.purchaseToken).first<{ order_id: string }>();
    if (!recorded) continue;
    const order = await orderById(db, recorded.order_id);
    if (order && (order.status === "paid" || order.status === "refunding")) {
      // An unopened reading is locked so it leaves as a refund; one open or opening is revoked (applyCancel).
      if (order.status === "paid") await lockPaidLotForRefund(db, order.id, now);
      await applyCancel(db, order, voidedAsCancel(order), now);
    }
    await db.prepare("UPDATE play_purchases SET voided_at = ? WHERE purchase_token = ? AND voided_at IS NULL").bind(now, item.purchaseToken).run();
    console.info(JSON.stringify({ evt: "pay.play_voided", orderId: recorded.order_id }));
    applied++;
  }
  await db
    .prepare("INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(PLAY_VOIDED_SINCE, String(now), now)
    .run();
  return applied;
}

/** The order was paid with Google Play (payments.mode 'play'): refunded through Google, never through Toss. */
export async function paidWithPlay(db: D1Binding, orderId: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 AS x FROM payments WHERE order_id = ? AND mode = 'play'").bind(orderId).first());
}

/**
 * 환불받기 and account deletion for a Play purchase never opened: Google refunds the order whole, the purchase revoked
 * (orders.refund with revoke=true, by Google's order id). Only a `paid` order paid with Play whose purchase Google has not
 * voided; anything else is NOT_REFUNDABLE, Google never asked.
 * - The order's unopened lots are locked first (lockPaidLotForRefund, as for Toss), so nobody opens one meanwhile. A lock
 *   for less than the order's price (a set with one reading opened) is put back: Google refunds whole only, so that part is
 *   left to the operator (PLAY_SET_PART_MESSAGE). `expected` (the amount the buyer confirmed) other than the lock's: put back,
 *   REFUND_AMOUNT_CHANGED.
 * - Refunded → applied as a whole cancel (applyCancel: lots refunded, order refunded, the payment CANCELED), the token
 *   marked voided so the cron's voided list does not apply it again.
 * - No answer, a Google-side error, or our credentials refused → left `refunding` (PAY_PENDING): Google's voided list or
 *   reconcilePlayRefunds settles it. Any other refusal → put back (PAY_FAILED), logged with its status.
 */
export async function refundUnusedPlayOrder(db: D1Binding, play: PlayClient, input: { order: OrderRow; now: number; expected?: number }): Promise<RefundOutcome> {
  const { order, now, expected } = input;
  if (order.status !== "paid") return { ok: false, code: "NOT_REFUNDABLE" };
  const purchase = await db
    .prepare("SELECT pp.google_order_id FROM play_purchases pp JOIN payments p ON p.order_id = pp.order_id WHERE pp.order_id = ? AND p.mode = 'play' AND pp.voided_at IS NULL")
    .bind(order.id)
    .first<{ google_order_id: string | null }>();
  if (!purchase?.google_order_id) return { ok: false, code: "NOT_REFUNDABLE" };
  const lock = await lockPaidLotForRefund(db, order.id, now);
  if (!lock) return { ok: false, code: "NOT_REFUNDABLE" };
  if (lock.amount < order.amount_krw) {
    await revertRefund(db, order.id, now, { nextKey: false });
    return { ok: false, code: "NOT_REFUNDABLE", message: PLAY_SET_PART_MESSAGE };
  }
  if (expected !== undefined && lock.amount !== expected) {
    await revertRefund(db, order.id, now, { nextKey: false });
    console.info(JSON.stringify({ evt: "pay.refund_amount_changed", orderId: order.id, expected, amount: lock.amount }));
    return { ok: false, code: "REFUND_AMOUNT_CHANGED" };
  }
  try {
    await play.refund(purchase.google_order_id);
  } catch (error) {
    const status = error instanceof PlayError ? error.status : 0;
    if (isPendingPlayError(error)) {
      // No answer, or Google busy: the refund may have gone through. Google decides later, through the voided list or
      // reconcilePlayRefunds.
      console.warn(JSON.stringify({ evt: "pay.play_refund_unknown", orderId: order.id, status }));
      return { ok: false, code: "PAY_PENDING" };
    }
    // Refused, our own credentials included (401/403: an error to fix, logged below): nothing was refunded, so the reading
    // comes back at once and is never left locked while a secret is wrong.
    await revertRefund(db, order.id, now, { nextKey: false });
    const refused = JSON.stringify({ evt: "pay.play_refund_refused", orderId: order.id, status });
    if (status === 401 || status === 403) console.error(refused);
    else console.warn(refused);
    return { ok: false, code: "PAY_FAILED", message: PLAY_REFUND_FAILED_MESSAGE };
  }
  await applyCancel(db, order, voidedAsCancel(order), now);
  await db.prepare("UPDATE play_purchases SET voided_at = ? WHERE order_id = ? AND voided_at IS NULL").bind(now, order.id).run();
  return { ok: true, amount: lock.amount };
}

/**
 * The cron: a Play refund left `refunding` (its answer lost) for REFUND_RECONCILE_AFTER_MS that Google's voided list has
 * not closed, oldest first and at most `limit`: Google is asked about the purchase. Still purchased → the refund never
 * happened: the reading comes back (revertRefund). Canceled → applied as voided. Anything else (no answer, unknown) → left
 * for the next run. A deleted account's purchase (left `refunding` until Google refunds it) is never touched. Returns how
 * many were settled.
 */
export async function reconcilePlayRefunds(db: D1Binding, play: PlayClient, now: number, limit: number): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT o.*, pp.purchase_token AS play_token, pp.play_product_id AS play_product_id
       FROM orders o JOIN payments p ON p.order_id = o.id JOIN play_purchases pp ON pp.order_id = o.id
       WHERE o.status = 'refunding' AND COALESCE(o.fail_code, '') <> 'ACCOUNT_DELETED' AND p.mode = 'play' AND pp.voided_at IS NULL
         AND o.updated_at < ?
       ORDER BY o.updated_at LIMIT ?`,
    )
    .bind(now - REFUND_RECONCILE_AFTER_MS, limit)
    .all<OrderRow & { play_token: string; play_product_id: string }>();
  let settled = 0;
  for (const order of results) {
    let purchase: PlayPurchase | null;
    try {
      purchase = await play.getPurchase(order.play_product_id, order.play_token);
    } catch (error) {
      console.warn(JSON.stringify({ evt: "pay.play_refund_unknown", orderId: order.id, status: error instanceof PlayError ? error.status : 0 }));
      continue;
    }
    if (purchase?.purchaseState === 0) {
      if (await revertRefund(db, order.id, now, { nextKey: false })) {
        console.info(JSON.stringify({ evt: "pay.play_refund_reverted", orderId: order.id }));
        settled++;
      }
    } else if (purchase?.purchaseState === 1) {
      await applyCancel(db, order, voidedAsCancel(order), now);
      await db.prepare("UPDATE play_purchases SET voided_at = ? WHERE purchase_token = ? AND voided_at IS NULL").bind(now, order.play_token).run();
      console.info(JSON.stringify({ evt: "pay.play_voided", orderId: order.id }));
      settled++;
    }
  }
  return settled;
}
