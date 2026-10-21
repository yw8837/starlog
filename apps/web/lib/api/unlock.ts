import "server-only";
import { openAccount } from "@/lib/account/request";
import { openingFreeOn } from "@/lib/config";
import { isReviewAccount, isReviewer } from "@/lib/account/review";
import type { D1Binding } from "@/lib/db/d1";
import { GIFT_PRODUCT, type StandardProductId } from "@/lib/pay/catalog";
import { deliverUnlock, releaseUnlock, reserveUnlock, type Currency } from "@/lib/pay/ledger";
import { payKeyMode, paymentsUnbacked } from "@/lib/pay/mode";
import type { UnlockMethod } from "@/lib/pay/unlockMethod";
import { insertReadingStatement, newReadingId, readingExists, type ReadingSource, type ServerChapter } from "@/lib/readings/store";
import { checkFirstFree, checkServerLimits, errorResponse, type Gate } from "./http";
import type { SpendKind } from "./spend";
import type { GenerationOutcome, Settlement } from "./stream";

/**
 * How a full reading is paid for, decided before any generation starts (spec 5.4). See the table in
 * the plan's Task 10:
 * - `opening`: 오픈 기념 무료, the device's one free tarot reading (the `sl_first` cookie, server limits,
 *   network counter), until SITE.beta.openingEndsAt (owner 2026-10-14 evening); from then on it is 402
 *   PAYMENT_REQUIRED before any generation. Tarot only: saju opens with a payment or the owner pass
 *   (402 PAYMENT_REQUIRED). It stays after payments open for everyone (owner 2026-10-14).
 * - `free` (the signup gift): new accounts get none any more (owner 2026-10-14 evening); a gift granted
 *   before still opens a standard tarot reading only (GIFT_PRODUCT; anything else is 402 NO_CREDIT
 *   before anything is held). Login, the free budget and network cap (it costs us what a
 *   free reading costs), then the reservation. Using it is never gated by STARLOG_PAYMENTS.
 * - `paid`: login, then the reservation. Its model cost goes to the paid book. On a production deploy
 *   running test keys it earned nothing, so it is held and counted like `free` (security M2).
 * - `owner`: the owner pass, which no server limit or budget closes (http.ts checkServerLimits), no ledger; saved when logged in.
 */

/**
 * L-1: a purchase whose openings the model began writing failed MAX_BEGAN_RESTORES times opens no more
 * (lib/pay/ledger.ts reserveUnlock `capped`). It was never used: a failure on our side is refunded on
 * request whenever it was paid (app/refund, 생성 실패와 오류). A signup gift has nothing to refund.
 * The log names the lot, so a request can be found (lot_<order id> for a purchase).
 */
export const CAPPED_MESSAGE: Readonly<Record<Currency, string>> = {
  paid: "풀이가 여러 번 끝까지 나오지 않아 이 결제로는 더 열 수 없어요. 결제는 쓰이지 않았으니 문의해 주시면 기간과 상관없이 전액 환불해 드려요.",
  free: "풀이가 여러 번 끝까지 나오지 않아 이 가입 선물로는 더 열 수 없어요. 문의해 주세요.",
};
export const cappedResponse = (productId: string, currency: Currency, lotId: string | undefined) => {
  console.warn(JSON.stringify({ evt: "unlock.capped", productId, lotId }));
  return errorResponse("NOT_AVAILABLE", { reason: "capped", message: CAPPED_MESSAGE[currency] });
};

export interface UnlockPlan {
  method: UnlockMethod;
  productId: StandardProductId;
  /** 오픈 기념 무료: the free readings this device used before; the route spends one after a validated generation */
  first: number | null;
  /** RespondOptions.spend: the network day counter, charged before the start (none for a paid opening on real keys) */
  spend: SpendKind | undefined;
  /** RespondOptions.paidCost: a paid opening's model cost goes to the paid book */
  paidCost: boolean;
  save: { db: D1Binding; accountSecret: string; userId: string; source: ReadingSource; unlockId: string | null } | null;
}

