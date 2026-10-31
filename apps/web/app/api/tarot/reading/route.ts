import { generateTarotReading } from "@/lib/ai/generate";
import { firstFreeCookies, fullReadingLimit, openGate } from "@/lib/api/http";
import { respondGeneration } from "@/lib/api/stream";
import { tarotContextFrom } from "@/lib/api/tarotRequest";
import { keepOpening, planUnlock, settlementFor, withOpeningClaim } from "@/lib/api/unlock";
import { tarotChapter } from "@/lib/readings/chapters";
import { issueChapter } from "@/lib/security/chapterToken";
import { openTeaserSeal } from "@/lib/security/teaserSeal";

/**
 * POST {drawToken, input, unlock?} → {reading, chapterToken, readingId?}: the full reading for the
 * server-fixed cards.
 * - 오픈 기념 무료 (no `unlock`, until SITE.beta.openingEndsAt): logged in only, once per account and per device (owner
 *   2026-10-27): the account's claim is held before the generation and kept once it is written (given back on a failure),
 *   and the device's free first reading is spent only after a validated generation; its chapter is marked `opening` (no
 *   follow-ups; shared since owner 2026-10-23). From SYNC_REVISION_DATE (account sync) it is kept in the account too and
 *   answers its `readingId`. It asks for a browser check first when Turnstile is on (lib/api/turnstile.ts, in planUnlock);
 *   the other openings do not.
 * - paid / the signup gift: reserves the purchase or the gift first, then saves the reading to the
 *   account and spends it before the client sees it. Any failure gives it back (spec 5.4).
 * - `seal` (감질맛): the teaser's two cards, for this draw and input only; the reading keeps them and reads on from the cut.
 *   A seal that does not open is ignored: the reading is written as before.
 * Streams NDJSON progress with `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const limited = await fullReadingLimit(request, gate);
  if (limited) return limited;
  const parsed = await tarotContextFrom(request, gate);
  if (parsed instanceof Response) return parsed;
  const written = await openTeaserSeal(parsed.seal, { drawToken: parsed.drawToken, input: parsed.input }, gate.secret, gate.now);
  const plan = await planUnlock(request, gate, "tarot", parsed.unlock);
  if (plan instanceof Response) return plan;

  return respondGeneration(
    request,
    async (hooks) => {
      const reading = await withOpeningClaim(plan, async () => (await generateTarotReading(gate.provider, parsed.ctx, hooks, written ?? [])).data);
      const chapterToken = await issueChapter(
        {
          kind: "tarot", templateId: parsed.draw.templateId, input: parsed.input, cards: parsed.draw.cards.map((c) => [c.cardId, c.orientation]),
          ...(plan.method === "opening" ? { opening: true as const } : {}),
          // Its follow-ups are paid for only when the reading was (real keys; not the gift, the owner pass or test keys).
          ...(plan.paidCost ? { paid: true as const } : {}),
        },
        reading, [], gate.secret, gate.now,
      );
      // Account sync: a 오픈 기념 무료 reading opened while logged in goes to the account too (lib/api/unlock.ts keepOpening).
      const readingId = await keepOpening(plan, tarotChapter(parsed.input, parsed.draw.cards, { reading, chapterToken }, gate.now), gate.secret);
      return { body: { reading, chapterToken, ...(readingId ? { readingId } : {}) }, cookies: plan.first !== null ? await firstFreeCookies(gate, plan.first) : [] };
    },
    {
      gate,
      spend: plan.spend,
      paidCost: plan.paidCost,
      care: parsed.care,
      settle: settlementFor(plan, (body) => tarotChapter(parsed.input, parsed.draw.cards, body as { reading: unknown; chapterToken: string }, gate.now), gate.now),
    },
  );
}
