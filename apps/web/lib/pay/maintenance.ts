import "server-only";
import { eraseDeletedAccount } from "@/lib/account/deletion";
import { purgeOpeningClaims } from "@/lib/account/openingClaim";
import { purgeChapterTurns } from "@/lib/api/chapterTurns";
import { openingFreeOn } from "@/lib/config";
import { purgeExpiredShares } from "@/lib/share/store";
import type { D1Binding, D1Statement } from "@/lib/db/d1";
import { sweepStale } from "./ledger";
import { RECONCILE_AFTER_MS, STALE_CONFIRM_MS, reconcileConfirming, type OrderRow } from "./orders";
import { REFUND_RECONCILE_AFTER_MS, reconcileRefunding } from "./refunds";
import { TossError, type TossClient } from "./tossTypes";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A deleted account's gift claim is kept this long (no second signup gift), then purged. */
export const GIFT_CLAIM_KEEP_MS = 365 * DAY_MS;
/** 전자상거래법 제6조: contract, withdrawal and payment records 5 years (plus a day of margin). */
export const RECORD_KEEP_MS = 1827 * DAY_MS;
/** An order still `created` after this never reached Toss's confirm: it is closed (ABANDONED). */
export const ABANDON_AFTER_MS = 60 * 60_000;
/**
 * Toss requests one run may make, well under the Worker's 50 subrequests: a confirming order takes
 * up to two (look-up, a lost confirm sent again), a refunding one up to three (look-up, cancel,
 * look-up after a refusal).
 */
export const TOSS_CALLS_PER_RUN = 30;
/** No Toss work starts after this long into a run; whatever is left goes in the next one. */
export const TOSS_DEADLINE_MS = 75_000;
/** Each Toss call from the cron waits at most this long (requests wait 30 s, toss.ts). */
export const CRON_TOSS_TIMEOUT_MS = 8_000;
const ORDERS_PER_RUN = 50;
const ERASES_PER_RUN = 50;
const PURGES_PER_RUN = 20;
const ROWS_PER_PURGE = 500;

export interface MaintenanceReport {
  confirming: number;
  refunding: number;
  released: number;
  expired: number;
  abandoned: number;
  erased: number;
  sessions: number;
  giftClaims: number;
  /** 오픈 기념 무료 claims, all deleted once it ended (they kept one per account, deleted accounts' too) */
  openingClaims: number;
  /** follow-up counts of chapters whose token died more than a day ago (G1) */
  chapterTurns: number;
  /** share links past their 180 days (SHARE-3) */
  shares: number;
  purgedAccounts: number;
  /** items (or whole steps) that threw; each is logged and the run goes on */
  failed: number;
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
    // The erase deleted them already; one an interrupted erase left behind must not block the purge.
    db.prepare("DELETE FROM readings WHERE user_id = ?").bind(userId),
    // Preview counts: the erase deletes them too; an account erased before it did keeps them until here.
    db.prepare("DELETE FROM buyer_previews WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ? AND erased_at IS NOT NULL").bind(userId),
  ];
}

/** A short, data-free code for a log line: Toss's error code, or the error's class name. */
const codeOf = (error: unknown) => (error instanceof TossError ? error.code : error instanceof Error ? error.name : "UNKNOWN");

/** The Toss client for one run, counting its calls (the subrequest budget). */
function counted(toss: TossClient): { client: TossClient; calls: () => number } {
  let calls = 0;
  const count = <T>(call: () => Promise<T>) => {
    calls++;
    return call();
  };
  return {
    calls: () => calls,
    client: {
      mode: toss.mode,
      confirm: (input) => count(() => toss.confirm(input)),
      getPayment: (paymentKey) => count(() => toss.getPayment(paymentKey)),
      getPaymentByOrder: (orderId) => count(() => toss.getPaymentByOrder(orderId)),
      cancel: (paymentKey, input) => count(() => toss.cancel(paymentKey, input)),
    },
  };
}

/**
 * The Cron Trigger's work, every 10 minutes (worker.mjs → /api/internal/maintenance): settle what
 * users left behind and purge what is past its keeping.
 * - The steps that need no Toss run first, so a slow or failing Toss never holds them up.
 * - Every item is on its own: one that throws is logged (event, order id, code) and the run goes on.
 * - Toss work stops at TOSS_CALLS_PER_RUN calls or TOSS_DEADLINE_MS, oldest first; whatever is left
 *   goes in the next run. An order the run could not decide (failed look-up, a stuck orphan, a
 *   partial cancel) moves behind the others, so it never blocks the head of the queue.
 * Toss steps are skipped when payments are not configured.
 */
