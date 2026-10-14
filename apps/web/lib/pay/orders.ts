import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { isConstraintError } from "@/lib/db/sqlErrors";
import { randomId } from "@/lib/security/sign";
import { productById, type Product } from "./catalog";
import { LEFT_SQL, paidLotStatements } from "./ledger";
import { TossError, isPendingTossError, type TossClient, type TossPayment } from "./tossTypes";

/**
 * Orders and Toss confirmation (spec 5.2, 5.3). The amount always comes from the order row, which
 * came from the catalog. Toss is the source of truth: an unknown answer (409 processing, 5xx, none)
 * is settled by looking the payment up, never by guessing.
 */

export type OrderStatus = "created" | "confirming" | "paid" | "failed" | "refunding" | "refunded";

export interface OrderRow {
  id: string;
  user_id: string;
  product_id: string;
  amount_krw: number;
  order_name: string;
  status: OrderStatus;
  return_to: string;
  withdrawal_ack_at: number;
  payment_key: string | null;
  fail_code: string | null;
  /** the cancel Idempotency-Key is cancel-<id>-<cancel_attempt> (Task 8) */
  cancel_attempt: number;
  created_at: number;
  updated_at: number;
}

/** A new order at the catalog price. The id is 24 chars of [A-Za-z0-9_-], a valid Toss orderId (6–64). */
export async function createOrder(db: D1Binding, input: { userId: string; product: Product; returnTo: string; now: number }): Promise<OrderRow> {
  const row = await db
    .prepare(
      `INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?) RETURNING *`,
    )
    .bind(randomId(18), input.userId, input.product.id, input.product.krw, input.product.orderName, input.returnTo, input.now, input.now, input.now)
    .first<OrderRow>();
  if (!row) throw new Error("order insert returned no row");
  return row;
}

export function orderById(db: D1Binding, id: string): Promise<OrderRow | null> {
  return db.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();
}

export function orderForUser(db: D1Binding, id: string, userId: string): Promise<OrderRow | null> {
  return db.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?").bind(id, userId).first<OrderRow>();
}

async function setStatus(db: D1Binding, id: string, from: OrderStatus[], to: OrderStatus, now: number, failCode: string | null = null): Promise<void> {
  await db
    .prepare(`UPDATE orders SET status = ?, fail_code = ?, updated_at = ? WHERE id = ? AND status IN (${from.map(() => "?").join(", ")})`)
    .bind(to, failCode, now, id, ...from)
    .run();
}

/** The Toss payment is the one this order expects: DONE, same order, same amount. */
const matches = (order: OrderRow, payment: TossPayment) => payment.status === "DONE" && payment.orderId === order.id && payment.totalAmount === order.amount_krw;

/** Toss's answers when our API keys themselves are refused. */
const KEY_ERRORS = new Set(["UNAUTHORIZED_KEY", "INVALID_API_KEY", "INVALID_CLIENT_KEY", "INVALID_SECRET_KEY"]);
const KEY_REJECTED_MESSAGE = "결제 승인을 받지 못했어요. 돈은 빠져나가지 않았어요. 잠시 뒤 다시 시도해 주세요.";

/** The payment Toss has for this order, "none" when it has none, "unknown" when it could not be asked. */
async function lookUpByOrder(toss: TossClient, orderId: string): Promise<TossPayment | "none" | "unknown"> {
  try {
    return await toss.getPaymentByOrder(orderId);
  } catch (error) {
    return error instanceof TossError && error.code === "NOT_FOUND_PAYMENT" ? "none" : "unknown";
  }
}

export type MarkPaidResult = "paid" | "orphaned" | "already";

const LIVE_ACCOUNT = "EXISTS (SELECT 1 FROM users u WHERE u.id = orders.user_id AND u.deleted_at IS NULL)";

/**
 * Records a DONE payment in one batch:
 * - the order becomes `paid`, or `refunding` with fail_code ACCOUNT_DELETED when its account was
 *   deleted meanwhile ("orphaned": Task 8 cancels the payment; nothing is granted);
 * - the payment row (UNIQUE payment_key and order_id);
 * - the paid lot and its grant, written only if the order became `paid`.
 * A second call (a repeated confirm, or the webhook first) breaks a UNIQUE key and changes nothing.
 */
