import { generateSajuReading } from "@/lib/ai/generate";
import { checkQuota, fullReadingLimit, openGate, spendCookies } from "@/lib/api/http";
import { sajuRequest } from "@/lib/api/sajuRequest";
import { respondGeneration } from "@/lib/api/stream";
import { issueChapter } from "@/lib/security/chapterToken";

/**
 * POST {birth, loveStatus?, workStatus?, concern?} → {reading, chapterToken}: the paid prologue (the
 * seven SAJU_PROLOGUE_SECTIONS headings, the observation, story, follow-up suggestions). Spends one
 * full unlock only after a validated generation. Streams NDJSON progress with
 * `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const limited = await fullReadingLimit(request, gate);
  if (limited) return limited;
  const parsed = await sajuRequest(request, gate.now);
  if (parsed instanceof Response) return parsed;
  const quota = await checkQuota(gate, "full");
  if (quota instanceof Response) return quota;

  return respondGeneration(request, async (hooks) => {
    const reading = (await generateSajuReading(gate.provider, parsed.facts, hooks)).data;
    const chapterToken = await issueChapter({ kind: "saju", birth: parsed.body.birth, profile: parsed.profile }, reading, [], gate.secret, gate.now);
    return { body: { reading, chapterToken }, cookies: await spendCookies(gate, quota, "full") };
  }, { gate });
}
