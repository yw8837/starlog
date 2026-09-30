import { generateTarotReading } from "@/lib/ai/generate";
import { checkQuota, errorFromGeneration, fullReadingLimit, json, openGate, spendCookies } from "@/lib/api/http";
import { tarotContextFrom } from "@/lib/api/tarotRequest";
import { issueChapter } from "@/lib/security/chapterToken";

/**
 * POST {drawToken, input} → {reading, chapterToken}: the full reading (gold sample shape) for the
 * server-fixed cards. Spends one full unlock only after a validated generation.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const limited = await fullReadingLimit(request, gate);
  if (limited) return limited;
  const parsed = await tarotContextFrom(request, gate);
  if (parsed instanceof Response) return parsed;

  const quota = await checkQuota(gate, "full");
  if (quota instanceof Response) return quota;

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
  return json({ reading, chapterToken }, { cookies: await spendCookies(gate, quota, "full") });
}
