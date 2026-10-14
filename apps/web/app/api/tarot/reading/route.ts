import { generateTarotReading } from "@/lib/ai/generate";
import { firstFreeCookies, fullReadingLimit, openGate } from "@/lib/api/http";
import { respondGeneration } from "@/lib/api/stream";
import { tarotContextFrom } from "@/lib/api/tarotRequest";
import { checkBot } from "@/lib/api/turnstile";
import { planUnlock, settlementFor } from "@/lib/api/unlock";
import { tarotChapter } from "@/lib/readings/chapters";
import { issueChapter } from "@/lib/security/chapterToken";
import { openTeaserSeal } from "@/lib/security/teaserSeal";

/**
 * POST {drawToken, input, unlock?} → {reading, chapterToken, readingId?}: the full reading for the
 * server-fixed cards.
 * - 오픈 기념 무료 (no `unlock`, until SITE.beta.openingEndsAt): spends the device's free first reading only
 *   after a validated generation; its chapter is marked `opening` (no follow-ups or share). It asks for
 *   a browser check first when Turnstile is on (lib/api/turnstile.ts); the other openings do not.
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
  if (plan.method === "opening") {
    const bot = await checkBot(request, gate);
    if (bot) return bot;
  }

  return respondGeneration(
    request,
    async (hooks) => {
      const reading = (await generateTarotReading(gate.provider, parsed.ctx, hooks, written ?? [])).data;
      const chapterToken = await issueChapter(
        {
          kind: "tarot", templateId: parsed.draw.templateId, input: parsed.input, cards: parsed.draw.cards.map((c) => [c.cardId, c.orientation]),
          ...(plan.method === "opening" ? { opening: true as const } : {}),
        },
        reading, [], gate.secret, gate.now,
      );
      return { body: { reading, chapterToken }, cookies: plan.first !== null ? await firstFreeCookies(gate, plan.first) : [] };
    },
    {
      gate,
      spend: plan.spend,
      paidCost: plan.paidCost,
      settle: settlementFor(plan, (body) => tarotChapter(parsed.input, parsed.draw.cards, body as { reading: unknown; chapterToken: string }, gate.now), gate.now),
    },
  );
}
