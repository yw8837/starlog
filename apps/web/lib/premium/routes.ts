import "server-only";
import { checkQuota, crisisResponse, errorResponse, fullReadingLimit, openGate, readJson, spendCookies } from "@/lib/api/http";
import { respondGeneration } from "@/lib/api/stream";
import { checkBot } from "@/lib/api/turnstile";
import { sessionCookieName } from "@/lib/account/session";
import { issueChapter } from "@/lib/security/chapterToken";
import type { Adapter } from "./adapters";
import { premiumOpen } from "./flags";
import { READING_MAX_BYTES, TEASER_MAX_BYTES } from "./inputs";
import { PREMIUM_CHAPTER_TTL_MS } from "./products";
import { inputHash, sealResume } from "./resume";
import { PART_COUNTS, runNextPart, type PremiumContext } from "./run";
import { holdsUnused, planPremiumUnlock, premiumSettlement } from "./unlock";

/**
 * POST /api/premium/<id>/teaser: the free preview (spec §5, the 시험 사용 of 전자상거래법 17조 2항 5호).
 * Open while the product is on sale for this device, or for a user who already bought it. Counts
 * as a teaser (daily cookie quota and the network counter), like the standard first-card preview,
 * and asks for a browser check first when Turnstile is on (lib/api/turnstile.ts). A buyer's preview
 * spends none of that and passes the free day's budget, like the paid reading it was bought for
 * (review 2026-10-16 #1): only a request with a session cookie asks the account.
 */
export function premiumTeaserRoute<B, C extends PremiumContext>(adapter: Adapter<B, C>) {
  return async function POST(request: Request): Promise<Response> {
    const gate = await openGate(request);
    if (gate instanceof Response) return gate;
    const bot = await checkBot(request, gate);
    if (bot) return bot;
    const parsed = adapter.teaserBody.safeParse(await readJson(request, TEASER_MAX_BYTES));
    if (!parsed.success) return errorResponse("BAD_REQUEST");
    const buyer = gate.cookies[sessionCookieName()] ? await holdsUnused(request, gate.now, adapter.id) : false;
    if (!buyer && !premiumOpen(adapter.id, gate.owner, gate.now)) return errorResponse("NOT_AVAILABLE");
    const crisis = crisisResponse(...adapter.crisisTexts(parsed.data));
    if (crisis) return crisis;
    const ctx = await adapter.context(parsed.data, gate);
    if (ctx instanceof Response) return ctx;
    const quota = buyer ? null : await checkQuota(gate, "teaser");
    if (quota instanceof Response) return quota;
    return respondGeneration(request, async (hooks) => {
      const preview = await adapter.teaser(gate.provider, ctx, hooks);
      return { body: { preview }, cookies: quota ? await spendCookies(gate, quota, "teaser") : [] };
    }, { gate, ...(buyer ? {} : { spend: "teaser" as const }) });
  };
}

/**
 * POST /api/premium/<id>/reading: writes the next part (spec §6.1). A purchase (or the owner pass)
 * is required; the plan reserves or extends the credit before anything is generated, and charges
 * the network counter once per part (2 or 3 per reading) when the purchase earned nothing
 * (unlock.ts, security M2). A non-final part answers {status:"continue", resume, done, of}; the
 * final part saves, spends and answers {status:"done", reading, chapterToken, readingId}. Any
 * failure releases the credit; the client's last resume token still holds the parts written so
 * far. 400 BAD_TOKEN says `token: "draw"` (deal again) or `token: "resume"` (start over); 409
 * NOT_AVAILABLE `reason: "opened"` carries the saved reading's id, `reason: "opening"` its
 * `reservedUntil`. STARLOG_PREMIUM gates ordering only: a reading already paid for always opens.
 */
export function premiumReadingRoute<B, C extends PremiumContext>(adapter: Adapter<B, C>) {
  return async function POST(request: Request): Promise<Response> {
    const gate = await openGate(request);
    if (gate instanceof Response) return gate;
    const limited = await fullReadingLimit(request, gate);
    if (limited) return limited;
    const parsed = adapter.readingBody.safeParse(await readJson(request, READING_MAX_BYTES));
    if (!parsed.success) return errorResponse("BAD_REQUEST");
    const body = parsed.data;
    const crisis = crisisResponse(...adapter.crisisTexts(body));
    if (crisis) return crisis;
    const ctx = await adapter.context(body, gate);
    if (ctx instanceof Response) return ctx;
    // The resume token is bound to everything the reading is written from: the whole body but unlock and resume.
    const { unlock, resume, ...input } = body;
    const hash = await inputHash(adapter.id, input, gate.secret);
    const plan = await planPremiumUnlock(request, gate, adapter.id, unlock.method, { resume, hash });
    if (plan instanceof Response) return plan;
    const written = plan.resume?.parts ?? [];
    const of = PART_COUNTS[adapter.id];

    return respondGeneration(
      request,
      async (hooks) => {
        const step = await runNextPart(gate.provider, ctx, written, hooks);
        if (!step.complete) {
          const next = await sealResume({ product: adapter.id, subject: plan.subject, inputHash: hash, unlockId: plan.unlockId, parts: step.parts }, gate.secret, gate.now);
          return { body: { status: "continue", resume: next, done: step.parts.length, of }, cookies: [] };
        }
        // Who paid is signed into the chapter: its follow-ups are paid for only when the reading was (real keys, not the owner pass).
        const chapterCtx = { ...(await adapter.chapterContext(body, ctx, gate.secret)), paid: plan.paidCost };
        const chapterToken = await issueChapter(chapterCtx, step.reading, [], gate.secret, gate.now, gate.now + PREMIUM_CHAPTER_TTL_MS);
        return { body: { status: "done", reading: step.reading, chapterToken }, cookies: [] };
      },
      {
        gate,
        spend: plan.spend,
        paidCost: plan.paidCost,
        settle: premiumSettlement(plan, (response) => adapter.chapter(body, ctx, response as { reading: unknown; chapterToken: string }, gate.now), gate.now),
      },
    );
  };
}
