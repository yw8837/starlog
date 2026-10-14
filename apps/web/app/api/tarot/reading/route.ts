import { generateTarotReading } from "@/lib/ai/generate";
import { firstFreeCookies, fullReadingLimit, openGate } from "@/lib/api/http";
import { respondGeneration } from "@/lib/api/stream";
import { tarotContextFrom } from "@/lib/api/tarotRequest";
import { planUnlock, settlementFor } from "@/lib/api/unlock";
import { tarotChapter } from "@/lib/readings/chapters";
import { issueChapter } from "@/lib/security/chapterToken";

/**
 * POST {drawToken, input, unlock?} → {reading, chapterToken, readingId?}: the full reading for the
 * server-fixed cards.
 * - 오픈 기념 무료 (no `unlock`, until SITE.beta.openingEndsAt): spends the device's free first reading only
 *   after a validated generation; its chapter is marked `opening` (no follow-ups or share).
 * - paid / the signup gift: reserves the purchase or the gift first, then saves the reading to the
 *   account and spends it before the client sees it. Any failure gives it back (spec 5.4).
 * Streams NDJSON progress with `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const limited = await fullReadingLimit(request, gate);
  if (limited) return limited;
  const parsed = await tarotContextFrom(request, gate);
  if (parsed instanceof Response) return parsed;
  const plan = await planUnlock(request, gate, "tarot", parsed.unlock);
  if (plan instanceof Response) return plan;

  return respondGeneration(
    request,
    async (hooks) => {
      const reading = (await generateTarotReading(gate.provider, parsed.ctx, hooks)).data;
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
