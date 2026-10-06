import "server-only";
import { openAccount } from "@/lib/account/request";
import { isReviewAccount, isReviewer } from "@/lib/account/review";
import type { D1Binding } from "@/lib/db/d1";
import { standardProduct, unitsFor, type StandardProductId } from "@/lib/pay/catalog";
import { deliverUnlock, releaseUnlock, reserveUnlock } from "@/lib/pay/ledger";
import { openingOffer, payKeyMode, paymentsMode } from "@/lib/pay/mode";
import type { UnlockMethod } from "@/lib/pay/unlockMethod";
import { insertReadingStatement, newReadingId, readingExists, type ReadingSource, type ServerChapter } from "@/lib/readings/store";
import type { QuotaState } from "@/lib/security/quota";
import { checkQuota, checkServerLimits, errorResponse, type Gate } from "./http";
import type { SpendKind } from "./spend";
import type { GenerationOutcome, Settlement } from "./stream";

/**
 * How a full reading is paid for, decided before any generation starts (spec 5.4). See the table in
 * the plan's Task 10:
 * - `opening`: the 오픈 기념 daily free reading, exactly as before P4 (cookie quota, server limits,
 *   network counter). 402 PAYMENT_REQUIRED once payments are on for everyone; never for the owner.
 * - `free` (별조각): login, the free budget and network cap (it costs us what a free reading costs),
 *   then the reservation. Spending is never gated by STARLOG_PAYMENTS.
 * - `paid`: login, then the reservation. Its model cost goes to the paid book. On a production deploy
 *   running test keys it earned nothing, so it is held and counted like `free` (security M2).
 * - `owner`: the owner pass and the owner's server limits, no ledger; saved when logged in.
 */

export interface UnlockPlan {
  method: UnlockMethod;
  productId: StandardProductId;
  /** the device's cookie quota: the 오픈 기념 reading spends it after a validated generation */
  quota: QuotaState | null;
  /** RespondOptions.spend: the network day counter, charged before the start (none for a paid opening on real keys) */
  spend: SpendKind | undefined;
  /** RespondOptions.paidCost: a paid opening's model cost goes to the paid book */
  paidCost: boolean;
  save: { db: D1Binding; accountSecret: string; userId: string; source: ReadingSource; unlockId: string | null } | null;
}

export async function planUnlock(request: Request, gate: Gate, kind: StandardProductId, method: UnlockMethod = "opening"): Promise<UnlockPlan | Response> {
  const base = { method, productId: kind, quota: null, spend: "full" as const, paidCost: false, save: null };
  if (method === "opening") {
    if (!gate.owner && !openingOffer(paymentsMode())) return errorResponse("PAYMENT_REQUIRED");
    const quota = await checkQuota(gate, "full");
    if (quota instanceof Response) return quota;
    return { ...base, quota };
  }
  if (method === "owner") {
    if (!gate.owner) return errorResponse("FORBIDDEN");
    const limited = await checkServerLimits(gate, "full");
    if (limited) return limited;
    const ctx = await openAccount(request, gate.now);
    const user = ctx instanceof Response ? null : ctx.session?.user;
    if (ctx instanceof Response || !user) return base;
    return { ...base, save: { db: ctx.db, accountSecret: ctx.accountSecret, userId: user.id, source: "owner", unlockId: null } };
  }
  const ctx = await openAccount(request, gate.now);
  if (ctx instanceof Response) return ctx;
  const user = ctx.session?.user;
  if (!user) return errorResponse("LOGIN_REQUIRED");
  // A review account whose credentials are gone or replaced opens nothing (security M1).
  if (isReviewAccount(user) && !(await isReviewer(user, ctx.accountSecret))) return errorResponse("NOT_AVAILABLE");
  // A paid opening on a production deploy's test keys earned nothing (a test payment charges nobody):
  // it is held and counted like a free one (security M2).
  const unbacked = method === "paid" && process.env.NODE_ENV === "production" && payKeyMode() === "test";
  if (method === "free" || unbacked) {
    // 별조각 readings cost us what free readings cost: the free budget and the network cap apply (minor 4).
    const limited = await checkServerLimits(gate, "full");
    if (limited) return limited;
  }
  const reserved = await reserveUnlock(ctx.db, {
    userId: user.id,
    productId: kind,
    currency: method === "paid" ? "paid" : "free",
    // 별조각 by the reading's price in units; a paid opening takes one whole purchase (reserveUnlock).
    units: unitsFor(standardProduct(kind)),
    now: gate.now,
    payMode: payKeyMode(),
  });
  if (!reserved.ok) return errorResponse("NO_CREDIT");
  console.info(JSON.stringify({ evt: "unlock.reserved", method, productId: kind }));
  return {
    method,
    productId: kind,
    quota: null,
    spend: method === "free" || unbacked ? "full" : undefined,
    paidCost: method === "paid" && !unbacked,
    save: { db: ctx.db, accountSecret: ctx.accountSecret, userId: user.id, source: method, unlockId: reserved.unlockId },
  };
}

/**
 * Saves the reading to the account, and spends the reservation, before the client sees the reading
 * (stream.ts Settlement, inside the generation's keepAlive work). recover() looks for exactly this
 * generation's row, so a save whose answer was lost still reaches the client. Every failure
 * releases the reservation. Without anything to save (오픈 기념, or an owner not logged in) there is
 * no settlement.
 */
export function settlementFor(plan: UnlockPlan, chapterOf: (body: Record<string, unknown>) => ServerChapter, now: number): Settlement | undefined {
  const save = plan.save;
  if (!save) return undefined;
  const readingId = newReadingId();
  return {
    async deliver(outcome: GenerationOutcome) {
      const insert = await insertReadingStatement(save.db, save.accountSecret, {
        id: readingId,
        userId: save.userId,
        productId: plan.productId,
        source: save.source,
        unlockId: save.unlockId,
        chapter: chapterOf(outcome.body as Record<string, unknown>),
        now,
      });
      if (save.unlockId) {
        const result = await deliverUnlock(save.db, { unlockId: save.unlockId, readingId, now: Date.now(), before: [insert] });
        console.info(JSON.stringify({ evt: result === "delivered" ? "unlock.delivered" : "unlock.reservation_lost", unlockId: save.unlockId }));
        if (result === "lost" && !(await readingExists(save.db, save.userId, readingId))) return {};
      } else {
        const [saved] = await save.db.batch([insert]);
        if (saved?.meta?.changes !== 1) return {};
      }
      return { readingId };
    },
    async recover() {
      return (await readingExists(save.db, save.userId, readingId)) ? { readingId } : null;
    },
    async release() {
      if (save.unlockId && (await releaseUnlock(save.db, { unlockId: save.unlockId, now: Date.now() }))) {
        console.info(JSON.stringify({ evt: "unlock.released", unlockId: save.unlockId }));
      }
    },
  };
}
