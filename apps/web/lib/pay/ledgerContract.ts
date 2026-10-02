import { expect, it } from "vitest";
import type { D1Binding } from "@/lib/db/d1";
import { isConstraintError } from "@/lib/db/sqlErrors";
import {
  GIFT_DAYS,
  RESERVATION_MS,
  allocate,
  deliverUnlock,
  giftExpiry,
  grantSignupGift,
  grantStatements,
  lockPaidLotForRefund,
  paidLotStatements,
  refundedLotStatements,
  releaseUnlock,
  reserveStatements,
  reserveUnlock,
  revertRefund,
  revokeLotStatement,
  sweepStale,
  walletSummary,
  type Lot,
} from "./ledger";

const NOW = Date.parse("2026-10-01T03:00:00Z"); // 12:00 KST

type Make = () => Promise<D1Binding>;

async function setup(make: Make) {
  const db = await make();
  await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_1', 'k_1', '별', 'c_1', 0, 0)").run();
  return db;
}

async function paidOrder(db: D1Binding, orderId: string, productId = "tarot") {
  await db
    .prepare(
      `INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at)
       VALUES (?, 'u_1', ?, 2900, '스타로그 타로 전체 풀이', 'paid', '/', 0, 0, 0)`,
    )
    .bind(orderId, productId)
    .run();
  await db.batch(paidLotStatements(db, { userId: "u_1", orderId, productId, units: 10, now: NOW }));
}

const lotById = (db: D1Binding, id: string) => db.prepare("SELECT * FROM credit_lots WHERE id = ?").bind(id).first<Lot>();
const orderOf = (db: D1Binding, id: string) => db.prepare("SELECT status, cancel_attempt FROM orders WHERE id = ?").bind(id).first<{ status: string; cancel_attempt: number }>();
const kinds = async (db: D1Binding, lotId: string) =>
  (await db.prepare("SELECT kind FROM ledger WHERE lot_id = ? ORDER BY id").bind(lotId).all<{ kind: string }>()).results.map((row) => row.kind);
const count = async (db: D1Binding, sql: string) => (await db.prepare(sql).first<{ n: number }>())!.n;

/** Every lot not mid-refund holds exactly what its ledger rows add up to (spec 5.4, invariant 7). */
async function expectLotsMatchLedger(db: D1Binding) {
  const { results } = await db
    .prepare(
      `SELECT l.id, l.units_left,
         COALESCE(SUM(CASE g.kind WHEN 'grant' THEN g.units WHEN 'restore' THEN g.units
           WHEN 'reserve' THEN -g.units WHEN 'refund' THEN -g.units WHEN 'expire' THEN -g.units ELSE 0 END), 0) AS ledger
       FROM credit_lots l LEFT JOIN ledger g ON g.lot_id = l.id
       WHERE l.status <> 'refunding' GROUP BY l.id`,
    )
    .all<{ id: string; units_left: number; ledger: number }>();
  for (const row of results) expect(row.units_left, row.id).toBe(row.ledger);
}

async function giftedUser(make: Make) {
  const db = await setup(make);
  expect(await grantSignupGift(db, { userId: "u_1", kakaoKey: "k_1", units: 10, now: NOW })).toBe(true);
  return db;
}

async function reserved(db: D1Binding, currency: "paid" | "free", now = NOW) {
  const result = await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency, units: 10, now });
  if (!result.ok) throw new Error("not reserved");
  return result;
}

/**
 * Ledger behaviour, run on the node:sqlite test D1 (ledger.test.ts) and on local D1
 * (ledger.int.test.ts). `make` returns an empty, migrated database.
 */
