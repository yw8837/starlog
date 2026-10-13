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

/**
 * How a premium reading is paid for (P5 spec §7), decided before each part is written, with P4's
 * rules for a full reading (lib/api/unlock.ts):
 * - `paid`: login + one whole lot earmarked for this product, paid with this deploy's Toss keys. A
 *   resumed reading extends its reservation; one that was released (a failed part) or expired
 *   reserves again. Its model cost goes to the paid book. On a production deploy running test keys
 *   the purchase earned nothing, so every part is held and counted like a free full reading (M2).
 * - `owner`: the owner pass and the owner's server limits, no ledger; saved when logged in.
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

export async function planPremiumUnlock(
  request: Request, gate: Gate, product: PremiumId, method: "paid" | "owner", token: { resume?: string; hash: string },
): Promise<PremiumPlan | Response> {
  const resumeFor = async (subject: string): Promise<Resume | null | Response> => {
    if (!token.resume) return null;
    const opened = await openResume(token.resume, { product, subject, inputHash: token.hash }, gate.secret, gate.now);
    return opened ?? errorResponse("BAD_TOKEN", { message: RESUME_GONE });
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
  // The same test as lib/api/unlock.ts planUnlock (security M2): a test payment charged nobody.
  const unbacked = process.env.NODE_ENV === "production" && payKeyMode() === "test";
  if (unbacked) {
    const limited = await checkServerLimits(gate, "full");
    if (limited) return limited;
  }

  let unlockId: string | null = null;
  if (resume?.unlockId && (await extendUnlock(ctx.db, { unlockId: resume.unlockId, userId: user.id, now: gate.now }))) unlockId = resume.unlockId;
  if (!unlockId) {
    const reserved = await reserveUnlock(ctx.db, { userId: user.id, productId: product, currency: "paid", now: gate.now, payMode: payKeyMode(), earmarked: true });
    if (!reserved.ok) return errorResponse("NO_CREDIT");
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
 * - `{status: "continue"}`: nothing is saved; the reservation is extended for the next part.
 * - `{status: "done"}`: the chapter is saved and the reservation spent in one batch (P4 deliverUnlock).
 *   As in lib/api/unlock.ts settlementFor, the answer names the reading only when its row is there,
 *   and recover() finds a save whose D1 answer was lost.
 * - any failure: the reservation is released (the resume token keeps the parts written so far).
 */
export function premiumSettlement(plan: PremiumPlan, chapterOf: (body: Record<string, unknown>) => ServerChapter, now: number): Settlement | undefined {
  const save = plan.save;
  if (!save) return undefined;
  const readingId = newReadingId();
  return {
    async deliver(outcome: GenerationOutcome) {
      const body = outcome.body as Record<string, unknown>;
      if (body.status === "continue") {
        if (plan.unlockId) await extendUnlock(save.db, { unlockId: plan.unlockId, userId: save.userId, now: Date.now() });
        return {};
      }
      const insert = await insertReadingStatement(save.db, save.accountSecret, {
        id: readingId, userId: save.userId, productId: plan.product, source: save.source, unlockId: plan.unlockId, chapter: chapterOf(body), now,
      });
      if (plan.unlockId) {
        const result = await deliverUnlock(save.db, { unlockId: plan.unlockId, readingId, now: Date.now(), before: [insert] });
        console.info(JSON.stringify({ evt: result === "delivered" ? "unlock.delivered" : "unlock.reservation_lost", product: plan.product }));
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
      if (plan.unlockId && (await releaseUnlock(save.db, { unlockId: plan.unlockId, now: Date.now() }))) {
        console.info(JSON.stringify({ evt: "unlock.released", product: plan.product }));
      }
    },
  };
}

/** The user holds an unopened purchase of `product` (previews stay open for them when sales close). */
export async function holdsUnused(request: Request, now: number, product: PremiumId): Promise<boolean> {
  const ctx = await openAccount(request, now);
  if (ctx instanceof Response || !ctx.session?.user) return false;
  return (await entitlements(ctx.db, ctx.session.user.id, now)).unused.some((u) => u.productId === product);
}
