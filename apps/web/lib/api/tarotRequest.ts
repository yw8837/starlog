import "server-only";
import { buildTarotContext, resolveTopic, type TarotContext } from "@/lib/ai/prompts/tarot";
import { openDraw, type OpenedDraw } from "@/lib/security/drawToken";
import { crisisResponse, errorResponse, readJson, type Gate } from "./http";
import { TarotBody, type TarotInputData } from "./inputs";

/** Body → verified draw → reading context, shared by the teaser and the full reading. */
export async function tarotContextFrom(request: Request, gate: Gate): Promise<{ ctx: TarotContext; draw: OpenedDraw; input: TarotInputData } | Response> {
  const body = TarotBody.safeParse(await readJson(request, 8_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const draw = await openDraw(body.data.drawToken, gate.secret, gate.now);
  if (!draw || draw.templateId === "daily") return errorResponse("BAD_TOKEN");
  const input = body.data.input;
  if (!resolveTopic(draw.templateId, input.topicId, input.whoId)) return errorResponse("BAD_REQUEST");
  const crisis = crisisResponse(input.question, input.note, ...input.conditions.map((c) => c.value));
  if (crisis) return crisis;
  return { ctx: buildTarotContext(draw.templateId, draw.cards, input), draw, input };
}
