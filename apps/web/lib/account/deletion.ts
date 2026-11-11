import "server-only";
import { sealOpeningClaim } from "@/lib/account/openingClaim";
import { accountFriendKey } from "@/lib/bonds/identity";
import { eraseReviewStatements } from "@/lib/reviews/store";
import type { D1Binding } from "@/lib/db/d1";
import { LOT_UNTOUCHED_SQL, entitlements, forfeitStatements, sweepUser, type Lot } from "@/lib/pay/ledger";
import { orderForUser, reconcileConfirming, type OrderRow } from "@/lib/pay/orders";
import { playClient, type PlayClient } from "@/lib/pay/play";
import { PLAY_REFUND_STUCK_MS, PLAY_REFUND_STUCK_SQL, paidWithPlay, refundUnusedPlayOrder, setAsideStuckPlayRefunds } from "@/lib/pay/playOrders";
import { paidUnderOtherKeys, reconcileRefunding, refundUnusedOrder, setAsideForOperator } from "@/lib/pay/refunds";
import type { TossClient } from "@/lib/pay/tossTypes";
import { signToken, signingSecret, verifyToken, type SignedPayload } from "@/lib/security/sign";

/** How long the deletion intent from 내 정보 is good for. */
export const DELETE_INTENT_TTL_MS = 5 * 60 * 1000;

interface DeleteIntentPayload extends SignedPayload {
  k: "delete-intent";
  sid: string;
  exp: number;
}

/**
 * A 5-minute token naming the session that asked to delete its account. Only a same-origin POST
 * hands one out, so a link from another site can never start a deletion (spec 5.8).
 */
export function issueDeleteIntent(sessionId: string, secret: string, now: number): Promise<string> {
  const payload: DeleteIntentPayload = { k: "delete-intent", sid: sessionId, exp: now + DELETE_INTENT_TTL_MS };
  return signToken(payload, secret);
}

export async function deleteIntentFor(token: string | null, sessionId: string, secret: string, now: number): Promise<boolean> {
  const payload = await verifyToken<DeleteIntentPayload>(token, "delete-intent", secret, now);
  return payload?.sid === sessionId;
}

export type DeleteOutcome = { ok: true; refunded: number } | { ok: false; code: "PENDING" | "IN_USE" | "REFUND_FAILED" };

/**
 * Orders still settling with Toss. One paid under other keys than this deploy's (`?`, the Toss mode;
 * null counts every order) never settles here: the operator does it by hand (runbook section 5), so it
 * does not hold the deletion up. A Google Play refund in flight counts (playOrders.ts: it settles with Google), except one stuck
 * past PLAY_REFUND_STUCK_MS (the second `?`: now less that), set aside for the operator once the account is deleted
 * (eraseDeletedAccount).
 */
const IN_FLIGHT = `status IN ('confirming', 'refunding')
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.id AND p.mode <> COALESCE(?, p.mode) AND p.mode <> 'play')
  AND NOT ${PLAY_REFUND_STUCK_SQL}`;

async function count(db: D1Binding, sql: string, ...values: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...values).first<{ n: number }>())?.n ?? 0;
}

/**
 * 회원 탈퇴 (spec 5.8, M3): settle what is in flight, refuse while anything still is, refund every
 * unopened purchase (a set with one reading opened: the other's part, owner 2026-11-10), mark the account deleted with one
 * guarded statement, then erase. An unopened Google Play purchase (the Android app) is refunded through Google (`play`, this
 * deploy's Play client by default); without Play, or when Google refuses, it is set aside for the operator like a payment
 * under other keys, so the deletion still completes.
 */
