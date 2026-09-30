import { generateSajuReading } from "@/lib/ai/generate";
import { checkQuota, errorFromGeneration, errorResponse, fullReadingLimit, json, openGate, readJson, spendCookies } from "@/lib/api/http";
import { SajuBody } from "@/lib/api/inputs";
import { factsFromBirth } from "@/lib/api/sajuRequest";
import { issueChapter } from "@/lib/security/chapterToken";

/**
 * POST {birth} → {reading, chapterToken}: the paid prologue (the seven SAJU_PROLOGUE_SECTIONS
 * headings, story, follow-up suggestions). Spends one full unlock only after a validated generation.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const limited = await fullReadingLimit(request, gate);
  if (limited) return limited;
  const body = SajuBody.safeParse(await readJson(request, 2_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const facts = factsFromBirth(body.data.birth, gate.now);
  if (facts instanceof Response) return facts;

  const quota = await checkQuota(gate, "full");
  if (quota instanceof Response) return quota;

  let reading;
  try {
    reading = (await generateSajuReading(gate.provider, facts)).data;
  } catch (error) {
    return errorFromGeneration(error);
  }
  const chapterToken = await issueChapter({ kind: "saju", birth: body.data.birth }, reading, [], gate.secret, gate.now);
  return json({ reading, chapterToken }, { cookies: await spendCookies(gate, quota, "full") });
}
