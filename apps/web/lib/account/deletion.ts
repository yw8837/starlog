import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { entitlements, forfeitStatements, sweepUser, type Lot } from "@/lib/pay/ledger";
import { orderForUser, reconcileConfirming, type OrderRow } from "@/lib/pay/orders";
import { paidUnderOtherKeys, reconcileRefunding, refundUnusedOrder, setAsideForOperator } from "@/lib/pay/refunds";
import type { TossClient } from "@/lib/pay/tossTypes";
import { signToken, verifyToken, type SignedPayload } from "@/lib/security/sign";

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
 * does not hold the deletion up.
 */
const IN_FLIGHT = `status IN ('confirming', 'refunding')
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.id AND p.mode <> COALESCE(?, p.mode))`;

async function count(db: D1Binding, sql: string, ...values: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...values).first<{ n: number }>())?.n ?? 0;
}

/**
 * 회원 탈퇴 (spec 5.8, M3): settle what is in flight, refuse while anything still is, refund every
 * unopened purchase, mark the account deleted with one guarded statement, then erase.
 */
export async function deleteAccount(db: D1Binding, toss: TossClient | null, input: { userId: string; now: number }): Promise<DeleteOutcome> {
  const { userId, now } = input;
  await sweepUser(db, userId, now);
  const mode = toss?.mode ?? null;
  if (toss) {
    const { results } = await db.prepare(`SELECT * FROM orders WHERE user_id = ? AND ${IN_FLIGHT}`).bind(userId, mode).all<OrderRow>();
    for (const order of results) {
      if (order.status === "confirming") await reconcileConfirming(db, toss, order, now, { force: true, confirmAgain: false });
      else await reconcileRefunding(db, toss, order, now);
    }
  }
  if (await count(db, `SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND ${IN_FLIGHT}`, userId, mode)) return { ok: false, code: "PENDING" };
  if (await count(db, "SELECT COUNT(*) AS n FROM unlocks WHERE user_id = ? AND status = 'reserved'", userId)) return { ok: false, code: "IN_USE" };

  const { unused } = await entitlements(db, userId, now);
  let refunded = 0;
  for (const { orderId } of unused) {
    const order = await orderForUser(db, orderId, userId);
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

  // One guarded statement: nothing reserved, nothing in flight, no unopened paid reading left.
  const marked = await db
    .prepare(
      `UPDATE users SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM unlocks WHERE user_id = ? AND status = 'reserved')
         AND NOT EXISTS (SELECT 1 FROM orders WHERE user_id = ? AND ${IN_FLIGHT})
         AND NOT EXISTS (SELECT 1 FROM credit_lots WHERE user_id = ? AND currency = 'paid' AND status = 'active' AND units_left > 0 AND units_left = units_total)
       RETURNING id`,
    )
    .bind(now, userId, userId, userId, mode, userId)
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
 * Erases a deleted account's personal data in one batch, keeping what the law keeps:
 * - an unused signup gift is forfeited (its ledger rows stay);
 * - saved readings and sessions are deleted;
 * - its gift claim is stamped with the deletion time (purged a year later, Task 13);
 * - orders that never reached Toss are closed;
 * - kakao_key and nickname are blanked and erased_at set.
 * Orders, payments, lots and the ledger stay 5 years under the tombstone (전자상거래법 제6조).
 * Idempotent; only for an account already marked deleted. True when this call erased it.
 */
export async function eraseDeletedAccount(db: D1Binding, userId: string, now: number): Promise<boolean> {
  const { results: freeLots } = await db
    .prepare("SELECT * FROM credit_lots WHERE user_id = ? AND currency = 'free' AND status = 'active' AND units_left > 0")
    .bind(userId)
    .all<Lot>();
  const results = await db.batch([
    ...freeLots.flatMap((lot) => forfeitStatements(db, lot, "revoked", now)),
    db.prepare(`DELETE FROM readings WHERE user_id = ? AND ${DELETED}`).bind(userId, userId),
    db.prepare(`DELETE FROM sessions WHERE user_id = ? AND ${DELETED}`).bind(userId, userId),
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
