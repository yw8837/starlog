import "server-only";
import type { D1Binding, D1Statement } from "@/lib/db/d1";
import { isConstraintError } from "@/lib/db/sqlErrors";
import { randomId } from "@/lib/security/sign";
import { GIFT_DAYS } from "./catalog";

export { GIFT_DAYS };

/**
 * The one ledger for 달빛 (paid) and 별조각 (free), spec 5.4.
 *
 * - Credit lives in lots: a paid lot per order, earmarked for its product, and a free lot per gift.
 * - Opening a reading reserves units from lots (an unlock). The reservation is then either spent,
 *   when the reading is delivered, or restored when it fails.
 * - Every movement is a ledger row with a UNIQUE idempotency key. Every multi-step change is one
 *   D1 batch, so a retry or a crash never moves credit twice.
 * - Nothing is reserved or spent for a deleted account (users.deleted_at).
 * - Lot invariant (tested): units_left = grant - reserve + restore - refund - expire.
 */

export type Currency = "paid" | "free";
export type LedgerKind = "grant" | "reserve" | "spend" | "restore" | "refund" | "expire";

export interface Lot {
  id: string;
  user_id: string;
  currency: Currency;
  source: "order" | "gift" | "admin";
  order_id: string | null;
  product_id: string | null;
  units_total: number;
  units_left: number;
  status: "active" | "refunding" | "refunded" | "expired" | "revoked";
  expires_at: number | null;
  created_at: number;
}

export type Allocation = [lotId: string, units: number];

/** How long an unlock holds its units: the 240 s generation budget plus margin. Then a sweep returns them. */
export const RESERVATION_MS = 6 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;

/** The last moment of the KST day `days` days after `now` (received 10-01 → usable through 12-30). */
export function giftExpiry(now: number, days: number = GIFT_DAYS): number {
  const startOfToday = Math.floor((now + KST_MS) / DAY_MS) * DAY_MS - KST_MS;
  return startOfToday + (days + 1) * DAY_MS - 1;
}

// ---- ledger rows ----

interface Entry {
  userId: string;
  currency: Currency;
  kind: LedgerKind;
  units: number;
  lotId: string;
  unlockId?: string | null;
  orderId?: string | null;
  idem: string;
  now: number;
}

const COLUMNS = "(user_id, currency, kind, units, lot_id, unlock_id, order_id, idem_key, created_at)";
const values = (e: Entry) => [e.userId, e.currency, e.kind, e.units, e.lotId, e.unlockId ?? null, e.orderId ?? null, e.idem, e.now];

