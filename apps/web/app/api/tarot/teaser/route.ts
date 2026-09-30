import { generateTarotTeaser } from "@/lib/ai/generate";
import { checkQuota, openGate, spendCookies } from "@/lib/api/http";
import { respondGeneration } from "@/lib/api/stream";
import { tarotContextFrom } from "@/lib/api/tarotRequest";

/**
 * POST {drawToken, input} → free teaser: every card's keyword, the first card's paragraph and the
 * locked TOC. Never returns paid text. Spends one teaser only after a validated generation.
 * Streams NDJSON progress with `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const parsed = await tarotContextFrom(request, gate);
  if (parsed instanceof Response) return parsed;
  const quota = await checkQuota(gate, "teaser");
  if (quota instanceof Response) return quota;

  return respondGeneration(request, async (hooks) => {
    const teaser = (await generateTarotTeaser(gate.provider, parsed.ctx, hooks)).data;
    return { body: teaser, cookies: await spendCookies(gate, quota, "teaser") };
  }, { gate });
}
