import "server-only";
import { CUSTOM_TEMPLATE, buildTarotContext, resolveTopic, type TarotContext } from "@/lib/ai/prompts/tarot";
import { openDraw, type OpenedDraw } from "@/lib/security/drawToken";
import { crisisResponse, errorResponse, readJson, type Gate } from "./http";
import { CUSTOM_TOPIC_ID, TarotBody, type TarotInputData } from "./inputs";

/**
 * Body → verified draw → reading context, shared by the teaser and the full reading. A catalog topic
 * must match the draw's template; a custom topic (`topicId: "custom"` + `topicText`) needs the who
 * chip, whose spread the draw must use (me→self-flow, us→relationship, work→work, group→group).
 */
export async function tarotContextFrom(request: Request, gate: Gate): Promise<{ ctx: TarotContext; draw: OpenedDraw; input: Omit<TarotInputData, "history"> } | Response> {
  const body = TarotBody.safeParse(await readJson(request, 8_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const draw = await openDraw(body.data.drawToken, gate.secret, gate.now);
  if (!draw || draw.templateId === "daily") return errorResponse("BAD_TOKEN");
  const input = body.data.input;
  if (input.topicId === CUSTOM_TOPIC_ID) {
    if (!input.topicText || !input.whoId || CUSTOM_TEMPLATE[input.whoId] !== draw.templateId) return errorResponse("BAD_REQUEST");
  } else if (!resolveTopic(draw.templateId, input.topicId, input.whoId)) {
    return errorResponse("BAD_REQUEST");
  }
  const crisis = crisisResponse(input.question, input.note, input.topicText, input.whoText, input.whenText, ...input.conditions.map((c) => c.value));
  if (crisis) return crisis;
  // History shapes this prompt only; the chapter token (follow-ups) keeps the input without it.
  const { history, ...rest } = input;
  return { ctx: buildTarotContext(draw.templateId, draw.cards, rest, { history }), draw, input: rest };
}