function ledgerRow(db: D1Binding, e: Entry): D1Statement {
  return db.prepare(`INSERT INTO ledger ${COLUMNS} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values(e));
}

const RESERVED = "EXISTS (SELECT 1 FROM unlocks WHERE id = ? AND status = 'reserved')";
const USER_LIVE = "EXISTS (SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL)";

// ---- grants ----

export interface NewLot {
  id: string;
  userId: string;
  currency: Currency;
  source: Lot["source"];
  orderId: string | null;
  productId: string | null;
  units: number;
  expiresAt: number | null;
}

export function grantStatements(db: D1Binding, lot: NewLot, now: number): D1Statement[] {
  return [
    db
      .prepare(
        `INSERT INTO credit_lots (id, user_id, currency, source, order_id, product_id, units_total, units_left, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(lot.id, lot.userId, lot.currency, lot.source, lot.orderId, lot.productId, lot.units, lot.units, lot.expiresAt, now),
    ledgerRow(db, { userId: lot.userId, currency: lot.currency, kind: "grant", units: lot.units, lotId: lot.id, orderId: lot.orderId, idem: `grant:${lot.id}`, now }),
  ];
}

/**
 * The signup gift, once per Kakao account (gift_claims outlives the account by a year). The claim,
 * the lot and its ledger row are one batch: a failure leaves no claim behind, so the next login
 * tries again (minor 5). False when it was given before.
 */
export async function grantSignupGift(db: D1Binding, input: { userId: string; kakaoKey: string; units: number; now: number }): Promise<boolean> {
  const claimed = await db.prepare("SELECT 1 AS x FROM gift_claims WHERE kakao_key = ?").bind(input.kakaoKey).first();
  if (claimed) return false;
  const lot: NewLot = {
    id: `lot_${randomId(12)}`,
    userId: input.userId,
    currency: "free",
    source: "gift",
    orderId: null,
    productId: null,
    units: input.units,
    expiresAt: giftExpiry(input.now),
  };
  try {
    await db.batch([
      db.prepare("INSERT INTO gift_claims (kakao_key, claimed_at) VALUES (?, ?)").bind(input.kakaoKey, input.now),
      ...grantStatements(db, lot, input.now),
    ]);
    return true;
  } catch (error) {
    if (isConstraintError(error)) return false;
    throw error;
  }
}

/**
 * The paid lot an order grants, written only while the order is `paid` (markPaid sets it in the same
 * batch, and leaves a deleted account's order unpaid). Its id comes from the order id, so it can
 * exist only once.
 */
export function paidLotStatements(db: D1Binding, input: { userId: string; orderId: string; productId: string; units: number; now: number }): D1Statement[] {
  const id = `lot_${input.orderId}`;
  const PAID = "EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'paid')";
  return [
    db
      .prepare(
        `INSERT INTO credit_lots (id, user_id, currency, source, order_id, product_id, units_total, units_left, expires_at, created_at)
         SELECT ?, ?, 'paid', 'order', ?, ?, ?, ?, NULL, ? WHERE ${PAID}`,
      )
      .bind(id, input.userId, input.orderId, input.productId, input.units, input.units, input.now, input.orderId),
    db
      .prepare(`INSERT INTO ledger ${COLUMNS} SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${PAID}`)
      .bind(...values({ userId: input.userId, currency: "paid", kind: "grant", units: input.units, lotId: id, orderId: input.orderId, idem: `grant:${id}`, now: input.now }), input.orderId),
  ];
}

// ---- reserve, deliver, release ----

/** Units to take from each lot, in the given order, or null when they do not add up. */
export function allocate(lots: ReadonlyArray<{ id: string; units_left: number }>, units: number): Allocation[] | null {
  const out: Allocation[] = [];
  let need = units;
  for (const lot of lots) {
    if (need === 0) break;
    const take = Math.min(lot.units_left, need);
    if (take > 0) {
      out.push([lot.id, take]);
      need -= take;
    }
  }
  return need === 0 ? out : null;
}

export function reserveStatements(
  db: D1Binding,
  input: { unlockId: string; userId: string; productId: string; currency: Currency; allocations: Allocation[]; now: number },
): D1Statement[] {
  const { unlockId, userId, productId, currency, allocations, now } = input;
  return [
    db
      .prepare(
        `INSERT INTO unlocks (id, user_id, product_id, currency, allocations, status, reserved_until, created_at)
         VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?)`,
      )
      .bind(unlockId, userId, productId, currency, JSON.stringify(allocations), now + RESERVATION_MS, now),
    ...allocations.flatMap(([lotId, units]) => [
      // A lot that is no longer active, or whose account was deleted, becomes -1, which the CHECK
      // rejects: the whole batch rolls back.
      db
        .prepare(
          `UPDATE credit_lots SET units_left = CASE
             WHEN status = 'active' AND EXISTS (SELECT 1 FROM users u WHERE u.id = credit_lots.user_id AND u.deleted_at IS NULL)
             THEN units_left - ? ELSE -1 END
           WHERE id = ?`,
        )
        .bind(units, lotId),
      ledgerRow(db, { userId, currency, kind: "reserve", units, lotId, unlockId, idem: `reserve:${unlockId}:${lotId}`, now }),
    ]),
  ];
}

export type ReserveResult = { ok: true; unlockId: string; allocations: Allocation[] } | { ok: false };

/**
 * Holds `units` of `currency` for opening `productId`: lots earmarked for the product first, then
 * the ones that expire soonest. A lot changed meanwhile (spent elsewhere, refunded, expired, account
 * deleted) fails the CHECK and rolls the reservation back; one retry from a fresh read, then no credit.
 */
export async function reserveUnlock(
  db: D1Binding,
  input: { userId: string; productId: string; currency: Currency; units: number; now: number },
): Promise<ReserveResult> {
  const { userId, productId, currency, units, now } = input;
  await sweepUser(db, userId, now);
  for (let attempt = 0; attempt < 2; attempt++) {
    const { results } = await db
      .prepare(
        `SELECT id, units_left FROM credit_lots
         WHERE user_id = ? AND currency = ? AND status = 'active' AND units_left > 0
           AND (expires_at IS NULL OR expires_at > ?) AND (product_id IS NULL OR product_id = ?)
         ORDER BY product_id IS NULL, expires_at IS NULL, expires_at, created_at`,
      )
      .bind(userId, currency, now, productId)
      .all<{ id: string; units_left: number }>();
    const allocations = allocate(results, units);
    if (!allocations) return { ok: false };
    const unlockId = `ul_${randomId(12)}`;
    try {
      await db.batch(reserveStatements(db, { unlockId, userId, productId, currency, allocations, now }));
      return { ok: true, unlockId, allocations };
    } catch (error) {
      if (!isConstraintError(error)) throw error;
    }
  }
  return { ok: false };
}

interface UnlockRow {
  id: string;
  user_id: string;
  currency: Currency;
  allocations: string;
  status: "reserved" | "delivered" | "released";
}

const unlockRow = (db: D1Binding, id: string) =>
  db.prepare("SELECT id, user_id, currency, allocations, status FROM unlocks WHERE id = ?").bind(id).first<UnlockRow>();

const allocationsOf = (row: UnlockRow) => JSON.parse(row.allocations) as Allocation[];

/**
 * Spends a reservation once the reading is saved; `before` (the reading's INSERT) runs in the same
 * batch. "lost" means nothing was spent: the reservation had already been released (it outlived
 * RESERVATION_MS), or the account was deleted. After a release the reading is still saved and the
 * user keeps the units: a slow generation never costs twice.
 */
export async function deliverUnlock(
  db: D1Binding,
  input: { unlockId: string; readingId: string; now: number; before?: D1Statement[] },
): Promise<"delivered" | "lost"> {
  const unlock = await unlockRow(db, input.unlockId);
  if (!unlock) throw new Error("unknown unlock");
  const results = await db.batch([
    ...(input.before ?? []),
    ...allocationsOf(unlock).map(([lotId, units]) =>
      db
        .prepare(`INSERT INTO ledger ${COLUMNS} SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${RESERVED} AND ${USER_LIVE}`)
        .bind(
          ...values({ userId: unlock.user_id, currency: unlock.currency, kind: "spend", units, lotId, unlockId: unlock.id, idem: `spend:${unlock.id}:${lotId}`, now: input.now }),
          unlock.id,
          unlock.user_id,
        ),
    ),
    db
      .prepare(`UPDATE unlocks SET status = 'delivered', reading_id = ?, settled_at = ? WHERE id = ? AND status = 'reserved' AND ${USER_LIVE}`)
      .bind(input.readingId, input.now, unlock.id, unlock.user_id),
  ]);
  return results[results.length - 1]?.meta?.changes === 1 ? "delivered" : "lost";
}

/**
 * Returns a reservation's units to their lots (failed or abandoned generation). Idempotent; false
 * when it was not reserved. Units go back only into a lot that is still active: one that expired,
 * or was revoked because its payment was cancelled, keeps nothing (minor 1).
 */
export async function releaseUnlock(db: D1Binding, input: { unlockId: string; now: number }): Promise<boolean> {
  const unlock = await unlockRow(db, input.unlockId);
  if (!unlock || unlock.status !== "reserved") return false;
  const results = await db.batch([
    ...allocationsOf(unlock).flatMap(([lotId, units]) => [
      db.prepare(`UPDATE credit_lots SET units_left = units_left + ? WHERE id = ? AND status = 'active' AND ${RESERVED}`).bind(units, lotId, unlock.id),
      db
        .prepare(`INSERT INTO ledger ${COLUMNS} SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${RESERVED} AND EXISTS (SELECT 1 FROM credit_lots WHERE id = ? AND status = 'active')`)
        .bind(
          ...values({ userId: unlock.user_id, currency: unlock.currency, kind: "restore", units, lotId, unlockId: unlock.id, idem: `restore:${unlock.id}:${lotId}`, now: input.now }),
          unlock.id,
          lotId,
        ),
    ]),
    db.prepare("UPDATE unlocks SET status = 'released', settled_at = ? WHERE id = ? AND status = 'reserved'").bind(input.now, unlock.id),
  ]);
  return results[results.length - 1]?.meta?.changes === 1;
}

// ---- sweeps, expiry, forfeits ----

/** Takes what is left in a lot out of use (expiry, account deletion), with its ledger row, only if the lot did not change meanwhile. */
export function forfeitStatements(db: D1Binding, lot: Lot, status: "expired" | "revoked", now: number): D1Statement[] {
  return [
    db
      .prepare(
        `INSERT INTO ledger ${COLUMNS} SELECT ?, ?, 'expire', ?, ?, NULL, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM credit_lots WHERE id = ? AND units_left = ?)`,
      )
      .bind(lot.user_id, lot.currency, lot.units_left, lot.id, lot.order_id, `expire:${lot.id}:${now}:${lot.units_left}`, now, lot.id, lot.units_left),
    db.prepare("UPDATE credit_lots SET units_left = 0, status = ? WHERE id = ? AND units_left = ?").bind(status, lot.id, lot.units_left),
  ];
}

const EXPIRED_LOTS = "status = 'active' AND expires_at IS NOT NULL AND expires_at <= ? AND units_left > 0";

/** Releases this user's reservations older than RESERVATION_MS and expires their lots past expiry. */
export async function sweepUser(db: D1Binding, userId: string, now: number): Promise<void> {
  const stale = await db.prepare("SELECT id FROM unlocks WHERE user_id = ? AND status = 'reserved' AND reserved_until < ?").bind(userId, now).all<{ id: string }>();
  for (const { id } of stale.results) await releaseUnlock(db, { unlockId: id, now });
  const expired = await db.prepare(`SELECT * FROM credit_lots WHERE user_id = ? AND ${EXPIRED_LOTS}`).bind(userId, now).all<Lot>();
  for (const lot of expired.results) await db.batch(forfeitStatements(db, lot, "expired", now));
}

/** The same sweep over every account, at most `limit` of each per run (the Cron Trigger, Task 13). */
export async function sweepStale(db: D1Binding, now: number, limit = 100): Promise<{ released: number; expired: number }> {
  const stale = await db.prepare("SELECT id FROM unlocks WHERE status = 'reserved' AND reserved_until < ? ORDER BY reserved_until LIMIT ?").bind(now, limit).all<{ id: string }>();
  let released = 0;
  for (const { id } of stale.results) if (await releaseUnlock(db, { unlockId: id, now })) released++;
  const lots = await db.prepare(`SELECT * FROM credit_lots WHERE ${EXPIRED_LOTS} ORDER BY expires_at LIMIT ?`).bind(now, limit).all<Lot>();
  for (const lot of lots.results) await db.batch(forfeitStatements(db, lot, "expired", now));
  return { released, expired: lots.results.length };
}

// ---- refunds ----

/**
 * Marks a paid order `refunding` and takes its unused lot out of use, in one batch (M1). Each
 * statement checks the other's condition, so both change or neither does, and nobody can open the
 * reading while its payment is being cancelled. Null when the order is not paid, or its reading was
 * opened or is being opened.
 */
export async function lockPaidLotForRefund(db: D1Binding, orderId: string, now: number): Promise<Lot | null> {
  const [order, lot] = await db.batch([
    db
      .prepare(
        `UPDATE orders SET status = 'refunding', updated_at = ? WHERE id = ? AND status = 'paid'
           AND EXISTS (SELECT 1 FROM credit_lots WHERE order_id = ? AND status = 'active' AND units_left = units_total)`,
      )
      .bind(now, orderId, orderId),
    db
      .prepare(
        `UPDATE credit_lots SET units_left = 0, status = 'refunding'
         WHERE order_id = ? AND status = 'active' AND units_left = units_total
           AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'refunding' AND updated_at = ?)
         RETURNING *`,
      )
      .bind(orderId, orderId, now),
  ]);
  const changes = [order?.meta?.changes ?? 0, lot?.meta?.changes ?? 0];
  if (changes[0] === 1 && changes[1] === 1) return (lot!.results[0] as unknown as Lot | undefined) ?? null;
  if (changes[0] !== changes[1]) console.error(JSON.stringify({ evt: "pay.refund_lock_mismatch", orderId, changes }));
  return null;
}

/**
 * Puts a `refunding` order and its lot back in use, in one batch: Toss still shows the payment DONE.
 * The order moves to its next cancel attempt, so the next refund sends a new Idempotency-Key (Toss
 * replays an old key's first answer for 15 days). An order without a lot (a deleted account's
 * payment, Task 7) is never put back. False when nothing changed.
 */
export async function revertRefund(db: D1Binding, orderId: string, now: number): Promise<boolean> {
  const [, order] = await db.batch([
    db
      .prepare(
        `UPDATE credit_lots SET units_left = units_total, status = 'active'
         WHERE order_id = ? AND status = 'refunding' AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'refunding')`,
      )
      .bind(orderId, orderId),
    db
      .prepare(
        `UPDATE orders SET status = 'paid', cancel_attempt = cancel_attempt + 1, updated_at = ?
         WHERE id = ? AND status = 'refunding' AND EXISTS (SELECT 1 FROM credit_lots WHERE order_id = ? AND status = 'active')`,
      )
      .bind(now, orderId, orderId),
  ]);
  return order?.meta?.changes === 1;
}

export function refundingLot(db: D1Binding, orderId: string): Promise<Lot | null> {
  return db.prepare("SELECT * FROM credit_lots WHERE order_id = ? AND status = 'refunding'").bind(orderId).first<Lot>();
}

/**
 * The final state of an order's lot locked for its refund, and its ledger row (the whole grant leaves
 * as a refund). Both read the lot as it is in D1, so applying a cancellation twice (the webhook and the
 * buyer's own refund) books it once, and a lot locked after the caller read the order is still booked.
 */
export function refundedLotStatements(db: D1Binding, orderId: string, now: number): D1Statement[] {
  return [
    db
      .prepare(
        `INSERT INTO ledger ${COLUMNS}
         SELECT user_id, currency, 'refund', units_total, id, NULL, order_id, 'refund:' || id, ? FROM credit_lots
         WHERE order_id = ? AND status = 'refunding'`,
      )
      .bind(now, orderId),
    db.prepare("UPDATE credit_lots SET status = 'refunded' WHERE order_id = ? AND status = 'refunding'").bind(orderId),
  ];
}

/** A payment cancelled while its reading was open or opening (the Toss dashboard): the lot leaves use for good. */
export function revokeLotStatement(db: D1Binding, orderId: string): D1Statement {
  return db.prepare("UPDATE credit_lots SET status = 'revoked' WHERE order_id = ? AND status = 'active'").bind(orderId);
}

// ---- summary ----

/** A reading being opened right now: reserved, not yet delivered or released. A paid one names its order. */
export interface Opening {
  productId: string;
  currency: "paid" | "stardust";
  orderId: string | null;
}

export interface WalletSummary {
  /** 별조각 that can be spent now */
  stardust: number;
  /** when the soonest of them expires (ms); null when there are none */
  stardustExpiresAt: number | null;
  /** paid readings bought and not opened yet (a reading being opened is in `opening` instead) */
  unused: Array<{ orderId: string; productId: string }>;
  /** readings being opened, oldest first */
  opening: Opening[];
}

export async function walletSummary(db: D1Binding, userId: string, now: number): Promise<WalletSummary> {
  await sweepUser(db, userId, now);
  // A paid reservation holds one whole lot (reserveUnlock), so its lot has nothing left for `unused`.
  const reservations = await db
    .prepare(
      `SELECT u.product_id, u.currency,
         CASE WHEN u.currency = 'paid' THEN (SELECT l.order_id FROM credit_lots l WHERE l.id = json_extract(u.allocations, '$[0][0]')) END AS order_id
       FROM unlocks u WHERE u.user_id = ? AND u.status = 'reserved'
       ORDER BY u.created_at, u.rowid`,
    )
    .bind(userId)
    .all<{ product_id: string; currency: Currency; order_id: string | null }>();
  const { results } = await db
    .prepare(
      `SELECT currency, order_id, product_id, units_left, expires_at FROM credit_lots
       WHERE user_id = ? AND status = 'active' AND units_left > 0 AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at`,
    )
    .bind(userId, now)
    .all<Pick<Lot, "currency" | "order_id" | "product_id" | "units_left" | "expires_at">>();
  const free = results.filter((lot) => lot.currency === "free");
  const expiries = free.map((lot) => lot.expires_at).filter((at): at is number => at !== null);
  return {
    stardust: free.reduce((sum, lot) => sum + lot.units_left, 0),
    stardustExpiresAt: expiries.length ? Math.min(...expiries) : null,
    unused: results
      .filter((lot) => lot.currency === "paid" && lot.order_id !== null && lot.product_id !== null)
      .map((lot) => ({ orderId: lot.order_id!, productId: lot.product_id! })),
    opening: reservations.results.map((row) => ({
      productId: row.product_id,
      currency: row.currency === "paid" ? "paid" : "stardust",
      orderId: row.currency === "paid" ? (row.order_id ?? null) : null,
    })),
  };
}
