import { errorResponse, json, readJson } from "@/lib/api/http";
import { DrawBody } from "@/lib/api/inputs";
import { issueDraw } from "@/lib/security/drawToken";
import { signingSecret } from "@/lib/security/sign";

/**
 * POST {templateId, picks} → {cards, drawToken}. The server shuffles and fixes the cards; the
 * client only reports which face-down positions were tapped. No generation, no quota.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = signingSecret();
  if (!secret) return errorResponse("AI_UNAVAILABLE");
  const body = DrawBody.safeParse(await readJson(request, 2_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  try {
    const { cards, drawToken } = await issueDraw(body.data.templateId, body.data.picks, secret, Date.now());
    return json({ cards: cards.map(({ position, cardId, orientation }) => ({ position, cardId, orientation })), drawToken });
  } catch {
    return errorResponse("BAD_REQUEST"); // picks the template cannot take
  }
}
