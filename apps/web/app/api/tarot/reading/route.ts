import { generateTarotReading } from "@/lib/ai/generate";
import { errorFromGeneration, errorResponse, json, openGate, setCookie } from "@/lib/api/http";
import { tarotContextFrom } from "@/lib/api/tarotRequest";
import { issueChapter } from "@/lib/security/chapterToken";
import { QUOTA_COOKIE, QUOTA_COOKIE_MAX_AGE, hasQuota, nextKstMidnight, quotaLimits, readQuota, spendQuota } from "@/lib/security/quota";

/**
 * POST {drawToken, input} → {reading, chapterToken}: the full reading (gold sample shape) for the
 * server-fixed cards. Spends one full unlock only after a validated generation.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const parsed = await tarotContextFrom(request, gate);
  if (parsed instanceof Response) return parsed;

  const quota = await readQuota(gate.cookies[QUOTA_COOKIE], gate.secret, gate.now);
  if (!gate.owner && !hasQuota(quota, "full", quotaLimits())) return errorResponse("BETA_LIMIT", { resetsAt: nextKstMidnight(gate.now) });

  let reading;
  try {
    reading = (await generateTarotReading(gate.provider, parsed.ctx)).data;
  } catch (error) {
    return errorFromGeneration(error);
  }
  const chapterToken = await issueChapter(
    { kind: "tarot", templateId: parsed.draw.templateId, input: parsed.input, cards: parsed.draw.cards.map((c) => [c.cardId, c.orientation]) },
    reading, [], gate.secret, gate.now,
  );
  const cookies = gate.owner ? [] : [setCookie(QUOTA_COOKIE, await spendQuota(quota, "full", gate.secret), QUOTA_COOKIE_MAX_AGE)];
  return json({ reading, chapterToken }, { cookies });
}
