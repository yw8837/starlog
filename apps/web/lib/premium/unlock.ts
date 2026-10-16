import "server-only";
import { openAccount } from "@/lib/account/request";
import { isReviewAccount, isReviewer } from "@/lib/account/review";
import { checkServerLimits, errorResponse, type Gate } from "@/lib/api/http";
import type { SpendKind } from "@/lib/api/spend";
import type { GenerationOutcome, Settlement } from "@/lib/api/stream";
import type { D1Binding } from "@/lib/db/d1";
import { deliverUnlock, entitlements, extendUnlock, releaseUnlock, reserveUnlock } from "@/lib/pay/ledger";
import { payKeyMode } from "@/lib/pay/mode";
import { insertReadingStatement, newReadingId, readingExists, type ServerChapter } from "@/lib/readings/store";
import type { PremiumId } from "./products";
import { openResume, type Resume } from "./resume";
import { partsFit } from "./run";

/**
 * How a premium reading is paid for (P5 spec §7), decided before each part is written, with P4's
 * rules for a full reading (lib/api/unlock.ts):
 * - `paid`: login + one whole lot earmarked for this product, paid with this deploy's Toss keys. A
 *   resumed reading extends its reservation; one that was released (a failed part) or expired
 *   reserves again; one already delivered (a retry after a missed answer) answers 409
 *   `reason: "opened"` with the saved reading's id and never spends again. While another opening
 *   of this product holds the purchase (a lost resume token, another tab), 409 `reason: "opening"`
 *   says until when instead of 402. Its model cost goes to the paid book. On a production deploy
 *   running test keys the purchase earned nothing, so it is held to the free budget and counted like
 *   a free full reading (M2), once per part: 2 or 3 network "full" counts per premium reading.
 * - `owner`: the owner pass and the owner's server limits, no ledger; saved when logged in.
 * A resume token that does not open, or whose parts this deploy cannot continue, is 400 BAD_TOKEN
 * `token: "resume"` before anything is held (the routes say `token: "draw"` for the cards).
 * The signup gift (`free`) and `beta` never open premium: the request schema refuses them, and the
 * ledger keeps the gift for GIFT_PRODUCT. STARLOG_PREMIUM never gates opening a reading already paid.
 */

export interface PremiumPlan {
  product: PremiumId;
  method: "paid" | "owner";
  /** what the resume token is bound to: the user id, or "owner" for an owner pass without login */
  subject: string;
  /** RespondOptions.spend: the network day counter, charged before the part starts (none for a paid opening on real keys) */
  spend: SpendKind | undefined;
  /** RespondOptions.paidCost: a paid opening's model cost goes to the paid book */
  paidCost: boolean;
  unlockId: string | null;
  save: { db: D1Binding; accountSecret: string; userId: string; source: "paid" | "owner" } | null;
  resume: Resume | null;
}

const RESUME_GONE = "이어 쓰던 정보가 만료됐어요. 처음부터 다시 써요.";
const OPENED = "이미 다 적어서 저장한 풀이예요. 내 풀이에서 열어 볼 수 있어요.";
const OPENING = "조금 전에 시작한 풀이가 아직 이 결제로 열리는 중이에요. 몇 분 뒤에 다시 시도해 주세요.";

