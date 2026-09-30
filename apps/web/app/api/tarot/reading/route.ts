import { generateTarotReading } from "@/lib/ai/generate";
import { checkQuota, fullReadingLimit, openGate, spendCookies } from "@/lib/api/http";
import { respondGeneration } from "@/lib/api/stream";
import { tarotContextFrom } from "@/lib/api/tarotRequest";
import { issueChapter } from "@/lib/security/chapterToken";

/**
 * POST {drawToken, input} → {reading, chapterToken}: the full reading (gold sample shape) for the
 * server-fixed cards. Spends one full unlock only after a validated generation. Streams NDJSON
 * progress with `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const limited = await fullReadingLimit(request, gate);
  if (limited) return limited;
  const parsed = await tarotContextFrom(request, gate);
  if (parsed instanceof Response) return parsed;
  const quota = await checkQuota(gate, "full");
  if (quota instanceof Response) return quota;

  return respondGeneration(request, async (hooks) => {
    const reading = (await generateTarotReading(gate.provider, parsed.ctx, hooks)).data;
    const chapterToken = await issueChapter(
      { kind: "tarot", templateId: parsed.draw.templateId, input: parsed.input, cards: parsed.draw.cards.map((c) => [c.cardId, c.orientation]) },
      reading, [], gate.secret, gate.now,
    );
    return { body: { reading, chapterToken }, cookies: await spendCookies(gate, quota, "full"), spend: "full" };
  }, { gate });
}