export function ledgerContract(make: Make) {
  it("lets a gift be spent through its 90th KST day", () => {
    expect(GIFT_DAYS).toBe(90);
    expect(giftExpiry(NOW)).toBe(Date.parse("2026-12-30T23:59:59.999+09:00"));
    expect(giftExpiry(Date.parse("2026-10-01T15:30:00Z"))).toBe(Date.parse("2026-12-31T23:59:59.999+09:00")); // 00:30 KST, 10-02
  });

  it("gives the signup gift once per Kakao account", async () => {
    const db = await giftedUser(make);
    expect(await grantSignupGift(db, { userId: "u_1", kakaoKey: "k_1", units: 10, now: NOW })).toBe(false);
    expect(await walletSummary(db, "u_1", NOW)).toEqual({ stardust: 10, stardustExpiresAt: giftExpiry(NOW), unused: [], opening: [] });
    await expectLotsMatchLedger(db);
  });

  it("allocates in the given order and refuses a shortfall", () => {
    expect(allocate([{ id: "a", units_left: 5 }, { id: "b", units_left: 5 }], 10)).toEqual([["a", 5], ["b", 5]]);
    expect(allocate([{ id: "a", units_left: 10 }, { id: "b", units_left: 5 }], 10)).toEqual([["a", 10]]);
    expect(allocate([{ id: "a", units_left: 4 }], 10)).toBeNull();
  });

  it("reserves, then spends only on delivery", async () => {
    const db = await giftedUser(make);
    const unlock = await reserved(db, "free");
    expect((await walletSummary(db, "u_1", NOW)).stardust).toBe(0);
    expect(await deliverUnlock(db, { unlockId: unlock.unlockId, readingId: "r1", now: NOW + 60_000 })).toBe("delivered");
    expect(await kinds(db, unlock.allocations[0]![0])).toEqual(["grant", "reserve", "spend"]);
    expect(await db.prepare("SELECT status, reading_id FROM unlocks WHERE id = ?").bind(unlock.unlockId).first()).toEqual({ status: "delivered", reading_id: "r1" });
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + 70_000 })).toBe(false);
    expect((await walletSummary(db, "u_1", NOW + 70_000)).stardust).toBe(0);
    await expectLotsMatchLedger(db);
  });

  it("releases a failed opening once, and a late delivery cannot spend it", async () => {
    const db = await giftedUser(make);
    const unlock = await reserveUnlock(db, { userId: "u_1", productId: "saju", currency: "free", units: 10, now: NOW });
    if (!unlock.ok) throw new Error("not reserved");
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + 1 })).toBe(true);
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + 2 })).toBe(false);
    expect((await walletSummary(db, "u_1", NOW + 3)).stardust).toBe(10);
    expect(await deliverUnlock(db, { unlockId: unlock.unlockId, readingId: "late", now: NOW + 4 })).toBe("lost");
    expect(await kinds(db, unlock.allocations[0]![0])).toEqual(["grant", "reserve", "restore"]);
    await expectLotsMatchLedger(db);
  });

  it("spends a paid lot only on its own product", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_tarot_1", "tarot");
    expect((await walletSummary(db, "u_1", NOW)).unused).toEqual([{ orderId: "order_tarot_1", productId: "tarot" }]);
    expect(await reserveUnlock(db, { userId: "u_1", productId: "saju", currency: "paid", units: 10, now: NOW })).toEqual({ ok: false });
    expect((await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "paid", units: 10, now: NOW })).ok).toBe(true);
    expect((await walletSummary(db, "u_1", NOW)).unused).toEqual([]);
  });

  it("lists the readings being opened, a paid one with its order, and never also as unused", async () => {
    const db = await giftedUser(make);
    await paidOrder(db, "order_a");
    await paidOrder(db, "order_b");
    const paid = await reserved(db, "paid");
    const free = await reserved(db, "free", NOW + 1);
    const opened = paid.allocations[0]![0] === "lot_order_a" ? "order_a" : "order_b";
    const other = opened === "order_a" ? "order_b" : "order_a";
    const wallet = await walletSummary(db, "u_1", NOW + 2);
    expect(wallet.opening).toEqual([
      { productId: "tarot", currency: "paid", orderId: opened },
      { productId: "tarot", currency: "stardust", orderId: null },
    ]);
    expect(wallet.unused).toEqual([{ orderId: other, productId: "tarot" }]);
    expect(await deliverUnlock(db, { unlockId: paid.unlockId, readingId: "r1", now: NOW + 3 })).toBe("delivered");
    expect(await releaseUnlock(db, { unlockId: free.unlockId, now: NOW + 4 })).toBe(true);
    expect(await walletSummary(db, "u_1", NOW + 5)).toMatchObject({ opening: [], unused: [{ orderId: other, productId: "tarot" }], stardust: 10 });
    await expectLotsMatchLedger(db);
  });

  it("takes 별조각 from the lot that expires first", async () => {
    const db = await setup(make);
    const lot = (id: string, units: number, expiresAt: number) =>
      grantStatements(db, { id, userId: "u_1", currency: "free", source: "admin", orderId: null, productId: null, units, expiresAt }, NOW);
    await db.batch([...lot("lot_late", 5, NOW + 10 * 86_400_000), ...lot("lot_soon", 7, NOW + 86_400_000)]);
    const unlock = await reserved(db, "free");
    expect(unlock.allocations).toEqual([["lot_soon", 7], ["lot_late", 3]]);
    await expectLotsMatchLedger(db);
  });

  it("refuses without enough credit and writes nothing", async () => {
    const db = await setup(make);
    expect(await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "free", units: 10, now: NOW })).toEqual({ ok: false });
    expect(await count(db, "SELECT COUNT(*) AS n FROM unlocks")).toBe(0);
  });

  it("rolls a stale reservation back whole when its lot changed underneath it", async () => {
    const db = await giftedUser(make);
    const first = await reserved(db, "free");
    // A second device read the lot before the first reservation landed.
    const stale = reserveStatements(db, { unlockId: "ul_stale", userId: "u_1", productId: "tarot", currency: "free", allocations: first.allocations, now: NOW });
    await expect(db.batch(stale)).rejects.toSatisfy(isConstraintError);
    expect(await count(db, "SELECT COUNT(*) AS n FROM unlocks")).toBe(1);
    await expectLotsMatchLedger(db);
  });

  it("gives back a reservation nobody settled once it outlives RESERVATION_MS", async () => {
    const db = await giftedUser(make);
    const unlock = await reserved(db, "free");
    expect((await walletSummary(db, "u_1", NOW + RESERVATION_MS - 1)).stardust).toBe(0);
    expect((await walletSummary(db, "u_1", NOW + RESERVATION_MS + 1)).stardust).toBe(10);
    expect(await db.prepare("SELECT status FROM unlocks WHERE id = ?").bind(unlock.unlockId).first()).toEqual({ status: "released" });
    await expectLotsMatchLedger(db);
  });

  it("expires 별조각 after their last day, with a ledger row", async () => {
    const db = await giftedUser(make);
    expect(await walletSummary(db, "u_1", giftExpiry(NOW) + 1)).toEqual({ stardust: 0, stardustExpiresAt: null, unused: [], opening: [] });
    expect(await count(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'expire'")).toBe(1);
    expect(await db.prepare("SELECT status, units_left FROM credit_lots").first()).toEqual({ status: "expired", units_left: 0 });
    await expectLotsMatchLedger(db);
  });

  it("locks an unused paid lot and its order together, never an opened one, and books the refund", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_a");
    await paidOrder(db, "order_b");
    const unlock = await reserved(db, "paid");
    const opened = unlock.allocations[0]![0] === "lot_order_a" ? "order_a" : "order_b";
    const unused = opened === "order_a" ? "order_b" : "order_a";
    expect(await lockPaidLotForRefund(db, opened, NOW)).toBeNull();
    expect(await orderOf(db, opened)).toEqual({ status: "paid", cancel_attempt: 1 });
    const locked = await lockPaidLotForRefund(db, unused, NOW);
    expect(locked).toMatchObject({ id: `lot_${unused}`, status: "refunding", units_left: 0 });
    expect(await orderOf(db, unused)).toEqual({ status: "refunding", cancel_attempt: 1 });
    expect(await lockPaidLotForRefund(db, unused, NOW + 1)).toBeNull();
    await db.batch(refundedLotStatements(db, locked!, NOW));
    expect(await lotById(db, `lot_${unused}`)).toMatchObject({ status: "refunded", units_left: 0 });
    expect(await kinds(db, `lot_${unused}`)).toEqual(["grant", "refund"]);
    await expectLotsMatchLedger(db);
  });

  it("puts a refund lock back in one batch and moves the order to its next cancel attempt", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_a");
    expect(await lockPaidLotForRefund(db, "order_a", NOW)).not.toBeNull();
    expect(await revertRefund(db, "order_a", NOW + 1)).toBe(true);
    expect(await orderOf(db, "order_a")).toEqual({ status: "paid", cancel_attempt: 2 });
    expect(await lotById(db, "lot_order_a")).toMatchObject({ status: "active", units_left: 10 });
    expect(await revertRefund(db, "order_a", NOW + 2)).toBe(false);
    await expectLotsMatchLedger(db);
  });

  it("never brings a revoked lot back: a later release restores nothing into it", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_a");
    const unlock = await reserved(db, "paid");
    await db.batch([revokeLotStatement(db, "order_a")]);
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + 1 })).toBe(true);
    expect(await lotById(db, "lot_order_a")).toMatchObject({ status: "revoked", units_left: 0 });
    expect(await kinds(db, "lot_order_a")).toEqual(["grant", "reserve"]);
    expect((await walletSummary(db, "u_1", NOW + 2)).unused).toEqual([]);
    await expectLotsMatchLedger(db);
  });

  it("reserves and spends nothing for a deleted account", async () => {
    const db = await setup(make);
    await db.batch(grantStatements(db, { id: "lot_admin", userId: "u_1", currency: "free", source: "admin", orderId: null, productId: null, units: 20, expiresAt: null }, NOW));
    const unlock = await reserved(db, "free");
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = 'u_1'").bind(NOW).run();
    expect(await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "free", units: 10, now: NOW + 1 })).toEqual({ ok: false });
    expect(await deliverUnlock(db, { unlockId: unlock.unlockId, readingId: "r1", now: NOW + 2 })).toBe("lost");
    expect(await kinds(db, "lot_admin")).toEqual(["grant", "reserve"]);
    expect(await count(db, "SELECT COUNT(*) AS n FROM unlocks")).toBe(1);
    await expectLotsMatchLedger(db);
  });

  it("keeps a delivery atomic with the reading it saves", async () => {
    const db = await giftedUser(make);
    const unlock = await reserved(db, "free");
    const broken = db.prepare(
      "INSERT INTO readings (id, user_id, kind, product_id, source, payload, key_version, created_at, updated_at) VALUES ('r1', 'nobody', 'tarot', 'tarot', 'free', 'p', 1, 0, 0)",
    );
    await expect(deliverUnlock(db, { unlockId: unlock.unlockId, readingId: "r1", now: NOW, before: [broken] })).rejects.toSatisfy(isConstraintError);
    expect(await db.prepare("SELECT status FROM unlocks WHERE id = ?").bind(unlock.unlockId).first()).toEqual({ status: "reserved" });
    expect(await kinds(db, unlock.allocations[0]![0])).toEqual(["grant", "reserve"]);
  });

  it("lets the scheduled sweep return any account's stale reservation and expire old 별조각", async () => {
    const db = await giftedUser(make);
    await reserved(db, "free");
    expect(await sweepStale(db, NOW + RESERVATION_MS + 1)).toEqual({ released: 1, expired: 0 });
    expect(await db.prepare("SELECT status FROM unlocks").first()).toEqual({ status: "released" });
    expect(await sweepStale(db, giftExpiry(NOW) + 1)).toEqual({ released: 0, expired: 1 });
    expect(await sweepStale(db, giftExpiry(NOW) + 2)).toEqual({ released: 0, expired: 0 });
    await expectLotsMatchLedger(db);
  });
}
