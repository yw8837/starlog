import { generateSajuReading } from "@/lib/ai/generate";
import { errorFromGeneration, errorResponse, json, openGate, readJson, setCookie } from "@/lib/api/http";
import { SajuBody } from "@/lib/api/inputs";
import { factsFromBirth } from "@/lib/api/sajuRequest";
import { issueChapter } from "@/lib/security/chapterToken";
import { QUOTA_COOKIE, QUOTA_COOKIE_MAX_AGE, hasQuota, nextKstMidnight, quotaLimits, readQuota, spendQuota } from "@/lib/security/quota";

/**
 * POST {birth} → {reading, chapterToken}: the paid prologue (the seven SAJU_PROLOGUE_SECTIONS
 * headings, story, follow-up suggestions). Spends one full unlock only after a validated generation.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const body = SajuBody.safeParse(await readJson(request, 2_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const facts = factsFromBirth(body.data.birth, gate.now);
  if (facts instanceof Response) return facts;

  const quota = await readQuota(gate.cookies[QUOTA_COOKIE], gate.secret, gate.now);
  if (!gate.owner && !hasQuota(quota, "full", quotaLimits())) return errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now) });

  let reading;
  try {
    reading = (await generateSajuReading(gate.provider, facts)).data;
  } catch (error) {
    return errorFromGeneration(error);
  }
  const chapterToken = await issueChapter({ kind: "saju", birth: body.data.birth }, reading, [], gate.secret, gate.now);
  const cookies = gate.owner ? [] : [setCookie(QUOTA_COOKIE, await spendQuota(quota, "full", gate.secret), QUOTA_COOKIE_MAX_AGE)];
  return json({ reading, chapterToken }, { cookies });
}
