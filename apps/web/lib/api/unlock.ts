import "server-only";
import { holdOpeningClaim, keepOpeningClaim, releaseOpeningClaim, type OpeningClaim } from "@/lib/account/openingClaim";
import { openAccount } from "@/lib/account/request";
import { sessionCookieName } from "@/lib/account/session";
import { openingFreeOn } from "@/lib/config";
import { isReviewAccount, isReviewer } from "@/lib/account/review";
import type { D1Binding } from "@/lib/db/d1";
import { syncRevisionInForce } from "@/lib/legal";
import { GIFT_PRODUCT, type StandardProductId } from "@/lib/pay/catalog";
import { deliverUnlock, releaseUnlock, reserveUnlock, type Currency } from "@/lib/pay/ledger";
import { payKeyMode, paymentsUnbacked } from "@/lib/pay/mode";
import type { UnlockMethod } from "@/lib/pay/unlockMethod";
import { chapterReadingId, insertReadingStatement, newReadingId, readingExists, type ReadingSource, type ServerChapter } from "@/lib/readings/store";
import { openChapter } from "@/lib/security/chapterToken";
import { checkFirstFree, checkServerLimits, errorResponse, type Gate } from "./http";
import type { SpendKind } from "./spend";
import type { GenerationOutcome, Settlement } from "./stream";
import { checkBot } from "./turnstile";

/**
 * How a full reading is paid for, decided before any generation starts (spec 5.4). See the table in
 * the plan's Task 10:
 * - `opening`: 오픈 기념 무료, one free tarot reading per logged-in Kakao or Google account and per device (owner
 *   2026-10-27: the account's claim, opening_claims, held before generation, and the `sl_first` cookie; server limits,
 *   network counter), until SITE.beta.openingEndsAt; from then on it is 402 PAYMENT_REQUIRED before any generation.
 *   A visitor gets 401 LOGIN_REQUIRED (`reason: "opening"`), an account that took it 429 `scope: "account"`, and a claim
 *   that cannot be checked 409 NOT_AVAILABLE (`reason: "opening"`). The owner pass skips the device and server limits
 *   only. Tarot only: saju opens with a payment or the owner pass (402 PAYMENT_REQUIRED). From SYNC_REVISION_DATE
 *   (account sync) it is kept in the account too (`keep`, keepOpening).
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
  /**
   * Account sync (from SYNC_REVISION_DATE): a 오픈 기념 무료 reading opened while logged in is kept in the account too
   * (keepOpening). No settlement: nothing is held or spent, so the opening counts as a free one as before (SEC-01).
   */
  keep?: { db: D1Binding; accountSecret: string; userId: string; source: ReadingSource };
  /** 오픈 기념 무료: the account's claim, held until the reading is written (withOpeningClaim) */
  claim?: OpeningClaim;
}

/** 오픈 기념 무료 per account (owner 2026-10-27): a visitor logs in first (the screen comes back and opens it). */
const OPENING_LOGIN_MESSAGE = "오픈 기념 무료는 로그인하고 받을 수 있어요. 카카오나 Google로 로그인하면 바로 열려요.";
const OPENING_ACCOUNT_USED_MESSAGE = "이 계정으로는 오픈 기념 무료 풀이를 이미 받았어요.";
const OPENING_BUSY_MESSAGE = "다른 화면에서 오픈 기념 무료 풀이를 열고 있어요. 잠시 뒤에 다시 확인해 주세요.";
const OPENING_UNAVAILABLE_MESSAGE = "지금은 오픈 기념 무료를 열 수 없어요. 잠시 뒤에 다시 시도해 주세요.";
const openingLoginResponse = () => errorResponse("LOGIN_REQUIRED", { reason: "opening", message: OPENING_LOGIN_MESSAGE });
/** The claim cannot be checked (D1 down, or the claims table not migrated yet): fail closed; paid openings never ask. */
const openingUnavailableResponse = () => errorResponse("NOT_AVAILABLE", { reason: "opening", message: OPENING_UNAVAILABLE_MESSAGE });