export async function planPremiumUnlock(
  request: Request, gate: Gate, product: PremiumId, method: "paid" | "owner", token: { resume?: string; hash: string },
): Promise<PremiumPlan | Response> {
  const resumeFor = async (subject: string): Promise<Resume | null | Response> => {
    if (!token.resume) return null;
    const opened = await openResume(token.resume, { product, subject, inputHash: token.hash }, gate.secret, gate.now);
    // A token from a deploy with other parts (or all parts written) cannot continue here either.
    return opened && partsFit(product, opened.parts) ? opened : errorResponse("BAD_TOKEN", { token: "resume", message: RESUME_GONE });
  };

  if (method === "owner") {
    if (!gate.owner) return errorResponse("FORBIDDEN");
    const limited = await checkServerLimits(gate, "full");
    if (limited) return limited;
    const ctx = await openAccount(request, gate.now);
    const user = ctx instanceof Response ? null : (ctx.session?.user ?? null);
    const subject = user ? user.id : "owner";
    const resume = await resumeFor(subject);
    if (resume instanceof Response) return resume;
    const save = user && !(ctx instanceof Response) ? { db: ctx.db, accountSecret: ctx.accountSecret, userId: user.id, source: "owner" as const } : null;
    return { product, method, subject, spend: "full", paidCost: false, unlockId: null, save, resume };
  }

  const ctx = await openAccount(request, gate.now);
  if (ctx instanceof Response) return ctx;
  const user = ctx.session?.user;
  if (!user) return errorResponse("LOGIN_REQUIRED");
  // A review account whose credentials are gone or replaced opens nothing (security M1).
  if (isReviewAccount(user) && !(await isReviewer(user, ctx.accountSecret))) return errorResponse("NOT_AVAILABLE");
  const resume = await resumeFor(user.id);
  if (resume instanceof Response) return resume;
  const unbacked = paymentsUnbacked();
  if (unbacked) {
    const limited = await checkServerLimits(gate, "full", {}, { credit: true });
    if (limited) return limited;
  }

  // SEC-02: the token claims its next part (part_seq compare-and-set): a replay of it in parallel finds
  // the purchase held and waits (409 `reason: "opening"`). After the client left mid-part the purchase
  // was given back (premiumSettlement abandon): the token reserves it again for the part it was writing.
  const written = resume?.parts.length ?? 0;
  let unlockId: string | null = null;
  if (resume?.unlockId) {
    if (await extendUnlock(ctx.db, { unlockId: resume.unlockId, userId: user.id, now: gate.now, parts: written })) unlockId = resume.unlockId;
    else {
      const held = await ctx.db
        .prepare("SELECT status, reading_id, reserved_until FROM unlocks WHERE id = ? AND user_id = ?")
        .bind(resume.unlockId, user.id)
        .first<{ status: string; reading_id: string | null; reserved_until: number | null }>();
      // Delivered already (a retry after a missed answer): the reading is saved, so never reserve and spend again.
      if (held?.status === "delivered") return errorResponse("NOT_AVAILABLE", { reason: "opened", readingId: held.reading_id, message: OPENED });
      // Still held by this token's twin: wait, never take another purchase of the product. A lapsed hold is
      // swept back by the reservation below.
      if (held?.status === "reserved" && (held.reserved_until ?? 0) > gate.now) return errorResponse("NOT_AVAILABLE", { reason: "opening", reservedUntil: held.reserved_until, message: OPENING });
    }
  }
  if (!unlockId) {
    const reserved = await reserveUnlock(ctx.db, { userId: user.id, productId: product, currency: "paid", now: gate.now, payMode: payKeyMode(), earmarked: true, partSeq: written + 1 });
    if (!reserved.ok) {
      // Another opening of this product still holds the purchase (a lost resume token, another tab): wait, never pay again.
      const held = await ctx.db
        .prepare("SELECT MAX(reserved_until) AS until FROM unlocks WHERE user_id = ? AND product_id = ? AND status = 'reserved' AND reserved_until >= ?")
        .bind(user.id, product, gate.now)
        .first<{ until: number | null }>();
      return held?.until ? errorResponse("NOT_AVAILABLE", { reason: "opening", reservedUntil: held.until, message: OPENING }) : errorResponse("NO_CREDIT");
    }
    unlockId = reserved.unlockId;
  }
  console.info(JSON.stringify({ evt: "premium.reserved", product, part: resume?.parts.length ?? 0, reused: unlockId === resume?.unlockId }));
  return {
    product,
    method,
    subject: user.id,
    spend: unbacked ? "full" : undefined,
    paidCost: !unbacked,
    unlockId,
    save: { db: ctx.db, accountSecret: ctx.accountSecret, userId: user.id, source: "paid" },
    resume,
  };
}

