import { expect, it } from "vitest";
import type { D1Binding } from "@/lib/db/d1";
import { isConstraintError } from "@/lib/db/sqlErrors";
import {
  GIFT_DAYS,
  MAX_RESTORES,
  RESERVATION_MS,
  deliverUnlock,
  entitlements,
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
  type Lot,
} from "./ledger";

const NOW = Date.parse("2026-10-01T03:00:00Z"); // 12:00 KST

type Make = () => Promise<D1Binding>;

async function setup(make: Make) {
  const db = await make();
  await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_1', 'k_1', '별', 'c_1', 0, 0)").run();
  return db;
}

async function paidOrder(db: D1Binding, orderId: string, productId = "tarot", mode: "test" | "live" = "live") {
  await db
    .prepare(
      `INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at)
       VALUES (?, 'u_1', ?, 2900, '스타로그 타로 전체 풀이', 'paid', '/', 0, 0, 0)`,
    )
    .bind(orderId, productId)
    .run();
  await db.prepare("INSERT INTO payments (payment_key, order_id, total_amount, status, mode, updated_at) VALUES (?, ?, 2900, 'DONE', ?, 0)").bind(`pk_${orderId}`, orderId, mode).run();
  await db.batch(paidLotStatements(db, { userId: "u_1", orderId, productId, now: NOW }));
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
  expect(await grantSignupGift(db, { userId: "u_1", kakaoKey: "k_1", now: NOW })).toBe(true);
  return db;
}

async function reserved(db: D1Binding, currency: "paid" | "free", now = NOW) {
  const result = await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency, now, payMode: "live" });
  if (!result.ok) throw new Error("not reserved");
  return result;
}

