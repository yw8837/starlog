import { generateTarotTeaser } from "@/lib/ai/generate";
import { checkQuota, errorFromGeneration, json, openGate, spendCookies } from "@/lib/api/http";
import { tarotContextFrom } from "@/lib/api/tarotRequest";

/**
 * POST {drawToken, input} → free teaser: every card's keyword, the first card's paragraph and the
 * locked TOC. Never returns paid text. Spends one teaser only after a validated generation.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const parsed = await tarotContextFrom(request, gate);
  if (parsed instanceof Response) return parsed;

  const quota = await checkQuota(gate, "teaser");
  if (quota instanceof Response) return quota;

  let teaser;
  try {
    teaser = (await generateTarotTeaser(gate.provider, parsed.ctx)).data;
  } catch (error) {
    return errorFromGeneration(error);
  }
  return json(teaser, { cookies: await spendCookies(gate, quota, "teaser") });
}