/**
 * Before the client sees a result (stream.ts Settlement):
 * - `{status: "continue"}`: nothing is saved; the reservation is extended for the next part. A failed
 *   extension (a D1 error) is logged and the part kept: the reservation lapses and the next part reserves again.
 * - `{status: "done"}`: the chapter is saved and the reservation spent in one batch (P4 deliverUnlock),
 *   the save only while the reservation is still held. Unlike a standard reading (lib/api/unlock.ts),
 *   a reservation lost meanwhile saves nothing and throws: with one resume token in several requests,
 *   a twin may have given it back (failed, cancelled) or spent it (finished first), and a copy saved
 *   or shown then would be a reading whose purchase stays refundable, or a second copy. The client's
 *   token then reopens it or answers 409 `reason: "opened"`. recover() finds a save whose D1 answer was lost.
 * - any failure: the reservation is released (the resume token keeps the parts written so far).
 * - a client that left after the model began answering (SEC-02, `abandon`): released the same way, at
 *   most MAX_RESTORES times per purchase, but the purchase is no longer refundable (lib/pay/ledger.ts
 *   releaseUnlock `left`). The same resume token then reserves again (planPremiumUnlock) and writes
 *   that part right away; a twin of it finds the purchase held (409 `reason: "opening"`).
 */
export function premiumSettlement(plan: PremiumPlan, chapterOf: (body: Record<string, unknown>) => ServerChapter, now: number): Settlement | undefined {
  const save = plan.save;
  if (!save) return undefined;
  const readingId = newReadingId();
  return {
    async deliver(outcome: GenerationOutcome) {
      const body = outcome.body as Record<string, unknown>;
      if (body.status === "continue") {
        if (plan.unlockId) {
          await extendUnlock(save.db, { unlockId: plan.unlockId, userId: save.userId, now: Date.now() }).catch((error: unknown) => {
            console.error(JSON.stringify({ evt: "premium.extend_failed", product: plan.product, error: error instanceof Error ? error.constructor.name : typeof error }));
          });
        }
        return {};
      }
      const insert = await insertReadingStatement(save.db, save.accountSecret, {
        id: readingId, userId: save.userId, productId: plan.product, source: save.source, unlockId: plan.unlockId, chapter: chapterOf(body), now,
        whileReserved: plan.unlockId !== null,
      });
      if (plan.unlockId) {
        const result = await deliverUnlock(save.db, { unlockId: plan.unlockId, readingId, now: Date.now(), before: [insert] });
        console.info(JSON.stringify({ evt: result === "delivered" ? "unlock.delivered" : "unlock.reservation_lost", product: plan.product }));
        if (result === "lost") throw new Error("premium reservation lost");
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
      if (plan.unlockId && (await releaseUnlock(save.db, { unlockId: plan.unlockId, now: Date.now() }))) {
        console.info(JSON.stringify({ evt: "unlock.released", product: plan.product }));
      }
    },
    async abandon() {
      if (plan.unlockId && (await releaseUnlock(save.db, { unlockId: plan.unlockId, now: Date.now(), left: true }))) {
        console.info(JSON.stringify({ evt: "unlock.abandoned", product: plan.product }));
      }
    },
  };
}

/** The same test as lib/api/unlock.ts planUnlock (security M2): on a production deploy's test keys a payment charged nobody. */
export const paymentsUnbacked = (): boolean => process.env.NODE_ENV === "production" && payKeyMode() === "test";

/** The signed-in user's id when they hold an unopened purchase of `product` (previews stay open for them when sales close), else null. */
export async function unusedBuyer(request: Request, now: number, product: PremiumId): Promise<string | null> {
  const ctx = await openAccount(request, now);
  if (ctx instanceof Response || !ctx.session?.user) return null;
  const { id } = ctx.session.user;
  return (await entitlements(ctx.db, id, now)).unused.some((u) => u.productId === product) ? id : null;
}