export async function deleteAccount(
  db: D1Binding,
  toss: TossClient | null,
  input: { userId: string; now: number },
  play: PlayClient | null = playClient(),
): Promise<DeleteOutcome> {
  const { userId, now } = input;
  await sweepUser(db, userId, now);
  const mode = toss?.mode ?? null;
  const stuckBefore = now - PLAY_REFUND_STUCK_MS;
  if (toss) {
    // Play orders settle with Google (the cron), never with Toss.
    const { results } = await db
      .prepare(`SELECT * FROM orders WHERE user_id = ? AND ${IN_FLIGHT} AND NOT EXISTS (SELECT 1 FROM payments pm WHERE pm.order_id = orders.id AND pm.mode = 'play')`)
      .bind(userId, mode, stuckBefore)
      .all<OrderRow>();
    for (const order of results) {
      if (order.status === "confirming") await reconcileConfirming(db, toss, order, now, { force: true, confirmAgain: false });
      else await reconcileRefunding(db, toss, order, now);
    }
  }
  if (await count(db, `SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND ${IN_FLIGHT}`, userId, mode, stuckBefore)) return { ok: false, code: "PENDING" };
  if (await count(db, "SELECT COUNT(*) AS n FROM unlocks WHERE user_id = ? AND status = 'reserved'", userId)) return { ok: false, code: "IN_USE" };

  const { unused } = await entitlements(db, userId, now);
  let refunded = 0;
  // A set's two readings are one order, refunded once (its untouched lots: both, or the unopened one's part). One given back
  // after its client left (SEC-02) refunds nothing; it leaves use with the account (eraseDeletedAccount).
  for (const orderId of new Set(unused.filter((item) => item.refundable > 0).map((item) => item.orderId))) {
    const order = await orderForUser(db, orderId, userId);
    if (order && (await paidWithPlay(db, order.id))) {
      const played = play ? await refundUnusedPlayOrder(db, play, { order, now }) : null;
      if (played?.ok) {
        refunded++;
        continue;
      }
      if (played?.code === "PAY_PENDING") return { ok: false, code: "PENDING" };
      // Play not configured, Google refused, or a set with one reading opened: the reading leaves use, the order stays for
      // the operator, who refunds it in Play Console (runbook 11).
      console.warn(JSON.stringify({ evt: "account.delete_play_set_aside", orderId: order.id }));
      await setAsideForOperator(db, order.id, now);
      continue;
    }
    if (order && toss && (await paidUnderOtherKeys(db, toss, order.id))) {
      // These keys cannot cancel it: the reading leaves use, the order stays for the operator (runbook 5).
      await setAsideForOperator(db, order.id, now);
      continue;
    }
    const outcome = order && toss ? await refundUnusedOrder(db, toss, { order, reason: "회원 탈퇴: 열지 않은 풀이 환불", now }) : null;
    if (!outcome?.ok) {
      console.warn(JSON.stringify({ evt: "account.delete_refund_failed", orderId }));
      return { ok: false, code: outcome && !outcome.ok && outcome.code === "PAY_PENDING" ? "PENDING" : "REFUND_FAILED" };
    }
    refunded++;
  }
  // An unopened reading whose order refunds 0원 now (what Toss cancelled already covers it, or a reading kept that the catalog
  // does not know): there is nothing to send, so its lot leaves use with the account (logged for the operator) instead of
  // holding the deletion up for good below.
  const nothingBack = new Set(unused.filter((item) => item.refundable === 0 && item.noRefund !== "left").map((item) => item.orderId));
  if (nothingBack.size) {
    const { results } = await db.prepare(`SELECT * FROM credit_lots c WHERE c.user_id = ? AND c.currency = 'paid' AND ${LOT_UNTOUCHED_SQL("c")}`).bind(userId).all<Lot>();
    const stranded = results.filter((lot) => lot.order_id !== null && nothingBack.has(lot.order_id));
    if (stranded.length) {
      console.warn(JSON.stringify({ evt: "account.delete_unrefundable_lot", orderIds: [...new Set(stranded.map((lot) => lot.order_id))] }));
      await db.batch(stranded.flatMap((lot) => forfeitStatements(db, lot, "revoked", now)));
    }
  }

  // One guarded statement: nothing reserved, nothing in flight, no unopened refundable paid reading left.
  const marked = await db
    .prepare(
      `UPDATE users SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM unlocks WHERE user_id = ? AND status = 'reserved')
         AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id = ? AND ${IN_FLIGHT})
         AND NOT EXISTS (SELECT 1 FROM credit_lots c WHERE c.user_id = ? AND c.currency = 'paid' AND ${LOT_UNTOUCHED_SQL("c")})
       RETURNING id`,
    )
    .bind(now, userId, userId, userId, mode, stuckBefore, userId)
    .first();
  if (!marked) {
    const inUse = await count(db, "SELECT COUNT(*) AS n FROM unlocks WHERE user_id = ? AND status = 'reserved'", userId);
    return { ok: false, code: inUse ? "IN_USE" : "PENDING" };
  }
  await eraseDeletedAccount(db, userId, now);
  console.info(JSON.stringify({ evt: "account.deleted", refunded }));
  return { ok: true, refunded };
}

const DELETED = "EXISTS (SELECT 1 FROM users WHERE id = ? AND deleted_at IS NOT NULL)";

/**
 * 별자리 인연 (owner 2026-10-27): the owner that belongs to a deleted account goes with it, with its constellations and
 * the friends' stars in them and its invites (its link stops opening), as an owner's own data. Run before the account's
 * erase so an interrupted erase (the cron runs it again) never leaves it behind. Owners made on a device and never
 * linked belong to no account and stay with their device. Before migration 0019 no owner belongs to an account.
 */
async function eraseBondsOwner(db: D1Binding, userId: string): Promise<void> {
  const mine = `SELECT id FROM owners WHERE user_id = ? AND ${DELETED}`;
  try {
    await db.batch([
      db.prepare(`DELETE FROM stars WHERE constellation_id IN (SELECT id FROM constellations WHERE owner_id IN (${mine}))`).bind(userId, userId),
      db.prepare(`DELETE FROM constellations WHERE owner_id IN (${mine})`).bind(userId, userId),
      db.prepare(`DELETE FROM invites WHERE owner_id IN (${mine})`).bind(userId, userId),
      db.prepare(`DELETE FROM owners WHERE id IN (${mine})`).bind(userId, userId),
    ]);
  } catch (error) {
    if (!/no such column: user_id/i.test(error instanceof Error ? error.message : String(error))) throw error;
  }
}

