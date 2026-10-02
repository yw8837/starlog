import { generateTarotReading } from "@/lib/ai/generate";
import { fullReadingLimit, openGate, spendCookies } from "@/lib/api/http";
import { respondGeneration } from "@/lib/api/stream";
import { tarotContextFrom } from "@/lib/api/tarotRequest";
import { planUnlock, settlementFor } from "@/lib/api/unlock";
import { tarotChapter } from "@/lib/readings/chapters";
import { issueChapter } from "@/lib/security/chapterToken";

/**
 * POST {drawToken, input, unlock?} → {reading, chapterToken, readingId?}: the full reading for the
 * server-fixed cards.
 * - 오픈 기념 (no `unlock`): spends one daily unlock only after a validated generation.
 * - paid / 별조각: reserves credit first, then saves the reading to the account and spends the
 *   credit before the client sees it. Any failure releases the credit (spec 5.4).
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
        { kind: "tarot", templateId: parsed.draw.templateId, input: parsed.input, cards: parsed.draw.cards.map((c) => [c.cardId, c.orientation]) },
        reading, [], gate.secret, gate.now,
      );
      return { body: { reading, chapterToken }, cookies: plan.quota ? await spendCookies(gate, plan.quota, "full") : [] };
    },
    {
      gate,
      spend: plan.spend,
      paidCost: plan.paidCost,
      settle: settlementFor(plan, (body) => tarotChapter(parsed.input, parsed.draw.cards, body as { reading: unknown; chapterToken: string }, gate.now), gate.now),
    },
  );
}
