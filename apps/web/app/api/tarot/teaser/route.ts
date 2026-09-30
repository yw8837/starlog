import { generateTarotTeaser } from "@/lib/ai/generate";
import { errorFromGeneration, errorResponse, json, openGate, setCookie } from "@/lib/api/http";
import { tarotContextFrom } from "@/lib/api/tarotRequest";
import { QUOTA_COOKIE, QUOTA_COOKIE_MAX_AGE, hasQuota, nextKstMidnight, quotaLimits, readQuota, spendQuota } from "@/lib/security/quota";

/**
 * POST {drawToken, input} → free teaser: every card's keyword, the first card's paragraph and the
 * locked TOC. Never returns paid text. Spends one teaser only after a validated generation.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const parsed = await tarotContextFrom(request, gate);
  if (parsed instanceof Response) return parsed;

  const quota = await readQuota(gate.cookies[QUOTA_COOKIE], gate.secret, gate.now);
  if (!gate.owner && !hasQuota(quota, "teaser", quotaLimits())) return errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now) });

  let teaser;
  try {
    teaser = (await generateTarotTeaser(gate.provider, parsed.ctx)).data;
  } catch (error) {
    return errorFromGeneration(error);
  }
  const cookies = gate.owner ? [] : [setCookie(QUOTA_COOKIE, await spendQuota(quota, "teaser", gate.secret), QUOTA_COOKIE_MAX_AGE)];
  return json(teaser, { cookies });
}
