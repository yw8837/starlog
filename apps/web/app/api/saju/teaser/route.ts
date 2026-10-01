import { generateSajuTeaser } from "@/lib/ai/generate";
import { checkQuota, openGate, spendCookies } from "@/lib/api/http";
import { sajuRequest } from "@/lib/api/sajuRequest";
import { respondGeneration } from "@/lib/api/stream";

/**
 * POST {birth, loveStatus?, workStatus?, concern?} → free saju summary {title, summary, lockedToc},
 * written from the chart the server computes itself. Spends one teaser only after a validated
 * generation. Streams NDJSON progress with `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const parsed = await sajuRequest(request, gate.now);
  if (parsed instanceof Response) return parsed;
  const quota = await checkQuota(gate, "teaser");
  if (quota instanceof Response) return quota;

  return respondGeneration(request, async (hooks) => {
    const teaser = (await generateSajuTeaser(gate.provider, parsed.facts, hooks)).data;
    return { body: teaser, cookies: await spendCookies(gate, quota, "teaser") };
  }, { gate, spend: "teaser" });
}
