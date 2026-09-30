import { TEMPLATES, type DrawnCard } from "@starlog/core";
import { generateSajuFollowUp, generateTarotFollowUp } from "@/lib/ai/generate";
import { buildTarotContext } from "@/lib/ai/prompts/tarot";
import { SajuReadingSchema, TarotReadingSchema, type FollowUpAnswer } from "@/lib/ai/schemas";
import { crisisResponse, errorFromGeneration, errorResponse, json, openGate, readJson, setCookie } from "@/lib/api/http";
import { FollowUpBody } from "@/lib/api/inputs";
import { factsFromBirth } from "@/lib/api/sajuRequest";
import { issueChapter, openChapter } from "@/lib/security/chapterToken";
import { QUOTA_COOKIE, QUOTA_COOKIE_MAX_AGE, hasQuota, nextKstMidnight, quotaLimits, readQuota, spendQuota } from "@/lib/security/quota";

/**
 * POST {chapterToken, reading, question} → {kind, answer, chapterToken, remaining}. The reading must
 * be the one the token was issued for (digest check); the returned token carries the new turn.
 * Capped per chapter (BETA_FOLLOWUPS_PER_CHAPTER) and per day; the owner pass skips both caps.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const body = FollowUpBody.safeParse(await readJson(request, 64_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const chapter = await openChapter(body.data.chapterToken, body.data.reading, gate.secret, gate.now);
  if (!chapter) return errorResponse("BAD_TOKEN", { message: "풀이 정보가 맞지 않아요. 풀이를 다시 열어 주세요." });

  const limits = quotaLimits();
  if (!gate.owner && chapter.turns.length >= limits.followupsPerChapter) return errorResponse("BETA_LIMIT", { scope: "chapter", remaining: 0 });
  const quota = await readQuota(gate.cookies[QUOTA_COOKIE], gate.secret, gate.now);
  if (!gate.owner && !hasQuota(quota, "followup", limits)) return errorResponse("BETA_LIMIT", { scope: "day", resetsAt: nextKstMidnight(gate.now) });
  const question = body.data.question;
  const crisis = crisisResponse(question);
  if (crisis) return crisis;

  let answer: FollowUpAnswer;
  try {
    if (chapter.ctx.kind === "tarot") {
      const { templateId, input, cards } = chapter.ctx;
      const reading = TarotReadingSchema.safeParse(body.data.reading);
      if (!reading.success) return errorResponse("BAD_TOKEN");
      const drawn: DrawnCard[] = cards.map(([cardId, orientation], slot) => ({ cardId, orientation, slot, position: TEMPLATES[templateId].positions[slot]! }));
      const ctx = buildTarotContext(templateId, drawn, input);
      answer = (await generateTarotFollowUp(gate.provider, ctx, reading.data, chapter.turns, question)).data;
    } else {
      const reading = SajuReadingSchema.safeParse(body.data.reading);
      if (!reading.success) return errorResponse("BAD_TOKEN");
      const facts = factsFromBirth(chapter.ctx.birth, gate.now);
      if (facts instanceof Response) return errorResponse("BAD_TOKEN");
      answer = (await generateSajuFollowUp(gate.provider, facts, reading.data, chapter.turns, question)).data;
    }
  } catch (error) {
    return errorFromGeneration(error);
  }

  const turns = [...chapter.turns, { question, answer: answer.answer }];
  const chapterToken = await issueChapter(chapter.ctx, body.data.reading, turns, gate.secret, gate.now);
  const cookies = gate.owner ? [] : [setCookie(QUOTA_COOKIE, await spendQuota(quota, "followup", gate.secret), QUOTA_COOKIE_MAX_AGE)];
  const remaining = Math.max(0, limits.followupsPerChapter - turns.length);
  return json({ kind: answer.kind, answer: answer.answer, chapterToken, remaining }, { cookies });
}