export async function markPaid(db: D1Binding, order: OrderRow, payment: TossPayment, mode: TossClient["mode"], now: number): Promise<MarkPaidResult> {
  if (!productById(order.product_id)) throw new Error(`unknown product ${order.product_id}`);
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
        .bind(payment.paymentKey, now, order.id),
      db
        .prepare("INSERT INTO payments (payment_key, order_id, method, total_amount, status, approved_at, receipt_url, mode, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(payment.paymentKey, order.id, payment.method, payment.totalAmount, payment.status, payment.approvedAt, payment.receiptUrl, mode, now),
      ...paidLotStatements(db, { userId: order.user_id, orderId: order.id, productId: order.product_id, now }),
    ]);
  } catch (error) {
    if (!isConstraintError(error)) throw error;
    return "already";
  }
  const after = await orderById(db, order.id);
  if (after?.status === "refunding") {
    console.warn(JSON.stringify({ evt: "pay.paid_for_deleted_account", orderId: order.id, mode }));
    return "orphaned";
  }
  console.info(JSON.stringify({ evt: "pay.paid", orderId: order.id, mode }));
  return "paid";
}

/** Shown when a payment arrives for an account deleted in the meantime. */
export const ORPHAN_MESSAGE = "탈퇴한 계정이라 이 결제는 바로 취소돼요. 청구된 금액은 카드사를 거쳐 환불돼요.";
/** Shown for an order the account deletion closed before it was paid (eraseDeletedAccount): nothing was charged. */
export const CLOSED_BY_DELETION_MESSAGE = "탈퇴한 계정의 주문이라 결제하지 않았어요. 청구된 금액은 없어요.";

/**
 * `orphaned`: this very call recorded a payment for a deleted account; the caller cancels it (Task 8).
 * A repeat (a reload of the success page) only gets the message: the Cron Trigger retries the cancel.
 */
export type ConfirmOutcome = { ok: true; order: OrderRow } | { ok: false; code: "PAY_FAILED" | "PAY_PENDING" | "BAD_REQUEST"; message?: string; orphaned?: boolean };

async function outcomeOfPaid(db: D1Binding, toss: TossClient, order: OrderRow, payment: TossPayment, now: number): Promise<ConfirmOutcome> {
  const result = await markPaid(db, order, payment, toss.mode, now);
  const current = (await orderById(db, order.id)) ?? order;
  if (result === "orphaned" || current.fail_code === "ACCOUNT_DELETED") return { ok: false, code: "PAY_FAILED", message: ORPHAN_MESSAGE, orphaned: result === "orphaned" };
  return { ok: true, order: current };
}

