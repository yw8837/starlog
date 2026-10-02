import "server-only";
import { eraseDeletedAccount } from "@/lib/account/deletion";
import type { D1Binding, D1Statement } from "@/lib/db/d1";
import { sweepStale } from "./ledger";
import { RECONCILE_AFTER_MS, reconcileConfirming, type OrderRow } from "./orders";
import { REFUND_RECONCILE_AFTER_MS, reconcileRefunding } from "./refunds";
import type { TossClient } from "./tossTypes";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A deleted account's gift claim is kept this long (no second signup gift), then purged. */
export const GIFT_CLAIM_KEEP_MS = 365 * DAY_MS;
/** 전자상거래법 제6조: contract, withdrawal and payment records 5 years (plus a day of margin). */
export const RECORD_KEEP_MS = 1827 * DAY_MS;
const ORDERS_PER_RUN = 50;
const ERASES_PER_RUN = 50;
const PURGES_PER_RUN = 20;
const ROWS_PER_PURGE = 500;

export interface MaintenanceReport {
  confirming: number;
  refunding: number;
  released: number;
  expired: number;
  erased: number;
  sessions: number;
  giftClaims: number;
  purgedAccounts: number;
}

/** Everything an erased account still has, for when its last order is older than RECORD_KEEP_MS. */
function purgeStatements(db: D1Binding, userId: string): D1Statement[] {
  return [
    db.prepare("DELETE FROM ledger WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM unlocks WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM credit_lots WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)").bind(userId),
    db.prepare("DELETE FROM orders WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ? AND erased_at IS NOT NULL").bind(userId),
  ];
}

/**
 * The Cron Trigger's work, every 10 minutes (worker.mjs → /api/internal/maintenance): settle what
 * users left behind and purge what is past its keeping. Each step is bounded; whatever is left over
 * goes in the next run. Toss steps are skipped when payments are not configured.
 */
export async function runMaintenance(db: D1Binding, toss: TossClient | null, now: number): Promise<MaintenanceReport> {
  const report: MaintenanceReport = { confirming: 0, refunding: 0, released: 0, expired: 0, erased: 0, sessions: 0, giftClaims: 0, purgedAccounts: 0 };
  if (toss) {
    const confirming = await db
      .prepare("SELECT * FROM orders WHERE status = 'confirming' AND updated_at < ? ORDER BY updated_at LIMIT ?")
      .bind(now - RECONCILE_AFTER_MS, ORDERS_PER_RUN)
      .all<OrderRow>();
    for (const order of confirming.results) {
      await reconcileConfirming(db, toss, order, now);
      report.confirming++;
    }
    const refunding = await db
      .prepare("SELECT * FROM orders WHERE status = 'refunding' AND updated_at < ? ORDER BY updated_at LIMIT ?")
      .bind(now - REFUND_RECONCILE_AFTER_MS, ORDERS_PER_RUN)
      .all<OrderRow>();
    for (const order of refunding.results) {
      await reconcileRefunding(db, toss, order, now);
      report.refunding++;
    }
  }
  const swept = await sweepStale(db, now);
  report.released = swept.released;
  report.expired = swept.expired;

  const unerased = await db.prepare("SELECT id FROM users WHERE deleted_at IS NOT NULL AND erased_at IS NULL LIMIT ?").bind(ERASES_PER_RUN).all<{ id: string }>();
  for (const { id } of unerased.results) if (await eraseDeletedAccount(db, id, now)) report.erased++;

  report.sessions =
    (await db.prepare("DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL LIMIT ?)").bind(now, ROWS_PER_PURGE).run()).meta?.changes ?? 0;
  report.giftClaims =
    (await db
      .prepare("DELETE FROM gift_claims WHERE kakao_key IN (SELECT kakao_key FROM gift_claims WHERE account_deleted_at < ? LIMIT ?)")
      .bind(now - GIFT_CLAIM_KEEP_MS, ROWS_PER_PURGE)
      .run()).meta?.changes ?? 0;
  const purgeable = await db
    .prepare(
      `SELECT id FROM users u WHERE erased_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.created_at >= ?)
       LIMIT ?`,
    )
    .bind(now - RECORD_KEEP_MS, PURGES_PER_RUN)
    .all<{ id: string }>();
  for (const { id } of purgeable.results) {
    await db.batch(purgeStatements(db, id));
    report.purgedAccounts++;
  }
  return report;
}