export async function planUnlock(request: Request, gate: Gate, kind: StandardProductId, method: UnlockMethod = "opening"): Promise<UnlockPlan | Response> {
  const base = { method, productId: kind, first: null, spend: "full" as const, paidCost: false, save: null };
  if (method === "opening") {
    if (kind !== "tarot" || !openingFreeOn(gate.now)) return errorResponse("PAYMENT_REQUIRED");
    const first = await checkFirstFree(gate);
    if (first instanceof Response) return first;
    return { ...base, first };
  }
  if (method === "owner") {
    if (!gate.owner) return errorResponse("FORBIDDEN");
    const ctx = await openAccount(request, gate.now);
    const user = ctx instanceof Response ? null : ctx.session?.user;
    if (ctx instanceof Response || !user) return base;
    return { ...base, save: { db: ctx.db, accountSecret: ctx.accountSecret, userId: user.id, source: "owner", unlockId: null } };
  }
  // The signup gift never opens saju (주제별 사주 included); the ledger refuses it as well.
  if (method === "free" && kind !== GIFT_PRODUCT) return errorResponse("NO_CREDIT");
  const ctx = await openAccount(request, gate.now);
  if (ctx instanceof Response) return ctx;
  const user = ctx.session?.user;
  if (!user) return errorResponse("LOGIN_REQUIRED");
  // A review account whose credentials are gone or replaced opens nothing (security M1).
  if (isReviewAccount(user) && !(await isReviewer(user, ctx.accountSecret))) return errorResponse("NOT_AVAILABLE");
  // A paid opening on a production deploy's test keys earned nothing (a test payment charges nobody):
  // it is held and counted like a free one (security M2).
  const unbacked = method === "paid" && paymentsUnbacked();
  if (method === "free" || unbacked) {
    // Gift readings cost us what free readings cost: the free budget and the network cap apply (minor 4).
    // A credit pays for them, so not the network's free-tier cost share (SEC-01).
    const limited = await checkServerLimits(gate, "full", {}, { credit: true });
    if (limited) return limited;
  }
  const currency = method === "paid" ? "paid" : "free";
  const reserved = await reserveUnlock(ctx.db, { userId: user.id, productId: kind, currency, now: gate.now, payMode: payKeyMode() });
  if (!reserved.ok) return reserved.capped ? cappedResponse(kind, currency, reserved.lotId) : errorResponse("NO_CREDIT");
  console.info(JSON.stringify({ evt: "unlock.reserved", method, productId: kind }));
  return {
    method,
    productId: kind,
    first: null,
    spend: method === "free" || unbacked ? "full" : undefined,
    paidCost: method === "paid" && !unbacked,
    save: { db: ctx.db, accountSecret: ctx.accountSecret, userId: user.id, source: method, unlockId: reserved.unlockId },
  };
}

/**
 * Saves the reading to the account, and spends the reservation, before the client sees the reading
 * (stream.ts Settlement, inside the generation's keepAlive work). recover() looks for exactly this
 * generation's row, so a save whose answer was lost still reaches the client. Every failure
 * releases the reservation; a client that left after the model began answering abandons it instead
 * (SEC-02: given back to reopen, at most MAX_RESTORES times, no longer refundable). Without anything
 * to save (오픈 기념 무료, or an owner not logged in) there is no settlement.
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
    async release(began) {
      if (save.unlockId && (await releaseUnlock(save.db, { unlockId: save.unlockId, now: Date.now(), began }))) {
        console.info(JSON.stringify({ evt: "unlock.released", unlockId: save.unlockId }));
      }
    },
    // SEC-02: the client left after the model began answering: the credit comes back to reopen
    // (within MAX_RESTORES) but the purchase is no longer refundable.
    async abandon() {
      if (save.unlockId && (await releaseUnlock(save.db, { unlockId: save.unlockId, now: Date.now(), left: true }))) {
        console.info(JSON.stringify({ evt: "unlock.abandoned", unlockId: save.unlockId }));
      }
    },
  };
}
