import { generateSajuTeaser } from "@/lib/ai/generate";
import { checkQuota, errorFromGeneration, errorResponse, json, openGate, readJson, spendCookies } from "@/lib/api/http";
import { SajuBody } from "@/lib/api/inputs";
import { factsFromBirth } from "@/lib/api/sajuRequest";

/**
 * POST {birth} → free saju summary {title, summary, lockedToc}, written from the chart the server
 * computes itself. Spends one teaser only after a validated generation.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const body = SajuBody.safeParse(await readJson(request, 2_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const facts = factsFromBirth(body.data.birth, gate.now);
  if (facts instanceof Response) return facts;

  const quota = await checkQuota(gate, "teaser");
  if (quota instanceof Response) return quota;

  let teaser;
  try {
    teaser = (await generateSajuTeaser(gate.provider, facts)).data;
  } catch (error) {
    return errorFromGeneration(error);
  }
  return json(teaser, { cookies: await spendCookies(gate, quota, "teaser") });
}