export async function planUnlock(request: Request, gate: Gate, kind: StandardProductId, method: UnlockMethod = "opening"): Promise<UnlockPlan | Response> {
  const base = { method, productId: kind, first: null, spend: "full" as const, paidCost: false, save: null };
  if (method === "opening") {
    if (kind !== "tarot" || !openingFreeOn(gate.now)) return errorResponse("PAYMENT_REQUIRED");
    const first = await checkFirstFree(gate);
    if (first instanceof Response) return first;
    // A visitor is sent to log in without waiting on D1.
    if (!gate.cookies[sessionCookieName()]) return openingLoginResponse();
    let ctx: Awaited<ReturnType<typeof openAccount>>;
    try {
      ctx = await openAccount(request, gate.now);
    } catch (error) {
      // D1 down: the claim cannot be checked, so it fails closed (never a 500).
      console.error(JSON.stringify({ evt: "opening.account_failed", error: error instanceof Error ? error.constructor.name : typeof error }));
      return openingUnavailableResponse();
    }
    if (ctx instanceof Response) return openingUnavailableResponse();
    const user = ctx.session?.user;
    if (!user?.kakao_key) return openingLoginResponse();
    const bot = await checkBot(request, gate);
    if (bot) return bot;
    let claim: Awaited<ReturnType<typeof holdOpeningClaim>>;
    try {
      claim = await holdOpeningClaim(ctx.db, user.kakao_key, gate.now);
    } catch (error) {
      console.error(JSON.stringify({ evt: "opening.claim_failed", error: error instanceof Error ? error.constructor.name : typeof error }));
      return openingUnavailableResponse();
    }
    if (claim === "missing") {
      console.error(JSON.stringify({ evt: "opening.claim_unavailable", fix: "apply migrations/0018_opening_claims.sql" }));
      return openingUnavailableResponse();
    }
    if (claim === "taken") return errorResponse("BETA_LIMIT", { scope: "account", message: OPENING_ACCOUNT_USED_MESSAGE });
    if (claim === "busy") return errorResponse("NOT_AVAILABLE", { reason: "opening-busy", message: OPENING_BUSY_MESSAGE });
    // Account sync: from SYNC_REVISION_DATE the reading is kept in the account too; before it, on the device alone.
    if (!syncRevisionInForce(gate.now)) return { ...base, first, claim };
    return { ...base, first, claim, keep: { db: ctx.db, accountSecret: ctx.accountSecret, userId: user.id, source: gate.owner ? "owner" : "free" } };
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

/**
 * 오픈 기념 무료: writes the reading under the account's claim held by planUnlock. A generation that fails (or a client gone
 * while it is written) gives the claim back, as the device's sl_first is only spent after a written reading; a written
 * one keeps it. Without a claim (every other opening) it only writes.
 */
export async function withOpeningClaim<T>(plan: UnlockPlan, generate: () => Promise<T>): Promise<T> {
  const claim = plan.claim;
  if (!claim) return generate();
  let written: T;
  try {
    written = await generate();
  } catch (error) {
    await releaseOpeningClaim(claim);
    throw error;
  }
  await keepOpeningClaim(claim);
  return written;
}

/**
 * Account sync: keeps a 오픈 기념 무료 reading in the account of the session that opened it, as the server wrote it (the
 * chapter is built from the request's own draw and input, never from what a client says), under the chapter's own id
 * (chapterReadingId), so moving its device copy later adds nothing. Best effort: a save that fails leaves the reading
 * on the device, as before the revision, and never fails the reading. Its account id, or null.
 */
export async function keepOpening(plan: UnlockPlan, chapter: ServerChapter, secret: string): Promise<string | null> {
  const keep = plan.keep;
  if (!keep) return null;
  try {
    const opened = await openChapter(chapter.chapterToken, chapter.reading, secret, Date.now());
    if (!opened) return null;
    const id = await chapterReadingId(keep.accountSecret, keep.userId, opened.id);
    const insert = await insertReadingStatement(keep.db, keep.accountSecret, {
      id, userId: keep.userId, productId: plan.productId, source: keep.source, origin: "opening", unlockId: null, chapter: { ...chapter, opening: true }, now: chapter.createdAt,
    });
    const saved = (await insert.run()).meta?.changes === 1 || (await readingExists(keep.db, keep.userId, id));
    return saved ? id : null;
  } catch (error) {
    console.error(JSON.stringify({ evt: "opening.keep_failed", error: error instanceof Error ? error.constructor.name : typeof error }));
    return null;
  }
}