export async function runMaintenance(db: D1Binding, toss: TossClient | null, now: number, options: { clock?: () => number } = {}): Promise<MaintenanceReport> {
  const clock = options.clock ?? Date.now;
  const report: MaintenanceReport = {
    confirming: 0, refunding: 0, released: 0, expired: 0, abandoned: 0, erased: 0, sessions: 0, giftClaims: 0, openingClaims: 0, chapterTurns: 0, shares: 0, purgedAccounts: 0, failed: 0,
  };
  /** One item or step: its result, or null when it threw (logged, counted, and the run goes on). */
  const attempt = async <T>(evt: string, work: () => Promise<T>, orderId?: string): Promise<T | null> => {
    try {
      return await work();
    } catch (error) {
      report.failed++;
      console.error(JSON.stringify({ evt, ...(orderId ? { orderId } : {}), code: codeOf(error) }));
      return null;
    }
  };

  await attempt("cron.sweep_failed", async () => {
    const swept = await sweepStale(db, now);
    report.released = swept.released;
    report.expired = swept.expired;
  });
  await attempt("cron.abandon_failed", async () => {
    report.abandoned =
      (await db
        .prepare(
          `UPDATE orders SET status = 'failed', fail_code = 'ABANDONED', updated_at = ?
           WHERE id IN (SELECT id FROM orders WHERE status = 'created' AND created_at < ? LIMIT ?)`,
        )
        .bind(now, now - ABANDON_AFTER_MS, ROWS_PER_PURGE)
        .run()).meta?.changes ?? 0;
  });
  await attempt("cron.erase_failed", async () => {
    const unerased = await db.prepare("SELECT id FROM users WHERE deleted_at IS NOT NULL AND erased_at IS NULL LIMIT ?").bind(ERASES_PER_RUN).all<{ id: string }>();
    for (const { id } of unerased.results) {
      await attempt("cron.erase_failed", async () => {
        if (await eraseDeletedAccount(db, id, now)) report.erased++;
      });
    }
  });
  await attempt("cron.purge_failed", async () => {
    report.sessions =
      (await db.prepare("DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL LIMIT ?)").bind(now, ROWS_PER_PURGE).run()).meta
        ?.changes ?? 0;
  });
  await attempt("cron.purge_failed", async () => {
    report.giftClaims =
      (await db
        .prepare("DELETE FROM gift_claims WHERE kakao_key IN (SELECT kakao_key FROM gift_claims WHERE account_deleted_at < ? LIMIT ?)")
        .bind(now - GIFT_CLAIM_KEEP_MS, ROWS_PER_PURGE)
        .run()).meta?.changes ?? 0;
  });
  if (!openingFreeOn(now)) {
    await attempt("cron.purge_failed", async () => {
      report.openingClaims = await purgeOpeningClaims(db, ROWS_PER_PURGE);
    });
  }
  await attempt("cron.purge_failed", async () => {
    report.chapterTurns = await purgeChapterTurns(db, now, ROWS_PER_PURGE);
  });
  await attempt("cron.purge_failed", async () => {
    report.shares = await purgeExpiredShares(db, now, ROWS_PER_PURGE);
  });
  await attempt("cron.purge_failed", async () => {
    const purgeable = await db
      .prepare(
        `SELECT id FROM users u WHERE erased_at IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.created_at >= ?)
         LIMIT ?`,
      )
      .bind(now - RECORD_KEEP_MS, PURGES_PER_RUN)
      .all<{ id: string }>();
    for (const { id } of purgeable.results) {
      await attempt("cron.purge_failed", async () => {
        await db.batch(purgeStatements(db, id));
        report.purgedAccounts++;
      });
    }
  });

  if (!toss) return report;
  const budget = counted(toss);
  const deadline = clock() + TOSS_DEADLINE_MS;
  const room = (calls: number) => budget.calls() + calls <= TOSS_CALLS_PER_RUN && clock() < deadline;
  /** Behind the others, unless something changed the order meanwhile. */
  const requeue = (order: OrderRow) =>
    db.prepare("UPDATE orders SET updated_at = ? WHERE id = ? AND status = ? AND updated_at = ?").bind(now, order.id, order.status, order.updated_at).run();
  const undecided = async (order: OrderRow, after: OrderRow | null) => {
    if (after && (after.status !== order.status || after.updated_at !== order.updated_at)) return;
    await requeue(order).catch(() => undefined);
  };

  await attempt("cron.confirm_failed", async () => {
    const confirming = await db
      .prepare("SELECT * FROM orders WHERE status = 'confirming' AND updated_at < ? ORDER BY updated_at LIMIT ?")
      .bind(now - RECONCILE_AFTER_MS, ORDERS_PER_RUN)
      .all<OrderRow>();
    for (const order of confirming.results) {
      if (!room(2)) break;
      report.confirming++;
      const after = await attempt("cron.confirm_failed", () => reconcileConfirming(db, budget.client, order, now), order.id);
      // Moved behind only once Toss's window has surely closed: before that the order is simply waiting.
      if (now - order.updated_at >= STALE_CONFIRM_MS) await undecided(order, after);
    }
  });
  await attempt("cron.refund_failed", async () => {
    // A payment made under other keys is left to the operator (refunds.ts paidUnderOtherKeys): never picked up.
    const refunding = await db
      .prepare(
        `SELECT * FROM orders o WHERE status = 'refunding' AND updated_at < ?
           AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.mode <> ?)
         ORDER BY updated_at LIMIT ?`,
      )
      .bind(now - REFUND_RECONCILE_AFTER_MS, toss.mode, ORDERS_PER_RUN)
      .all<OrderRow>();
    for (const order of refunding.results) {
      if (!room(3)) break;
      report.refunding++;
      const after = await attempt("cron.refund_failed", () => reconcileRefunding(db, budget.client, order, now), order.id);
      await undecided(order, after);
    }
  });
  return report;
}
