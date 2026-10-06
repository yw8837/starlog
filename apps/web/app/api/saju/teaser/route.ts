import { generateSajuTeaser, generateSajuTopicTeaser } from "@/lib/ai/generate";
import { teaserFreshUntil } from "@/lib/ai/prompts/sajuTopics";
import { checkQuota, openGate, spendCookies } from "@/lib/api/http";
import { sajuRequest } from "@/lib/api/sajuRequest";
import { respondGeneration } from "@/lib/api/stream";

/**
 * POST {birth, topic?, loveStatus?, workStatus?, history?} → the free teaser {title, summary, lockedToc,
 * freshUntil} (a topic adds `topic`), written from the chart the server computes itself. One of the day's
 * teasers whatever the topic, spent only after a validated generation (saju-topics spec §9.1). Streams
 * NDJSON progress with `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const parsed = await sajuRequest(request, gate);
  if (parsed instanceof Response) return parsed;
  const quota = await checkQuota(gate, "teaser");
  if (quota instanceof Response) return quota;

  return respondGeneration(request, async (hooks) => {
    const teaser =
      parsed.topic === "overall"
        ? { ...(await generateSajuTeaser(gate.provider, parsed.facts, hooks)).data, freshUntil: teaserFreshUntil(parsed.facts, gate.now) }
        : (await generateSajuTopicTeaser(gate.provider, parsed.facts, hooks)).data;
    return { body: teaser, cookies: await spendCookies(gate, quota, "teaser") };
  }, { gate, spend: "teaser" });
}
