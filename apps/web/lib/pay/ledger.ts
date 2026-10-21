import "server-only";
import type { D1Binding, D1Statement } from "@/lib/db/d1";
import { isConstraintError } from "@/lib/db/sqlErrors";
import { randomId } from "@/lib/security/sign";
import { GIFT_DAYS, GIFT_PRODUCT } from "./catalog";
import type { PayKeyMode } from "./mode";

export { GIFT_DAYS };

/**
 * The one ledger for what opens a full reading (spec 5.4): purchases and the signup gift.
 *
 * - Every lot is one opening: a paid lot per order, earmarked for its product, and a free lot for
 *   the signup gift, which opens one standard tarot reading (GIFT_PRODUCT) and nothing else.
 * - Opening a reading reserves one whole lot (an unlock). The reservation is then either spent,
 *   when the reading is delivered, or restored when it fails.
 * - Every movement is a ledger row with a UNIQUE idempotency key. Every multi-step change is one
 *   D1 batch, so a retry or a crash never moves an opening twice.
 * - Nothing is reserved or spent for a deleted account (users.deleted_at).
 * - Lot invariant (tested): units_left = grant - reserve + restore - refund - expire. A lot holds one
 *   unit; one written before 2026-10-08 may hold 10 (the old count per reading), and still opens once.
 */

/** credit_lots.currency: a purchase, or the signup gift. */
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

/** How long an unlock holds its lot: the 240 s generation budget plus margin. Then a sweep returns it. */
export const RESERVATION_MS = 6 * 60 * 1000;

/** SEC-02: a lot gets its units back after its client left at most this many times; after that leaving uses it up. */
export const MAX_RESTORES = 3;

/**
 * SEC-02: the restore of an opening the client left after the model began answering. The lot can open
 * again, but the purchase is no longer refundable: its reading was (partly) written and paid for.
 */
const LEFT_RESTORE = "restore-left:";
/**
 * L-2: the restore of a premium opening that had written a part (unlocks.part_written, or a reservation
 * taken for part 2 or later). The lot can open again to finish it, but the purchase is no longer
 * refundable, like a delivered one. Not counted toward MAX_RESTORES: the client did not leave.
 */
const PART_RESTORE = "restore-part:";
/**
 * True for a lot (aliased `lot`) that is not refundable any more: given back after its client left, or
 * after a part of its premium reading was written (L-2).
 */
export const LEFT_SQL = (lot: string) =>
  `EXISTS (SELECT 1 FROM ledger WHERE lot_id = ${lot}.id AND (idem_key LIKE '${LEFT_RESTORE}%' OR idem_key LIKE '${PART_RESTORE}%'))`;

/** What a new lot holds: one opening. */
const ONE_OPENING = 1;

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
 * The signup gift, one free standard tarot reading, once per Kakao or Google account (gift_claims
 * outlives the account by a year). The claim, the lot and its ledger row are one batch: a failure
 * leaves no claim behind, so the next login tries again (minor 5). False when it was given before.
 */