/**
 * 별자리 인연 (review 2026-11-10): the stars a deleted account joined as a friend (under accountFriendKey since a friend logs
 * in to join, owner 2026-11-10) go with it, with their `bond:` share links and the owners' blocks of that key, and each
 * constellation they were in is recounted (its total; a completed one stays completed, as a tally never un-completes). Stars a
 * device joined before 2026-11-10 belong to the device and stay. Run before the account's erase, as eraseBondsOwner is.
 */
async function eraseFriendStars(db: D1Binding, userId: string): Promise<void> {
  const secret = signingSecret();
  if (!secret) return; // no key without it, and no join either (every /api/bonds route answers NOT_CONFIGURED)
  const key = await accountFriendKey(userId, secret);
  const joined = `SELECT id FROM stars WHERE friend_key = ? AND ${DELETED}`;
  const { results } = await db
    .prepare(`SELECT DISTINCT constellation_id AS id FROM stars WHERE friend_key = ? AND ${DELETED}`)
    .bind(key, userId)
    .all<{ id: string }>();
  await db.batch([
    db.prepare(`DELETE FROM shares WHERE chapter_key IN (SELECT 'bond:' || id FROM (${joined}))`).bind(key, userId),
    db.prepare(`DELETE FROM stars WHERE id IN (${joined})`).bind(key, userId),
    db.prepare(`DELETE FROM star_blocks WHERE friend_key = ? AND ${DELETED}`).bind(key, userId),
    ...results.map(({ id }) =>
      db.prepare("UPDATE constellations SET total = (SELECT COALESCE(SUM(score), 0) FROM stars WHERE constellation_id = ?1) WHERE id = ?1").bind(id),
    ),
  ]);
}

/**
 * Erases a deleted account's personal data in one batch, keeping what the law keeps:
 * - an unused signup gift is forfeited (its ledger rows stay), and so is a purchase given back after
 *   its client left (SEC-02: never refunded), or any other paid lot not untouched (deleteAccount refunded every untouched one);
 * - saved readings, share links, sessions and premium preview counts are deleted, and the account's reviews with their 도움돼요 and reports;
 * - its 신고 on readings (reading_reports) stay without its user id or note (free text may hold personal data);
 * - its gift claim is stamped with the deletion time (purged a year later, Task 13);
 * - its 오픈 기념 무료 claim stays, marked used, until the event's purge, first (sealOpeningClaim, owner 2026-10-28);
 * - a Google Play refund stuck past PLAY_REFUND_STUCK_MS, which the deletion did not wait for, is set aside for the operator
 *   (setAsideStuckPlayRefunds: here, so only ever once the deletion is certain);
 * - orders that never reached Toss are closed;
 * - kakao_key and nickname are blanked and erased_at set.
 * Orders, payments, lots and the ledger stay 5 years under the tombstone (전자상거래법 제6조).
 * Idempotent; only for an account already marked deleted. True when this call erased it.
 */
export async function eraseDeletedAccount(db: D1Binding, userId: string, now: number): Promise<boolean> {
  await sealOpeningClaim(db, userId);
  await setAsideStuckPlayRefunds(db, userId, now);
  const { results: forfeited } = await db
    .prepare(
      `SELECT * FROM credit_lots WHERE user_id = ? AND status = 'active' AND units_left > 0
         AND (currency = 'free' OR (currency = 'paid' AND NOT ${LOT_UNTOUCHED_SQL("credit_lots")}))`,
    )
    .bind(userId)
    .all<Lot>();
  await eraseBondsOwner(db, userId);
  await eraseFriendStars(db, userId);
  const results = await db.batch([
    ...forfeited.flatMap((lot) => forfeitStatements(db, lot, "revoked", now)),
    ...eraseReviewStatements(db, userId),
    // 신고 on readings (W2.5) stay, without who sent them.
    db.prepare(`UPDATE reading_reports SET user_id = NULL, note = NULL WHERE user_id = ? AND ${DELETED}`).bind(userId, userId),
    db.prepare(`DELETE FROM readings WHERE user_id = ? AND ${DELETED}`).bind(userId, userId),
    db.prepare(`DELETE FROM shares WHERE user_id = ? AND ${DELETED}`).bind(userId, userId),
    db.prepare(`DELETE FROM sessions WHERE user_id = ? AND ${DELETED}`).bind(userId, userId),
    db.prepare(`DELETE FROM buyer_previews WHERE user_id = ? AND ${DELETED}`).bind(userId, userId),
    db
      .prepare(`UPDATE gift_claims SET account_deleted_at = ? WHERE kakao_key = (SELECT kakao_key FROM users WHERE id = ? AND deleted_at IS NOT NULL)`)
      .bind(now, userId),
    db
      .prepare(`UPDATE orders SET status = 'failed', fail_code = 'ACCOUNT_DELETED', updated_at = ? WHERE user_id = ? AND status = 'created' AND ${DELETED}`)
      .bind(now, userId, userId),
    db.prepare("UPDATE users SET kakao_key = NULL, nickname = NULL, erased_at = ? WHERE id = ? AND deleted_at IS NOT NULL AND erased_at IS NULL").bind(now, userId),
  ]);
  return results[results.length - 1]?.meta?.changes === 1;
}
