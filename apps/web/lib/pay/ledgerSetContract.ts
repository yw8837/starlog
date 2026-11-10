import { expect, it } from "vitest";
import type { D1Binding } from "@/lib/db/d1";
import { isConstraintError } from "@/lib/db/sqlErrors";
import {
  deliverUnlock,
  entitlements,
  lockPaidLotForRefund,
  refundedLotStatements,
  releaseUnlock,
  reserveUnlock,
  revertRefund,
  revokeLotStatement,
  type Lot,
} from "./ledger";
import { markPaid, orderHistory, type OrderRow } from "./orders";
import type { TossPayment } from "./tossTypes";

const NOW = Date.parse("2026-12-01T03:00:00Z"); // 12:00 KST, the set's first day
const SET = "set-2027";
const NY = "newyear-2027";

type Make = () => Promise<D1Binding>;

async function setup(make: Make) {
  const db = await make();
  await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_1', 'k_1', '별', 'c_1', 0, 0)").run();
  return db;
}

const payment = (orderId: string): TossPayment =>
  ({ paymentKey: `pk_${orderId}`, orderId, status: "DONE", totalAmount: 18900, balanceAmount: 18900, method: "카드", approvedAt: null, receiptUrl: null }) as unknown as TossPayment;

/** A set order Toss approved, recorded by markPaid as the confirm and the webhook do. */
async function paidSet(db: D1Binding, orderId = "order_set") {
  const order = await db
    .prepare(
      `INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at)
       VALUES (?, 'u_1', ?, 18900, '스타로그 2027 신년운세 + 프리미엄 궁합', 'confirming', '/', 0, 0, 0) RETURNING *`,
    )
    .bind(orderId, SET)
    .first<OrderRow>();
  expect(await markPaid(db, order!, payment(orderId), "live", NOW)).toBe("paid");
  return order!;
}

const lotsOf = async (db: D1Binding, orderId: string) =>
  (await db.prepare("SELECT * FROM credit_lots WHERE order_id = ? ORDER BY product_id").bind(orderId).all<Lot>()).results;
