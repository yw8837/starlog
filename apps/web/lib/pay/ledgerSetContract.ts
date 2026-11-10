import { expect, it, vi } from "vitest";
import type { D1Binding } from "@/lib/db/d1";
import { isConstraintError } from "@/lib/db/sqlErrors";
import {
  deliverUnlock,
  entitlements,
  lockPaidLotForRefund,
  refundTarget,
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

const payment = (orderId: string, amount = 18900): TossPayment =>
  ({ paymentKey: `pk_${orderId}`, orderId, status: "DONE", totalAmount: amount, balanceAmount: amount, method: "카드", approvedAt: null, receiptUrl: null }) as unknown as TossPayment;

const newOrder = (db: D1Binding, orderId: string, productId: string, amount: number) =>
  db
    .prepare(
      `INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at)
       VALUES (?, 'u_1', ?, ?, '스타로그', 'confirming', '/', 0, 0, 0) RETURNING *`,
    )
    .bind(orderId, productId, amount)
    .first<OrderRow>();

/** An order Toss approved, recorded by markPaid as the confirm and the webhook do. */
async function paidOrder(db: D1Binding, orderId: string, productId: string, amount: number, now = NOW) {
  const order = await newOrder(db, orderId, productId, amount);
  expect(await markPaid(db, order!, payment(orderId, amount), "live", now)).toBe("paid");
  return order!;
}

/** A set order (18,900원). */
const paidSet = (db: D1Binding, orderId = "order_set") => paidOrder(db, orderId, SET, 18900);

const lotsOf = async (db: D1Binding, orderId: string) =>
  (await db.prepare("SELECT * FROM credit_lots WHERE order_id = ? ORDER BY product_id").bind(orderId).all<Lot>()).results;
const orderStatus = async (db: D1Binding, orderId: string) => (await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first<{ status: string }>())!.status;
const grants = async (db: D1Binding, orderId: string) => (await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE order_id = ? AND kind = 'grant'").bind(orderId).first<{ n: number }>())!.n;
const refunds = async (db: D1Binding, orderId: string) =>
  (await db.prepare("SELECT lot_id FROM ledger WHERE order_id = ? AND kind = 'refund' ORDER BY lot_id").bind(orderId).all<{ lot_id: string }>()).results.map((row) => row.lot_id);
const byProduct = <T extends { productId: string }>(items: T[]) => [...items].sort((a, b) => a.productId.localeCompare(b.productId));

async function open(db: D1Binding, productId: string, now = NOW + 1) {
  const reserved = await reserveUnlock(db, { userId: "u_1", productId, currency: "paid", now, payMode: "live", earmarked: true });
  if (!reserved.ok) throw new Error("not reserved");
  return reserved;
}
const openNewYear = (db: D1Binding, now = NOW + 1) => open(db, NY, now);

/**
 * The 2027 신년운세 + 프리미엄 궁합 set (owner 2026-11-10): one order, two lots (one per reading). Refunded whole while
 * neither reading was opened; once one was opened (or is being opened, or was cut off while written) the other's part
 * (18,900 − the opened one's single price: 4,000원 or 11,000원), its lot locked alone while the opened one stays in use;
 * nothing once both were. Never more than its two lots, however often the payment is recorded. Run on the node:sqlite test
 * D1 and on local D1, like ledgerContract.
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
    expect(byProduct((await entitlements(db, "u_1", NOW)).unused)).toEqual([
      { orderId: "order_set", productId: "match", paidAt: NOW, refundable: 18900, set: true },
      { orderId: "order_set", productId: NY, paidAt: NOW, refundable: 18900, set: true },
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

  it("refuses to record a payment whose lots break a constraint unless it was recorded before (a migration missing), and logs it", async () => {
    const db = await setup(make);
    // One lot per order, as before migration 0023: the set's second lot breaks it and the whole batch rolls back.
    await db.prepare("CREATE UNIQUE INDEX test_one_lot_per_order ON credit_lots(order_id)").run();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const order = await newOrder(db, "order_set", SET, 18900);
      await expect(markPaid(db, order!, payment("order_set"), "live", NOW)).rejects.toSatisfy(isConstraintError);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("pay.mark_paid_failed"));
      expect(await db.prepare("SELECT COUNT(*) AS n FROM payments").first()).toEqual({ n: 0 });
      expect(await orderStatus(db, "order_set")).toBe("confirming");
    } finally {
      await db.prepare("DROP INDEX test_one_lot_per_order").run();
      error.mockRestore();
    }
  });

  it("refunds the set whole while neither reading was opened: both lots leave as refunds, booked once", async () => {
    const db = await setup(make);
    await paidSet(db);
    expect(await lockPaidLotForRefund(db, "order_set", NOW + 10)).toMatchObject({ amount: 18900, lots: [{ status: "refunding" }, { status: "refunding" }] });
    expect(await orderStatus(db, "order_set")).toBe("refunding");
    expect((await lotsOf(db, "order_set")).map((lot) => [lot.status, lot.units_left])).toEqual([["refunding", 0], ["refunding", 0]]);
    expect(await refundTarget(db, { id: "order_set", amount_krw: 18900 })).toBe(18900);
    // Nothing opens while the payment is being cancelled.
    expect((await reserveUnlock(db, { userId: "u_1", productId: "match", currency: "paid", now: NOW + 11, payMode: "live", earmarked: true })).ok).toBe(false);
    await db.batch(refundedLotStatements(db, "order_set", NOW + 12));
    await db.batch(refundedLotStatements(db, "order_set", NOW + 13));
    expect((await lotsOf(db, "order_set")).map((lot) => lot.status)).toEqual(["refunded", "refunded"]);
    expect(await refunds(db, "order_set")).toEqual(["lot_order_set_match", "lot_order_set_newyear-2027"]);
  });

  it("puts both lots back when the cancel is refused", async () => {
    const db = await setup(make);
    await paidSet(db);
    expect(await lockPaidLotForRefund(db, "order_set", NOW + 10)).not.toBeNull();
    expect(await revertRefund(db, "order_set", NOW + 11, { nextKey: true })).toBe(true);
    expect(await orderStatus(db, "order_set")).toBe("paid");
    expect((await lotsOf(db, "order_set")).map((lot) => [lot.status, lot.units_left])).toEqual([["active", 1], ["active", 1]]);
  });

  it("once the 신년운세 is being opened, locks only the 궁합 for its part (4,000원); the 신년운세 opens on, delivers, and is never locked", async () => {
    const db = await setup(make);
    await paidSet(db);
    const opening = await openNewYear(db);
    expect((await entitlements(db, "u_1", NOW + 2)).unused).toEqual([{ orderId: "order_set", productId: "match", paidAt: NOW, refundable: 4000, set: true }]);
    const lock = await lockPaidLotForRefund(db, "order_set", NOW + 2);
    expect(lock).toMatchObject({ amount: 4000, lots: [{ id: "lot_order_set_match", product_id: "match", status: "refunding", units_left: 0 }] });
    expect(lock!.lots).toHaveLength(1);
    expect(await orderStatus(db, "order_set")).toBe("refunding");
    expect((await lotsOf(db, "order_set")).map((lot) => [lot.product_id, lot.status, lot.units_left])).toEqual([["match", "refunding", 0], [NY, "active", 0]]);
    // The 궁합 cannot be opened while its part is being cancelled; the 신년운세 keeps going.
    expect((await reserveUnlock(db, { userId: "u_1", productId: "match", currency: "paid", now: NOW + 3, payMode: "live", earmarked: true })).ok).toBe(false);
    expect(await deliverUnlock(db, { unlockId: opening.unlockId, readingId: "r_1", now: NOW + 4 })).toBe("delivered");
    expect(await refundTarget(db, { id: "order_set", amount_krw: 18900 })).toBe(4000);
    await db.batch(refundedLotStatements(db, "order_set", NOW + 5));
    await db.batch(refundedLotStatements(db, "order_set", NOW + 6));
    expect(await refunds(db, "order_set")).toEqual(["lot_order_set_match"]);
    expect((await lotsOf(db, "order_set")).map((lot) => [lot.product_id, lot.status])).toEqual([["match", "refunded"], [NY, "active"]]);
  });

  it("keeps the refund's target while the reading kept fails and comes back mid-refund: the part in flight stays 4,000원", async () => {
    const db = await setup(make);
    await paidSet(db);
    const opening = await openNewYear(db);
    expect(await lockPaidLotForRefund(db, "order_set", NOW + 2)).toMatchObject({ amount: 4000 });
    // A failure on our side gives the 신년운세 back while the 궁합's part is being cancelled.
    expect(await releaseUnlock(db, { unlockId: opening.unlockId, now: NOW + 3 })).toBe(true);
    expect(await refundTarget(db, { id: "order_set", amount_krw: 18900 })).toBe(4000);
    // Nothing more is refundable while that refund is in flight.
    expect((await entitlements(db, "u_1", NOW + 4)).unused).toEqual([{ orderId: "order_set", productId: NY, paidAt: NOW, refundable: 0, set: true }]);
  });

  it("once the 궁합 was opened, refunds the 신년운세's part (11,000원); a cancel refused puts that lot back for a new attempt", async () => {
    const db = await setup(make);
    await paidSet(db);
    const opening = await open(db, "match");
    expect(await deliverUnlock(db, { unlockId: opening.unlockId, readingId: "r_1", now: NOW + 2 })).toBe("delivered");
    expect((await entitlements(db, "u_1", NOW + 3)).unused).toEqual([{ orderId: "order_set", productId: NY, paidAt: NOW, refundable: 11000, set: true }]);
    expect(await lockPaidLotForRefund(db, "order_set", NOW + 3)).toMatchObject({ amount: 11000, lots: [{ product_id: NY }] });
    expect(await revertRefund(db, "order_set", NOW + 4, { nextKey: true })).toBe(true);
    expect(await db.prepare("SELECT status, cancel_attempt FROM orders WHERE id = 'order_set'").first()).toEqual({ status: "paid", cancel_attempt: 2 });
    expect((await lotsOf(db, "order_set")).map((lot) => [lot.product_id, lot.status, lot.units_left])).toEqual([["match", "active", 0], [NY, "active", 1]]);
  });

  it("refunds nothing once both readings are opened, nor a reading given back after it was cut off; the other's part still is", async () => {
    const db = await setup(make);
    await paidSet(db);
    const ny = await openNewYear(db);
    // Cut off while written (the client left): kept, never refunded; the 궁합's part is.
    expect(await releaseUnlock(db, { unlockId: ny.unlockId, now: NOW + 2, left: true })).toBe(true);
    expect(byProduct((await entitlements(db, "u_1", NOW + 3)).unused)).toEqual([
      { orderId: "order_set", productId: "match", paidAt: NOW, refundable: 4000, set: true },
      { orderId: "order_set", productId: NY, paidAt: NOW, refundable: 0, set: true },
    ]);
    const match = await open(db, "match", NOW + 4);
    expect(await deliverUnlock(db, { unlockId: match.unlockId, readingId: "r_2", now: NOW + 5 })).toBe("delivered");
    expect(await lockPaidLotForRefund(db, "order_set", NOW + 6)).toBeNull();
    expect(await orderStatus(db, "order_set")).toBe("paid");
    expect((await entitlements(db, "u_1", NOW + 6)).unused).toEqual([{ orderId: "order_set", productId: NY, paidAt: NOW, refundable: 0, set: true }]);
    const history = await orderHistory(db, "u_1");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ orderId: "order_set", productId: SET, amount: 18900, refundable: false, opened: true, openedProducts: ["match"], refunded: 0 });
    // The 신년운세 still opens.
    expect((await reserveUnlock(db, { userId: "u_1", productId: NY, currency: "paid", now: NOW + 7, payMode: "live", earmarked: true })).ok).toBe(true);
  });

  it("locks nothing when a reading starts opening between the read and the lock: the amount always matches the lots locked", async () => {
    const db = await setup(make);
    await paidSet(db);
    let raced = false;
    // A 신년운세 opening lands right after the lock read both lots as unopened (18,900원), before its batch.
    const racing = {
      prepare: (sql: string) => db.prepare(sql),
      batch: async (statements: Parameters<D1Binding["batch"]>[0]) => {
        if (!raced) {
          raced = true;
          await openNewYear(db, NOW + 1);
        }
        return db.batch(statements);
      },
    } as unknown as D1Binding;
    expect(await lockPaidLotForRefund(racing, "order_set", NOW + 2)).toBeNull();
    expect(raced).toBe(true);
    expect(await orderStatus(db, "order_set")).toBe("paid");
    expect((await lotsOf(db, "order_set")).map((lot) => [lot.product_id, lot.status, lot.units_left])).toEqual([["match", "active", 1], [NY, "active", 0]]);
    // Asked again, it locks the 궁합 alone, for its part.
    expect(await lockPaidLotForRefund(db, "order_set", NOW + 3)).toMatchObject({ amount: 4000, lots: [{ product_id: "match" }] });
  });

  it("puts the lock back when fewer lots were locked than expected (logged), so no amount is cancelled for a reading still in use; nothing was sent, so the key stays", async () => {
    const db = await setup(make);
    await paidSet(db);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // The lot statement answers one lot locked out of the two read.
      const short = {
        prepare: (sql: string) => db.prepare(sql),
        batch: async (statements: Parameters<D1Binding["batch"]>[0]) => {
          const results = await db.batch(statements);
          const locked = results[1]?.results as unknown[] | undefined;
          return statements.length === 2 && locked?.length === 2 ? [results[0], { ...results[1], results: locked.slice(0, 1) }] : results;
        },
      } as unknown as D1Binding;
      expect(await lockPaidLotForRefund(short, "order_set", NOW + 2)).toBeNull();
      expect(error).toHaveBeenCalledWith(expect.stringContaining("pay.refund_lock_mismatch"));
      expect(await db.prepare("SELECT status, cancel_attempt FROM orders WHERE id = 'order_set'").first()).toEqual({ status: "paid", cancel_attempt: 1 });
      expect((await lotsOf(db, "order_set")).map((lot) => [lot.status, lot.units_left])).toEqual([["active", 1], ["active", 1]]);
    } finally {
      error.mockRestore();
    }
  });

  it("spends a single purchase of a reading before the set's lot of it, so the set stays whole", async () => {
    const db = await setup(make);
    await paidSet(db);
    await paidOrder(db, "order_ny", NY, 14900, NOW + 10);
    expect((await openNewYear(db, NOW + 11)).allocations).toEqual([["lot_order_ny", 1]]);
    const unused = (await entitlements(db, "u_1", NOW + 12)).unused;
    expect(unused.filter((item) => item.orderId === "order_set").map((item) => item.refundable)).toEqual([18900, 18900]);
    // Then the set's.
    expect((await openNewYear(db, NOW + 13)).allocations).toEqual([[`lot_order_set_${NY}`, 1]]);
  });

  it("is refundable again when an opening failed on our side and gave its lot back", async () => {
    const db = await setup(make);
    await paidSet(db);
    const opening = await openNewYear(db);
    expect(await releaseUnlock(db, { unlockId: opening.unlockId, now: NOW + 2 })).toBe(true);
    expect((await entitlements(db, "u_1", NOW + 3)).unused.map((item) => item.refundable)).toEqual([18900, 18900]);
    const [history] = await orderHistory(db, "u_1");
    expect(history).toMatchObject({ orderId: "order_set", refundable: true, opened: false, openedProducts: [], unfinished: false });
    expect(await lockPaidLotForRefund(db, "order_set", NOW + 4)).toMatchObject({ amount: 18900 });
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
