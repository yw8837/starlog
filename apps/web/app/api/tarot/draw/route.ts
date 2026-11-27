import { errorResponse, json, readJson } from "@/lib/api/http";
import { DrawBody } from "@/lib/api/inputs";
import { SITE } from "@/lib/config";
import { issueDraw } from "@/lib/security/drawToken";
import { signingSecret } from "@/lib/security/sign";

/**
 * POST {templateId, picks, keep?} → {cards, drawToken}. The server shuffles and fixes the cards; the
 * client only reports which face-down positions were tapped. No generation, no quota. `keep` (이어 읽기, spec 2026-11-26
 * beyond trend §3): /now's card in the first position of a standard three-card spread, the picks dealing the other two;
 * refused while SITE.features.beyond.carry is off.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = signingSecret();
  if (!secret) return errorResponse("AI_UNAVAILABLE");
  const body = DrawBody.safeParse(await readJson(request, 2_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const { templateId, picks, keep } = body.data;
  if (keep && !SITE.features.beyond.carry) return errorResponse("BAD_REQUEST");
  try {
    const { cards, drawToken } = await issueDraw(templateId, picks, secret, Date.now(), keep);
    return json({ cards: cards.map(({ position, cardId, orientation }) => ({ position, cardId, orientation })), drawToken });
  } catch {
    return errorResponse("BAD_REQUEST"); // picks the template cannot take, or a card it cannot keep
  }
}