const orderStatus = async (db: D1Binding, orderId: string) => (await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first<{ status: string }>())!.status;
const grants = async (db: D1Binding, orderId: string) => (await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE order_id = ? AND kind = 'grant'").bind(orderId).first<{ n: number }>())!.n;

async function openNewYear(db: D1Binding, now = NOW + 1) {
  const reserved = await reserveUnlock(db, { userId: "u_1", productId: NY, currency: "paid", now, payMode: "live", earmarked: true });
  if (!reserved.ok) throw new Error("not reserved");
  return reserved;
}

/**
 * The 2027 신년운세 + 프리미엄 궁합 set (owner 2026-11-10): one order, two lots (one per reading). Refunded whole, within the
 * window, only while neither reading was opened or is being opened; never more than its two lots, however often the
 * payment is recorded. Run on the node:sqlite test D1 and on local D1, like ledgerContract.
 */
export function setLedgerContract(make: Make) {
  it("grants one lot per reading of the set, each earmarked for its product, in the order's one batch", async () => {
    const db = await setup(make);
    await paidSet(db);
    const lots = await lotsOf(db, "order_set");
    expect(lots.map((lot) => [lot.product_id, lot.currency, lot.source, lot.units_total, lot.units_left, lot.status])).toEqual([
      ["match", "paid", "order", 1, 1, "active"],
      [NY, "paid", "order", 1, 1, "active"],
    ]);
    expect(await grants(db, "order_set")).toBe(2);
    const unused = (await entitlements(db, "u_1", NOW)).unused;
    expect([...unused].sort((a, b) => a.productId.localeCompare(b.productId))).toEqual([
      { orderId: "order_set", productId: "match", paidAt: NOW, refundable: true, set: true },
      { orderId: "order_set", productId: NY, paidAt: NOW, refundable: true, set: true },
    ]);
  });

  it("never grants more for a payment recorded again (a repeated confirm, the webhook), and the database refuses a second lot of one product per order", async () => {
    const db = await setup(make);
    const order = await paidSet(db);
    expect(await markPaid(db, order, payment(order.id), "live", NOW + 5)).toBe("already");
    expect(await markPaid(db, { ...order, status: "paid" }, payment(order.id), "live", NOW + 6)).toBe("already");
    expect((await lotsOf(db, order.id)).length).toBe(2);
    expect(await grants(db, order.id)).toBe(2);
    await expect(
      db
        .prepare("INSERT INTO credit_lots (id, user_id, currency, source, order_id, product_id, units_total, units_left, created_at) VALUES ('lot_x', 'u_1', 'paid', 'order', ?, ?, 1, 1, 0)")
        .bind(order.id, NY)
        .run(),
    ).rejects.toSatisfy(isConstraintError);
  });

  it("refunds the set whole while neither reading was opened: both lots leave as refunds, booked once", async () => {
    const db = await setup(make);
    await paidSet(db);
    expect(await lockPaidLotForRefund(db, "order_set", NOW + 10)).not.toBeNull();
    expect(await orderStatus(db, "order_set")).toBe("refunding");
    expect((await lotsOf(db, "order_set")).map((lot) => [lot.status, lot.units_left])).toEqual([["refunding", 0], ["refunding", 0]]);
    // Nothing opens while the payment is being cancelled.
    expect((await reserveUnlock(db, { userId: "u_1", productId: "match", currency: "paid", now: NOW + 11, payMode: "live", earmarked: true })).ok).toBe(false);
    await db.batch(refundedLotStatements(db, "order_set", NOW + 12));
    await db.batch(refundedLotStatements(db, "order_set", NOW + 13));
    expect((await lotsOf(db, "order_set")).map((lot) => lot.status)).toEqual(["refunded", "refunded"]);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE order_id = 'order_set' AND kind = 'refund'").first()).toEqual({ n: 2 });
  });

  it("puts both lots back when the cancel is refused", async () => {
    const db = await setup(make);
    await paidSet(db);
    expect(await lockPaidLotForRefund(db, "order_set", NOW + 10)).not.toBeNull();
    expect(await revertRefund(db, "order_set", NOW + 11)).toBe(true);
    expect(await orderStatus(db, "order_set")).toBe("paid");
    expect((await lotsOf(db, "order_set")).map((lot) => [lot.status, lot.units_left])).toEqual([["active", 1], ["active", 1]]);
  });

  it("refunds nothing once either reading is opened or being opened; the other still opens, and the account shows it as not refundable", async () => {
    const db = await setup(make);
    await paidSet(db);
    const opening = await openNewYear(db);
    // Being opened: not refundable, and nothing is locked.
    expect(await lockPaidLotForRefund(db, "order_set", NOW + 2)).toBeNull();
    expect(await orderStatus(db, "order_set")).toBe("paid");
    expect((await lotsOf(db, "order_set")).map((lot) => [lot.product_id, lot.status, lot.units_left])).toEqual([["match", "active", 1], [NY, "active", 0]]);
    expect((await entitlements(db, "u_1", NOW + 2)).unused).toEqual([{ orderId: "order_set", productId: "match", paidAt: NOW, refundable: false, set: true }]);
    // Opened (delivered): still none.
    expect(await deliverUnlock(db, { unlockId: opening.unlockId, readingId: "r_1", now: NOW + 3 })).toBe("delivered");
    expect(await lockPaidLotForRefund(db, "order_set", NOW + 4)).toBeNull();
    expect((await entitlements(db, "u_1", NOW + 4)).unused).toEqual([{ orderId: "order_set", productId: "match", paidAt: NOW, refundable: false, set: true }]);
    const [history] = await orderHistory(db, "u_1");
    expect(history).toMatchObject({ orderId: "order_set", productId: SET, amount: 18900, refundable: false, opened: true });
    expect(await orderHistory(db, "u_1")).toHaveLength(1);
    // The 궁합 still opens.
    expect((await reserveUnlock(db, { userId: "u_1", productId: "match", currency: "paid", now: NOW + 5, payMode: "live", earmarked: true })).ok).toBe(true);
  });

  it("is refundable again when an opening failed on our side and gave its lot back", async () => {
    const db = await setup(make);
    await paidSet(db);
    const opening = await openNewYear(db);
    expect(await releaseUnlock(db, { unlockId: opening.unlockId, now: NOW + 2 })).toBe(true);
    expect((await entitlements(db, "u_1", NOW + 3)).unused.map((item) => item.refundable)).toEqual([true, true]);
    const [history] = await orderHistory(db, "u_1");
    expect(history).toMatchObject({ orderId: "order_set", refundable: true, opened: false, unfinished: false });
    expect(await lockPaidLotForRefund(db, "order_set", NOW + 4)).not.toBeNull();
  });

  it("revokes both lots when the payment is cancelled from the dashboard after one was opened", async () => {
    const db = await setup(make);
    await paidSet(db);
    await openNewYear(db);
    await db.batch([revokeLotStatement(db, "order_set")]);
    expect((await lotsOf(db, "order_set")).map((lot) => lot.status)).toEqual(["revoked", "revoked"]);
    expect((await entitlements(db, "u_1", NOW + 3)).unused).toEqual([]);
  });
}