/** The successUrl's confirm (spec 5.3): amount check, one claim per order, Toss confirm, then markPaid. */
export async function confirmOrder(db: D1Binding, toss: TossClient, input: { order: OrderRow; paymentKey: string; amount: number; now: number }): Promise<ConfirmOutcome> {
  const { order, paymentKey, amount, now } = input;
  if (order.fail_code === "ACCOUNT_DELETED") {
    // Closed by the deletion before Toss confirmed anything: never confirmed, so nothing was charged.
    if (order.status === "failed") return { ok: false, code: "PAY_FAILED", message: CLOSED_BY_DELETION_MESSAGE };
    // Orphaned by an earlier call: its cancel was sent then, and the Cron Trigger retries it.
    return { ok: false, code: "PAY_FAILED", message: ORPHAN_MESSAGE };
  }
  if (order.status === "paid" || order.status === "refunding" || order.status === "refunded") return { ok: true, order };
  if (order.status === "failed") return { ok: false, code: "PAY_FAILED" };
  if (amount !== order.amount_krw) {
    // Nothing changes: anyone holding the order id could send a wrong amount, and the buyer's own
    // confirm must still go through. Toss lets an unconfirmed payment expire, so nothing is charged.
    console.warn(JSON.stringify({ evt: "pay.amount_mismatch", orderId: order.id }));
    return { ok: false, code: "BAD_REQUEST" };
  }
  // One confirm per order: a double tap or a reload finds the order already claimed.
  const claimed = await db
    .prepare("UPDATE orders SET status = 'confirming', payment_key = ?, updated_at = ? WHERE id = ? AND status = 'created' RETURNING id")
    .bind(paymentKey, now, order.id)
    .first();
  if (!claimed) {
    const current = await orderById(db, order.id);
    if (current?.status === "paid") return { ok: true, order: current };
    return { ok: false, code: current?.status === "failed" ? "PAY_FAILED" : "PAY_PENDING" };
  }
  let payment: TossPayment;
  try {
    payment = await toss.confirm({ paymentKey, orderId: order.id, amount: order.amount_krw });
  } catch (error) {
    if (isPendingTossError(error)) {
      // 409 processing, 5xx or no answer: the payment may have gone through. The order stays
      // `confirming`; the success page asks again and reconcileConfirming() looks it up.
      console.warn(JSON.stringify({ evt: "pay.confirm_unknown", orderId: order.id, code: error instanceof TossError ? error.code : "UNKNOWN", message: error instanceof TossError ? error.message : String(error) }));
      return { ok: false, code: "PAY_PENDING" };
    }
    const refusal = error as TossError;
    if (refusal.status === 401 || KEY_ERRORS.has(refusal.code)) {
      // Our keys were refused (a wrong or mismatched secret key): nothing here can confirm the payment,
      // and Toss lets an unconfirmed one expire. Waiting would only keep the buyer staring at a spinner.
      console.error(JSON.stringify({ evt: "pay.key_rejected", orderId: order.id, status: refusal.status, code: refusal.code, message: refusal.message }));
      await setStatus(db, order.id, ["confirming"], "failed", now, refusal.code);
      return { ok: false, code: "PAY_FAILED", message: KEY_REJECTED_MESSAGE };
    }
    // A definite answer (a decline, ALREADY_PROCESSED_PAYMENT, …): look the payment up before deciding.
    const found = await lookUpByOrder(toss, order.id);
    if (found === "unknown") {
      console.warn(JSON.stringify({ evt: "pay.confirm_lookup_unknown", orderId: order.id, status: refusal.status, code: refusal.code, message: refusal.message }));
      return { ok: false, code: "PAY_PENDING" };
    }
    if (found !== "none" && matches(order, found)) return outcomeOfPaid(db, toss, order, found, now);
    if (found === "none") {
      // Toss holds no payment for this order: the paymentKey was not its own (a forged or stray one,
      // or a decline Toss keeps nothing for). The order goes back to its buyer as it was.
      await db
        .prepare("UPDATE orders SET status = 'created', payment_key = NULL, updated_at = ? WHERE id = ? AND status = 'confirming' AND payment_key = ?")
        .bind(now, order.id, paymentKey)
        .run();
      console.info(JSON.stringify({ evt: "pay.confirm_refused", orderId: order.id, code: refusal.code, message: refusal.message }));
      return { ok: false, code: "PAY_FAILED", message: refusal.message };
    }
    await setStatus(db, order.id, ["confirming"], "failed", now, refusal.code);
    console.info(JSON.stringify({ evt: "pay.confirm_declined", orderId: order.id, code: refusal.code, message: refusal.message }));
    return { ok: false, code: "PAY_FAILED", message: refusal.message };
  }
  if (!matches(order, payment)) {
    await setStatus(db, order.id, ["confirming"], "failed", now, `UNEXPECTED_${payment.status}`);
    console.error(JSON.stringify({ evt: "pay.confirm_mismatch", orderId: order.id, status: payment.status }));
    return { ok: false, code: "PAY_FAILED" };
  }
  return outcomeOfPaid(db, toss, order, payment, now);
}

/** How long a `confirming` order waits before we ask Toss what became of it. */
export const RECONCILE_AFTER_MS = 30_000;
/** After this, a payment Toss has not approved never will be: its 10-minute confirm window is over. */
export const STALE_CONFIRM_MS = 15 * 60_000;
/** Toss confirms a payment only within 10 minutes of the buyer's authentication (which came before our claim). */
export const CONFIRM_WINDOW_MS = 10 * 60_000;