export async function grantSignupGift(db: D1Binding, input: { userId: string; kakaoKey: string; now: number }): Promise<boolean> {
  const claimed = await db.prepare("SELECT 1 AS x FROM gift_claims WHERE kakao_key = ?").bind(input.kakaoKey).first();
  if (claimed) return false;
  const lot: NewLot = {
    id: `lot_${randomId(12)}`,
    userId: input.userId,
    currency: "free",
    source: "gift",
    orderId: null,
    productId: GIFT_PRODUCT,
    units: ONE_OPENING,
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
 * The paid lot an order grants (one opening of its product), written only while the order is `paid`
 * (markPaid sets it in the same batch, and leaves a deleted account's order unpaid). Its id comes
 * from the order id, so it can exist only once.
 */
export function paidLotStatements(db: D1Binding, input: { userId: string; orderId: string; productId: string; now: number }): D1Statement[] {
  const id = `lot_${input.orderId}`;
  const PAID = "EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'paid')";
  return [
    db
      .prepare(
        `INSERT INTO credit_lots (id, user_id, currency, source, order_id, product_id, units_total, units_left, expires_at, created_at)
         SELECT ?, ?, 'paid', 'order', ?, ?, ?, ?, NULL, ? WHERE ${PAID}`,
      )
      .bind(id, input.userId, input.orderId, input.productId, ONE_OPENING, ONE_OPENING, input.now, input.orderId),
    db
      .prepare(`INSERT INTO ledger ${COLUMNS} SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${PAID}`)
      .bind(...values({ userId: input.userId, currency: "paid", kind: "grant", units: ONE_OPENING, lotId: id, orderId: input.orderId, idem: `grant:${id}`, now: input.now }), input.orderId),
  ];
}

// ---- reserve, deliver, release ----

export function reserveStatements(
  db: D1Binding,
  input: { unlockId: string; userId: string; productId: string; currency: Currency; allocations: Allocation[]; now: number; partSeq?: number },
): D1Statement[] {
  const { unlockId, userId, productId, currency, allocations, now, partSeq = 0 } = input;
  return [
    db
      .prepare(
        `INSERT INTO unlocks (id, user_id, product_id, currency, allocations, status, reserved_until, created_at, part_seq)
         VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, ?)`,
      )
      .bind(unlockId, userId, productId, currency, JSON.stringify(allocations), now + RESERVATION_MS, now, partSeq),
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
 * Holds one whole lot of `currency` for opening `productId` (one purchase, or the signup gift, never
 * parts of two): lots earmarked for the product first, then the ones that expire soonest. A lot
 * changed meanwhile (spent elsewhere, refunded, expired, account deleted) fails the CHECK and rolls
 * the reservation back; one retry from a fresh read, then nothing to open with.
 * - The signup gift (`free`) opens a standard tarot reading only (GIFT_PRODUCT), whatever its lot
 *   says: a gift lot from before 2026-10-08 names no product.
 * - A lot bought with an order counts only when its payment was made under `payMode`, this deploy's
 *   Toss keys (mode.ts payKeyMode): test payments never pay for live readings; null takes none.
 * - `earmarked` (premium readings, P5) takes only lots bought for `productId` itself.
 * - `partSeq` (premium readings): the part this reservation is taken for (extendUnlock).
 */
export async function reserveUnlock(
  db: D1Binding,
  input: { userId: string; productId: string; currency: Currency; now: number; payMode: PayKeyMode | null; earmarked?: boolean; partSeq?: number },
): Promise<ReserveResult> {
  const { userId, productId, currency, now, payMode, earmarked = false, partSeq } = input;
  if (currency === "free" && productId !== GIFT_PRODUCT) return { ok: false };
  // Premium readings open only from lots bought for them: a lot for any standard reading
  // (product_id NULL) must never open a 7,900원 product.
  const scope = earmarked ? "product_id = ?" : "(product_id IS NULL OR product_id = ?)";
  await sweepUser(db, userId, now);
  for (let attempt = 0; attempt < 2; attempt++) {
    const { results } = await db
      .prepare(
        `SELECT id, units_left FROM credit_lots
         WHERE user_id = ? AND currency = ? AND status = 'active' AND units_left > 0
           AND (expires_at IS NULL OR expires_at > ?) AND ${scope}
           AND (order_id IS NULL OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = credit_lots.order_id AND p.mode = ?))
         ORDER BY product_id IS NULL, expires_at IS NULL, expires_at, created_at`,
      )
      .bind(userId, currency, now, productId, payMode)
      .all<{ id: string; units_left: number }>();
    const whole = results[0];
    if (!whole) return { ok: false };
    const allocations: Allocation[] = [[whole.id, whole.units_left]];
    const unlockId = `ul_${randomId(12)}`;
    try {
      await db.batch(reserveStatements(db, { unlockId, userId, productId, currency, allocations, now, partSeq }));
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
  part_seq: number;
  part_written: number;
}

const unlockRow = (db: D1Binding, id: string) =>
  db.prepare("SELECT id, user_id, currency, allocations, status, part_seq, part_written FROM unlocks WHERE id = ?").bind(id).first<UnlockRow>();

const allocationsOf = (row: UnlockRow) => JSON.parse(row.allocations) as Allocation[];

/**
 * Spends a reservation once the reading is saved; `before` (the reading's INSERT) runs in the same
 * batch. "lost" means nothing was spent: the reservation had already been released (it outlived
 * RESERVATION_MS), or the account was deleted. After a release the reading is still saved and the
 * user keeps the lot: a slow generation never costs twice.
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
 * Returns a reservation's units to their lots (failed generation, or a lapsed reservation). Idempotent; false
 * when it was not reserved. Units go back only into a lot that is still active: one that expired,
 * or was revoked because its payment was cancelled, keeps nothing (minor 1). A gift whose last day
 * ended while it was held (opened just before midnight, failed after) keeps the rest of the KST day
 * it comes back on, so a failed reading never costs it.
 * SEC-02: `left`: the client left after the model began answering; the units come back the same way,
 * but the purchase is no longer refundable (LEFT_SQL), and only MAX_RESTORES times per lot: after
 * that the unlock is released and its units stay used. A server failure or a lapsed reservation (the
 * sweep) always gives the units back and never counts toward MAX_RESTORES. L-2: a premium reservation that had
 * written a part gives its units back as PART_RESTORE: no longer refundable.
 */
export async function releaseUnlock(db: D1Binding, input: { unlockId: string; now: number; left?: boolean }): Promise<boolean> {
  const unlock = await unlockRow(db, input.unlockId);
  if (!unlock || unlock.status !== "reserved") return false;
  const capped = input.left ? ` AND (SELECT COUNT(*) FROM ledger WHERE lot_id = ? AND idem_key LIKE '${LEFT_RESTORE}%') < ${MAX_RESTORES}` : "";
  const restorable = `${RESERVED}${capped}`;
  const restorableArgs = (lotId: string) => (input.left ? [unlock.id, lotId] : [unlock.id]);
  const marker = input.left ? LEFT_RESTORE : unlock.part_written || unlock.part_seq > 1 ? PART_RESTORE : "restore:";
  const results = await db.batch([
    ...allocationsOf(unlock).flatMap(([lotId, units]) => [
      db
        .prepare(`UPDATE credit_lots SET expires_at = ? WHERE id = ? AND currency = 'free' AND status = 'active' AND expires_at <= ? AND ${restorable}`)
        .bind(giftExpiry(input.now, 0), lotId, input.now, ...restorableArgs(lotId)),
      db.prepare(`UPDATE credit_lots SET units_left = units_left + ? WHERE id = ? AND status = 'active' AND ${restorable}`).bind(units, lotId, ...restorableArgs(lotId)),
      db
        .prepare(`INSERT INTO ledger ${COLUMNS} SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${restorable} AND EXISTS (SELECT 1 FROM credit_lots WHERE id = ? AND status = 'active')`)
        .bind(
          ...values({ userId: unlock.user_id, currency: unlock.currency, kind: "restore", units, lotId, unlockId: unlock.id, idem: `${marker}${unlock.id}:${lotId}`, now: input.now }),
          ...restorableArgs(lotId),
          lotId,
        ),
    ]),
    db.prepare("UPDATE unlocks SET status = 'released', settled_at = ? WHERE id = ? AND status = 'reserved'").bind(input.now, unlock.id),
  ]);
  return results[results.length - 1]?.meta?.changes === 1;
}

/**
 * Pushes a live reservation's expiry to now + RESERVATION_MS, for a reading written over several
 * requests (P5 parts). Only this user's reservation, only while it is still reserved and not yet
 * expired (an expired one may already be swept back). False otherwise: the caller reserves again.
 * With `parts` (a resume token's part count) it also claims the next part, in the same UPDATE: only
 * while part_seq equals `parts`, which it then bumps, so one token runs its next part once (SEC-02).
 * Either way a part of the reading was written (after a part, or a token holding one), so it marks
 * part_written: giving the reservation back from then on keeps the purchase from being refunded (L-2).
 */
export async function extendUnlock(db: D1Binding, input: { unlockId: string; userId: string; now: number; parts?: number }): Promise<boolean> {
  const claim = input.parts !== undefined;
  const result = await db
    .prepare(
      `UPDATE unlocks SET reserved_until = ?, part_written = 1${claim ? ", part_seq = part_seq + 1" : ""}
       WHERE id = ? AND user_id = ? AND status = 'reserved' AND reserved_until > ?${claim ? " AND part_seq = ?" : ""}`,
    )
    .bind(input.now + RESERVATION_MS, input.unlockId, input.userId, input.now, ...(claim ? [input.parts] : []))
    .run();
  return result.meta?.changes === 1;
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
           AND EXISTS (SELECT 1 FROM credit_lots c WHERE c.order_id = ? AND c.status = 'active' AND c.units_left = c.units_total AND NOT ${LEFT_SQL("c")})`,
      )
      .bind(now, orderId, orderId),
    db
      .prepare(
        `UPDATE credit_lots SET units_left = 0, status = 'refunding'
         WHERE order_id = ? AND status = 'active' AND units_left = units_total AND NOT ${LEFT_SQL("credit_lots")}
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
  currency: "paid" | "gift";
  orderId: string | null;
}

/**
 * The signup gift: `unused` while it can open a reading, until `expiresAt` (ms; null without a last
 * day); `used` once spent or being spent; null when there is none (never given, expired, taken out).
 */
export type GiftState = { status: "unused"; expiresAt: number | null } | { status: "used" } | null;

/** What a user holds to open readings with. */
export interface Entitlements {
  gift: GiftState;
  /**
   * paid readings bought and not opened yet (a reading being opened is in `opening` instead);
   * `paidAt`: when the payment was recorded (its lot's created_at), where the refund window starts;
   * `refundable`: false once it was given back after its client left, or after a part of its premium
   * reading was written (LEFT_SQL): it can be opened again but never refunded, by 환불받기 or by account deletion
   */
  unused: Array<{ orderId: string; productId: string; paidAt: number; refundable: boolean }>;
  /** readings being opened, oldest first */
  opening: Opening[];
}

export async function entitlements(db: D1Binding, userId: string, now: number): Promise<Entitlements> {
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
  // Every lot that can still open something, and every gift lot (a spent one says the gift was used).
  const { results } = await db
    .prepare(
      `SELECT currency, order_id, product_id, units_left, expires_at, created_at, ${LEFT_SQL("credit_lots")} AS left_once FROM credit_lots
       WHERE user_id = ? AND status = 'active' AND (currency = 'free' OR (units_left > 0 AND (expires_at IS NULL OR expires_at > ?)))
       ORDER BY created_at`,
    )
    .bind(userId, now)
    .all<Pick<Lot, "currency" | "order_id" | "product_id" | "units_left" | "expires_at" | "created_at"> & { left_once: number }>();
  const usable = (lot: (typeof results)[number]) => lot.units_left > 0 && (lot.expires_at === null || lot.expires_at > now);
  const gifts = results.filter((lot) => lot.currency === "free");
  const left = gifts.filter(usable);
  const expiries = left.map((lot) => lot.expires_at).filter((at): at is number => at !== null);
  const gift: GiftState =
    left.length > 0
      ? { status: "unused", expiresAt: expiries.length ? Math.min(...expiries) : null }
      : gifts.some((lot) => lot.units_left === 0)
        ? { status: "used" }
        : null;
  return {
    gift,
    unused: results
      .filter((lot) => usable(lot) && lot.currency === "paid" && lot.order_id !== null && lot.product_id !== null)
      .map((lot) => ({ orderId: lot.order_id!, productId: lot.product_id!, paidAt: lot.created_at, refundable: !lot.left_once })),
    opening: reservations.results.map((row) => ({
      productId: row.product_id,
      currency: row.currency === "paid" ? "paid" : "gift",
      orderId: row.currency === "paid" ? (row.order_id ?? null) : null,
    })),
  };
}