const giftOf = async (db: D1Binding, now = NOW) => (await entitlements(db, "u_1", now)).gift;
const UNUSED = { status: "unused", expiresAt: giftExpiry(NOW) } as const;

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

  it("gives the signup gift once per Kakao account: one opening, earmarked for a standard tarot reading", async () => {
    const db = await giftedUser(make);
    expect(await grantSignupGift(db, { userId: "u_1", kakaoKey: "k_1", now: NOW })).toBe(false);
    expect(await entitlements(db, "u_1", NOW)).toEqual({ gift: UNUSED, unused: [], opening: [] });
    expect(await db.prepare("SELECT currency, source, product_id, units_total, units_left FROM credit_lots").first()).toEqual({
      currency: "free", source: "gift", product_id: "tarot", units_total: 1, units_left: 1,
    });
    await expectLotsMatchLedger(db);
  });

  it("never opens saju, a 운 or a premium reading with the gift, an old gift lot without a product included", async () => {
    const db = await giftedUser(make);
    // A gift lot from before 2026-10-08: 10 units, no product.
    await db.batch(grantStatements(db, { id: "lot_old_gift", userId: "u_1", currency: "free", source: "gift", orderId: null, productId: null, units: 10, expiresAt: giftExpiry(NOW) }, NOW));
    for (const productId of ["saju", "tarot-deep", "match", "newyear-2027"]) {
      expect(await reserveUnlock(db, { userId: "u_1", productId, currency: "free", now: NOW, payMode: "live" }), productId).toEqual({ ok: false });
      expect(await reserveUnlock(db, { userId: "u_1", productId, currency: "free", now: NOW, payMode: "live", earmarked: true }), productId).toEqual({ ok: false });
    }
    expect(await count(db, "SELECT COUNT(*) AS n FROM unlocks")).toBe(0);
    expect(await count(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind <> 'grant'")).toBe(0);
    // A standard tarot reading takes one whole lot, the one earmarked for it first.
    expect((await reserved(db, "free")).allocations).toEqual([[expect.stringMatching(/^lot_/), 1]]);
    expect((await reserved(db, "free", NOW + 1)).allocations).toEqual([["lot_old_gift", 10]]);
    await expectLotsMatchLedger(db);
  });

  it("reserves, then spends only on delivery; the gift reads as used from the reservation on", async () => {
    const db = await giftedUser(make);
    const unlock = await reserved(db, "free");
    expect(await giftOf(db)).toEqual({ status: "used" });
    expect(await deliverUnlock(db, { unlockId: unlock.unlockId, readingId: "r1", now: NOW + 60_000 })).toBe("delivered");
    expect(await kinds(db, unlock.allocations[0]![0])).toEqual(["grant", "reserve", "spend"]);
    expect(await db.prepare("SELECT status, reading_id FROM unlocks WHERE id = ?").bind(unlock.unlockId).first()).toEqual({ status: "delivered", reading_id: "r1" });
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + 70_000 })).toBe(false);
    expect(await giftOf(db, NOW + 70_000)).toEqual({ status: "used" });
    // Used stays used after its last day: nothing is left to expire.
    expect(await giftOf(db, giftExpiry(NOW) + 1)).toEqual({ status: "used" });
    expect(await count(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'expire'")).toBe(0);
    await expectLotsMatchLedger(db);
  });

  it("releases a failed opening once, giving the gift back, and a late delivery cannot spend it", async () => {
    const db = await giftedUser(make);
    const unlock = await reserved(db, "free");
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + 1 })).toBe(true);
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + 2 })).toBe(false);
    expect(await giftOf(db, NOW + 3)).toEqual(UNUSED);
    expect(await deliverUnlock(db, { unlockId: unlock.unlockId, readingId: "late", now: NOW + 4 })).toBe("lost");
    expect(await kinds(db, unlock.allocations[0]![0])).toEqual(["grant", "reserve", "restore"]);
    await expectLotsMatchLedger(db);
  });

  it("always gives a purchase back after a server failure or a lapsed reservation, however often: neither counts toward MAX_RESTORES", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_a");
    for (let i = 0; i < MAX_RESTORES + 2; i++) {
      const unlock = await reserved(db, "paid", NOW + i);
      expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + i })).toBe(true);
      expect(await lotById(db, "lot_order_a")).toMatchObject({ units_left: 1 });
    }
    await reserved(db, "paid", NOW + 10);
    expect(await sweepStale(db, NOW + 10 + RESERVATION_MS + 1)).toEqual({ released: 1, expired: 0 });
    expect(await lotById(db, "lot_order_a")).toMatchObject({ status: "active", units_left: 1 });
    expect(await lockPaidLotForRefund(db, "order_a", NOW + 20 + RESERVATION_MS)).not.toBeNull();
    await expectLotsMatchLedger(db);
  }, 20_000); // many ledger round trips: slow on local D1

  it("gives an opening the client left back at most three times; the fourth uses the purchase up, server failures in between not counted", async () => {
    expect(MAX_RESTORES).toBe(3);
    const db = await setup(make);
    await paidOrder(db, "order_a");
    for (let i = 0; i < MAX_RESTORES; i++) {
      const left = await reserved(db, "paid", NOW + 2 * i);
      expect(await releaseUnlock(db, { unlockId: left.unlockId, now: NOW + 2 * i, left: true })).toBe(true);
      const failed = await reserved(db, "paid", NOW + 2 * i + 1);
      expect(await releaseUnlock(db, { unlockId: failed.unlockId, now: NOW + 2 * i + 1 })).toBe(true);
      expect(await lotById(db, "lot_order_a")).toMatchObject({ units_left: 1 });
    }
    const fourth = await reserved(db, "paid", NOW + 10);
    expect(await releaseUnlock(db, { unlockId: fourth.unlockId, now: NOW + 10, left: true })).toBe(true);
    expect(await lotById(db, "lot_order_a")).toMatchObject({ status: "active", units_left: 0 });
    expect(await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "paid", now: NOW + 20, payMode: "live" })).toEqual({ ok: false });
    expect(await lockPaidLotForRefund(db, "order_a", NOW + 30)).toBeNull();
    expect((await kinds(db, "lot_order_a")).filter((kind) => kind === "restore")).toHaveLength(2 * MAX_RESTORES);
    await expectLotsMatchLedger(db);
  }, 20_000); // many ledger round trips: slow on local D1

  it("gives an opening the client left back to reopen, within the restore limit, but the purchase is no longer refundable", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_a");
    const unlock = await reserved(db, "paid");
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + 1, left: true })).toBe(true);
    expect(await db.prepare("SELECT status FROM unlocks WHERE id = ?").bind(unlock.unlockId).first()).toEqual({ status: "released" });
    expect(await lotById(db, "lot_order_a")).toMatchObject({ status: "active", units_left: 1 });
    expect(await kinds(db, "lot_order_a")).toEqual(["grant", "reserve", "restore"]);
    expect((await entitlements(db, "u_1", NOW + 2)).unused).toEqual([{ orderId: "order_a", productId: "tarot", paidAt: NOW, refundable: false }]);
    expect(await lockPaidLotForRefund(db, "order_a", NOW + 3)).toBeNull();
    expect((await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "paid", now: NOW + 4, payMode: "live" })).ok).toBe(true);
    await expectLotsMatchLedger(db);
  });

  it("lets a purchase the client never left be refunded after a server failure gave its units back", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_a");
    const unlock = await reserved(db, "paid");
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: NOW + 1 })).toBe(true);
    expect(await lockPaidLotForRefund(db, "order_a", NOW + 2)).not.toBeNull();
  });

  it("spends a paid lot only on its own product", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_tarot_1", "tarot");
    expect((await entitlements(db, "u_1", NOW)).unused).toEqual([{ orderId: "order_tarot_1", productId: "tarot", paidAt: NOW, refundable: true }]);
    expect(await reserveUnlock(db, { userId: "u_1", productId: "saju", currency: "paid", now: NOW, payMode: "live" })).toEqual({ ok: false });
    expect((await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "paid", now: NOW, payMode: "live" })).ok).toBe(true);
    expect((await entitlements(db, "u_1", NOW)).unused).toEqual([]);
  });

  it("lists the readings being opened, a paid one with its order, and never also as unused", async () => {
    const db = await giftedUser(make);
    await paidOrder(db, "order_a");
    await paidOrder(db, "order_b");
    const paid = await reserved(db, "paid");
    const free = await reserved(db, "free", NOW + 1);
    const opened = paid.allocations[0]![0] === "lot_order_a" ? "order_a" : "order_b";
    const other = opened === "order_a" ? "order_b" : "order_a";
    const held = await entitlements(db, "u_1", NOW + 2);
    expect(held.opening).toEqual([
      { productId: "tarot", currency: "paid", orderId: opened },
      { productId: "tarot", currency: "gift", orderId: null },
    ]);
    expect(held.unused).toEqual([{ orderId: other, productId: "tarot", paidAt: NOW, refundable: true }]);
    expect(await deliverUnlock(db, { unlockId: paid.unlockId, readingId: "r1", now: NOW + 3 })).toBe("delivered");
    expect(await releaseUnlock(db, { unlockId: free.unlockId, now: NOW + 4 })).toBe(true);
    expect(await entitlements(db, "u_1", NOW + 5)).toMatchObject({ opening: [], unused: [{ orderId: other, productId: "tarot" }], gift: UNUSED });
    await expectLotsMatchLedger(db);
  });

  it("spends a paid lot only from a payment made under this deploy's keys", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_test", "tarot", "test");
    const paid = (payMode: "test" | "live" | null) => reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "paid", now: NOW, payMode });
    expect(await paid("live")).toEqual({ ok: false });
    expect(await paid(null)).toEqual({ ok: false });
    expect((await paid("test")).ok).toBe(true);
  });

  it("opens a paid reading with one whole purchase, never parts of two, a 10-unit lot from before 2026-10-08 included", async () => {
    const db = await setup(make);
    await paidOrder(db, "order_a");
    expect(await lotById(db, "lot_order_a")).toMatchObject({ units_total: 1, units_left: 1 });
    // An order paid before every lot became one opening: its lot holds 10 units.
    await db
      .prepare(
        `INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at)
         VALUES ('order_b', 'u_1', 'tarot', 2900, '스타로그 타로 전체 풀이', 'paid', '/', 0, 0, 0)`,
      )
      .run();
    await db.prepare("INSERT INTO payments (payment_key, order_id, total_amount, status, mode, updated_at) VALUES ('pk_order_b', 'order_b', 2900, 'DONE', 'live', 0)").run();
    await db.batch(grantStatements(db, { id: "lot_order_b", userId: "u_1", currency: "paid", source: "order", orderId: "order_b", productId: "tarot", units: 10, expiresAt: null }, NOW));
    const first = await reserved(db, "paid");
    const second = await reserved(db, "paid", NOW + 1);
    expect([first.allocations, second.allocations].map((a) => a.length)).toEqual([1, 1]);
    expect(new Set([...first.allocations, ...second.allocations].map(([lot, units]) => `${lot}:${units}`))).toEqual(new Set(["lot_order_a:1", "lot_order_b:10"]));
    expect(await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "paid", now: NOW + 2, payMode: "live" })).toEqual({ ok: false });
    expect((await entitlements(db, "u_1", NOW + 3)).unused).toEqual([]);
    expect(await releaseUnlock(db, { unlockId: second.unlockId, now: NOW + 4 })).toBe(true);
    expect((await entitlements(db, "u_1", NOW + 5)).unused).toHaveLength(1);
    await expectLotsMatchLedger(db);
  });

  it("opens the gift from one whole lot, the one that expires first", async () => {
    const db = await setup(make);
    const lot = (id: string, expiresAt: number) =>
      grantStatements(db, { id, userId: "u_1", currency: "free", source: "admin", orderId: null, productId: "tarot", units: 1, expiresAt }, NOW);
    await db.batch([...lot("lot_late", NOW + 10 * 86_400_000), ...lot("lot_soon", NOW + 86_400_000)]);
    expect(await giftOf(db)).toEqual({ status: "unused", expiresAt: NOW + 86_400_000 });
    expect((await reserved(db, "free")).allocations).toEqual([["lot_soon", 1]]);
    await expectLotsMatchLedger(db);
  });

  it("refuses with nothing to open with and writes nothing", async () => {
    const db = await setup(make);
    expect(await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "free", now: NOW, payMode: "live" })).toEqual({ ok: false });
    expect(await count(db, "SELECT COUNT(*) AS n FROM unlocks")).toBe(0);
    expect(await entitlements(db, "u_1", NOW)).toEqual({ gift: null, unused: [], opening: [] });
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
    expect(await giftOf(db, NOW + RESERVATION_MS - 1)).toEqual({ status: "used" });
    expect(await giftOf(db, NOW + RESERVATION_MS + 1)).toEqual(UNUSED);
    expect(await db.prepare("SELECT status FROM unlocks WHERE id = ?").bind(unlock.unlockId).first()).toEqual({ status: "released" });
    await expectLotsMatchLedger(db);
  });

  it("gives a gift whose reading failed after its last day ended the rest of that KST day, never losing it", async () => {
    const last = giftExpiry(NOW);
    const nextDayEnd = last + 86_400_000;
    // Opened a minute before midnight on day 90; the generation fails five minutes after it.
    const db = await giftedUser(make);
    const unlock = await reserved(db, "free", last - 60_000);
    const failedAt = last + 5 * 60_000;
    expect(await releaseUnlock(db, { unlockId: unlock.unlockId, now: failedAt })).toBe(true);
    expect(await giftOf(db, failedAt + 1)).toEqual({ status: "unused", expiresAt: nextDayEnd });
    expect(await sweepStale(db, failedAt + 2)).toEqual({ released: 0, expired: 0 });
    expect((await reserved(db, "free", failedAt + 3)).allocations).toHaveLength(1);
    await expectLotsMatchLedger(db);
  });

  it("does the same when the sweep gives back a gift reservation nobody settled after midnight, for that day only", async () => {
    const last = giftExpiry(NOW);
    const nextDayEnd = last + 86_400_000;
    const db = await giftedUser(make);
    await reserved(db, "free", last - 60_000);
    expect(await giftOf(db, last - 60_000 + RESERVATION_MS + 1)).toEqual({ status: "unused", expiresAt: nextDayEnd });
    expect(await giftOf(db, nextDayEnd + 1)).toBeNull();
    expect(await count(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'expire'")).toBe(1);
    await expectLotsMatchLedger(db);
  });

  it("expires an unused gift after its last day, with a ledger row, and then shows none", async () => {
    const db = await giftedUser(make);
    expect(await giftOf(db, giftExpiry(NOW) - 1)).toEqual(UNUSED);
    expect(await entitlements(db, "u_1", giftExpiry(NOW) + 1)).toEqual({ gift: null, unused: [], opening: [] });
    expect(await count(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'expire'")).toBe(1);
    expect(await db.prepare("SELECT status, units_left FROM credit_lots").first()).toEqual({ status: "expired", units_left: 0 });
    expect(await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "free", now: giftExpiry(NOW) + 2, payMode: "live" })).toEqual({ ok: false });
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
    await db.batch(refundedLotStatements(db, unused, NOW));
    // Applied a second time (the webhook and the buyer's refund): nothing more is booked, nothing breaks.
    await db.batch(refundedLotStatements(db, unused, NOW + 1));
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
    expect(await lotById(db, "lot_order_a")).toMatchObject({ status: "active", units_left: 1 });
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
    expect((await entitlements(db, "u_1", NOW + 2)).unused).toEqual([]);
    await expectLotsMatchLedger(db);
  });

  it("reserves and spends nothing for a deleted account", async () => {
    const db = await setup(make);
    const lot = (id: string) => grantStatements(db, { id, userId: "u_1", currency: "free", source: "admin", orderId: null, productId: null, units: 1, expiresAt: null }, NOW);
    await db.batch([...lot("lot_admin"), ...lot("lot_admin_2")]);
    const unlock = await reserved(db, "free");
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = 'u_1'").bind(NOW).run();
    expect(await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "free", now: NOW + 1, payMode: "live" })).toEqual({ ok: false });
    expect(await deliverUnlock(db, { unlockId: unlock.unlockId, readingId: "r1", now: NOW + 2 })).toBe("lost");
    expect(await kinds(db, unlock.allocations[0]![0])).toEqual(["grant", "reserve"]);
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

  it("lets the scheduled sweep return any account's stale reservation and expire an unused gift", async () => {
    const db = await giftedUser(make);
    await reserved(db, "free");
    expect(await sweepStale(db, NOW + RESERVATION_MS + 1)).toEqual({ released: 1, expired: 0 });
    expect(await db.prepare("SELECT status FROM unlocks").first()).toEqual({ status: "released" });
    expect(await sweepStale(db, giftExpiry(NOW) + 1)).toEqual({ released: 0, expired: 1 });
    expect(await sweepStale(db, giftExpiry(NOW) + 2)).toEqual({ released: 0, expired: 0 });
    await expectLotsMatchLedger(db);
  });
}