/**
 * A `confirming` order whose confirm answer was lost or unknown: Toss decides.
 * - IN_PROGRESS (authenticated, never confirmed) within CONFIRM_WINDOW_MS of our claim → our confirm
 *   never arrived: it is sent once more under the same Idempotency-Key (confirm-<orderId>; Toss
 *   replays the first answer if it did), and its answer is used as below.
 * - DONE → paid (or orphaned, for a deleted account).
 * - ABORTED, EXPIRED, CANCELED → failed.
 * - Not found, or still not done, after STALE_CONFIRM_MS → failed; before that it keeps waiting.
 * `force` skips the RECONCILE_AFTER_MS wait (account deletion). `confirmAgain: false` never sends the
 * confirm again (account deletion: it waits for the payment instead of charging an account it closes).
 */
export async function reconcileConfirming(
  db: D1Binding,
  toss: TossClient,
  order: OrderRow,
  now: number,
  options: { force?: boolean; confirmAgain?: boolean } = {},
): Promise<OrderRow> {
  if (order.status !== "confirming") return order;
  if (!options.force && now - order.updated_at < RECONCILE_AFTER_MS) return order;
  let found = await lookUpByOrder(toss, order.id);
  if (found === "unknown") return order;
  const again = options.confirmAgain !== false && now - order.updated_at < CONFIRM_WINDOW_MS;
  if (again && found !== "none" && found.status === "IN_PROGRESS" && found.paymentKey === order.payment_key) {
    const authenticated = found;
    found = await toss.confirm({ paymentKey: authenticated.paymentKey, orderId: order.id, amount: order.amount_krw }).catch(() => authenticated);
  }
  if (found !== "none" && matches(order, found)) await markPaid(db, order, found, toss.mode, now);
  else if (found !== "none" && ["ABORTED", "EXPIRED", "CANCELED"].includes(found.status)) await setStatus(db, order.id, ["confirming"], "failed", now, found.status);
  else if (now - order.updated_at >= STALE_CONFIRM_MS) await setStatus(db, order.id, ["confirming"], "failed", now, found === "none" ? "NOT_FOUND_PAYMENT" : `UNCONFIRMED_${found.status}`);
  return (await orderById(db, order.id)) ?? order;
}

export interface OrderListItem {
  orderId: string;
  productId: string;
  amount: number;
  status: OrderStatus;
  createdAt: number;
  receiptUrl: string | null;
  method: string | null;
  /** paid and never opened: the 환불받기 button */
  refundable: boolean;
  /** paid and opened (or being opened) */
  opened: boolean;
}

/** 결제 내역: the user's orders that reached Toss, newest first. */
export async function orderHistory(db: D1Binding, userId: string, limit = 50): Promise<OrderListItem[]> {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.product_id, o.amount_krw, o.status, o.created_at, p.receipt_url, p.method,
              l.units_left, l.units_total, l.status AS lot_status, ${LEFT_SQL("l")} AS left_once
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
       LEFT JOIN credit_lots l ON l.order_id = o.id
       WHERE o.user_id = ? AND o.status IN ('confirming', 'paid', 'refunding', 'refunded')
       ORDER BY o.created_at DESC LIMIT ?`,
    )
    .bind(userId, limit)
    .all<{
      id: string; product_id: string; amount_krw: number; status: OrderStatus; created_at: number; receipt_url: string | null; method: string | null;
      units_left: number | null; units_total: number | null; lot_status: string | null; left_once: number | null;
    }>();
  return results.map((row) => {
    const active = row.lot_status === "active";
    return {
      orderId: row.id,
      productId: row.product_id,
      amount: row.amount_krw,
      status: row.status,
      createdAt: row.created_at,
      receiptUrl: row.receipt_url,
      method: row.method,
      refundable: row.status === "paid" && active && row.units_left === row.units_total && !row.left_once,
      opened: row.status === "paid" && active && row.units_left === 0,
    };
  });
}
