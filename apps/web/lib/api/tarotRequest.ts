import "server-only";
import { PREMIUM_TEMPLATES } from "@starlog/core";
import { withoutCrisisItems } from "@/lib/ai/history";
import { CUSTOM_TEMPLATE, buildTarotContext, cleanUserText, resolveTopic, type TarotContext } from "@/lib/ai/prompts/tarot";
import type { UnlockMethod } from "@/lib/pay/unlockMethod";
import { openDraw, type OpenedDraw } from "@/lib/security/drawToken";
import { crisisCheck, errorResponse, isCrisisText, readJson, type Gate } from "./http";
import { CUSTOM_TOPIC_ID, TarotBody, type TarotInputData } from "./inputs";

/**
 * Body → verified draw → reading context, shared by the teaser and the full reading. A catalog topic
 * must match the draw's template; a custom topic (`topicId: "custom"` + `topicText`) needs the who
 * chip, whose spread the draw must use (me→self-flow, us→relationship, work→work, group→group).
 * `topicText` is judged after cleaning (as the prompt will see it): text that cleans to nothing is
 * no topic, and a catalog topic ignores it (the chip path).
 */
export async function tarotContextFrom(
  request: Request, gate: Gate,
): Promise<{ ctx: TarotContext; draw: OpenedDraw; drawToken: string; input: Omit<TarotInputData, "history">; unlock?: UnlockMethod; seal?: string; care: boolean } | Response> {
  // 8,000 bytes for the draw and the input, and room for the teaser's seal (at most 12,000 characters, inputs.ts)
  const body = TarotBody.safeParse(await readJson(request, 20_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const draw = await openDraw(body.data.drawToken, gate.secret, gate.now);
  // The daily card and the premium spreads have their own routes.
  if (!draw || draw.templateId === "daily" || (PREMIUM_TEMPLATES as readonly string[]).includes(draw.templateId)) return errorResponse("BAD_TOKEN");
  const { topicText: rawTopic, ...parsed } = body.data.input;
  const topicText = cleanUserText(rawTopic ?? "");
  const custom = parsed.topicId === CUSTOM_TOPIC_ID;
  if (custom) {
    if (!topicText || !parsed.whoId || CUSTOM_TEMPLATE[parsed.whoId] !== draw.templateId) return errorResponse("BAD_REQUEST");
  } else if (!resolveTopic(draw.templateId, parsed.topicId, parsed.whoId)) {
    return errorResponse("BAD_REQUEST");
  }
  const input: TarotInputData = custom ? { ...parsed, topicText } : parsed;
  const crisis = crisisCheck(
    "tarot", input.question, input.note, input.topicText, input.whoText, input.whenText,
    ...input.conditions.flatMap((c) => [c.label, c.value]),
  );
  if (crisis.refusal) return crisis.refusal;
  // History shapes this prompt only; the chapter token (follow-ups) keeps the input without it.
  const { history, ...rest } = input;
  return {
    ctx: buildTarotContext(draw.templateId, draw.cards, rest, { history: withoutCrisisItems(history, isCrisisText) }),
    draw, drawToken: body.data.drawToken, input: rest, unlock: body.data.unlock?.method, seal: body.data.seal, care: crisis.care,
  };
}
