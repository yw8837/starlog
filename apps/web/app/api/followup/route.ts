import { TEMPLATES, type DrawnCard } from "@starlog/core";
import { generateSajuFollowUp, generateSajuTopicFollowUp, generateTarotFollowUp } from "@/lib/ai/generate";
import { buildTarotContext } from "@/lib/ai/prompts/tarot";
import { StoredSajuReadingSchema, StoredTarotReadingSchema, type FollowUpAnswer } from "@/lib/ai/schemas";
import { checkQuota, crisisResponse, errorResponse, openGate, readJson, spendCookies } from "@/lib/api/http";
import { FollowUpBody } from "@/lib/api/inputs";
import { factsFromBirth, topicFactsFromBirth, withoutConcern } from "@/lib/api/sajuRequest";
import { chapterTurns, recordChapterTurns } from "@/lib/api/spend";
import { respondGeneration } from "@/lib/api/stream";
import { saveFollowUpTurn } from "@/lib/readings/turns";
import { isSajuTopicId } from "@/lib/sajuTopics";
import { issueChapter, openChapter } from "@/lib/security/chapterToken";
import { quotaLimits } from "@/lib/security/quota";

/**
 * POST {chapterToken, reading, question} → {kind, answer, chapterToken, remaining}. The reading must
 * be the one the token was issued for (digest check); the returned token carries the new turn.
 * Capped per chapter (BETA_FOLLOWUPS_PER_CHAPTER, counted server-side too, so an older token of the
 * same chapter does not reset it) and per day; the owner pass skips both caps. Chapter tokens expire
 * 7 days after the reading. Streams NDJSON progress with `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const body = FollowUpBody.safeParse(await readJson(request, 64_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const chapter = await openChapter(body.data.chapterToken, body.data.reading, gate.secret, gate.now);
  if (!chapter) return errorResponse("BAD_TOKEN", { message: "후속 질문을 이어 갈 수 없는 풀이예요. 풀이를 받은 지 7일이 지났거나 내용이 달라졌어요." });

  const limits = quotaLimits();
  const recorded = await chapterTurns(chapter.id);
  // Without the server's count an older token could reset the chapter cap: no new answer until KV reads again.
  if (recorded === null && !gate.owner) return errorResponse("AI_UNAVAILABLE");
  const answered = Math.max(chapter.turns.length, recorded ?? 0);
  if (!gate.owner && answered >= limits.followupsPerChapter) return errorResponse("BETA_LIMIT", { scope: "chapter", remaining: 0 });
  const quota = await checkQuota(gate, "followup", { scope: "day" });
  if (quota instanceof Response) return quota;
  const question = body.data.question;
  const crisis = crisisResponse(question);
  if (crisis) return crisis;

  // Everything that can fail on input is checked before a stream starts.
  let generate: (hooks: Parameters<typeof generateTarotFollowUp>[5]) => Promise<FollowUpAnswer>;
  if (chapter.ctx.kind === "tarot") {
    const { templateId, input, cards } = chapter.ctx;
    const reading = StoredTarotReadingSchema.safeParse(body.data.reading);
    if (!reading.success) return errorResponse("BAD_TOKEN");
    const drawn: DrawnCard[] = cards.map(([cardId, orientation], slot) => ({ cardId, orientation, slot, position: TEMPLATES[templateId].positions[slot]! }));
    const ctx = buildTarotContext(templateId, drawn, input);
    generate = async (hooks) => (await generateTarotFollowUp(gate.provider, ctx, reading.data, chapter.turns, question, hooks)).data;
  } else if (chapter.ctx.kind === "saju") {
    const reading = StoredSajuReadingSchema.safeParse(body.data.reading);
    if (!reading.success) return errorResponse("BAD_TOKEN");
    const ctx = chapter.ctx;
    if (isSajuTopicId(ctx.topic)) {
      // A topic chapter keeps its topic's facts, prompt and checks, even after the flag is turned off
      // (saju-topics spec §7.7): the reading was already opened.
      const facts = topicFactsFromBirth(ctx.birth, gate.now, ctx.topic);
      if (facts instanceof Response) return errorResponse("BAD_TOKEN");
      generate = async (hooks) => (await generateSajuTopicFollowUp(gate.provider, facts, reading.data, chapter.turns, question, hooks)).data;
    } else {
      // An older chapter's token may still carry the one-line concern: it never reaches a prompt again.
      const facts = factsFromBirth(ctx.birth, gate.now, withoutConcern(ctx.profile));
      if (facts instanceof Response) return errorResponse("BAD_TOKEN");
      generate = async (hooks) => (await generateSajuFollowUp(gate.provider, facts, reading.data, chapter.turns, question, hooks)).data;
    }
  } else {
    // A premium chapter (P5) has no follow-ups here yet.
    return errorResponse("BAD_TOKEN");
  }

  return respondGeneration(request, async (hooks) => {
    const answer = await generate(hooks);
    const turns = [...chapter.turns, { question, answer: answer.answer }];
    const chapterToken = await issueChapter(chapter.ctx, body.data.reading, turns, gate.secret, gate.now, chapter.exp);
    await recordChapterTurns(chapter.id, answered + 1);
    const remaining = Math.max(0, limits.followupsPerChapter - (answered + 1));
    if (body.data.readingId) await saveFollowUpTurn(request, gate.now, body.data.readingId, { question, answer: answer.answer }, chapterToken, remaining);
    return { body: { kind: answer.kind, answer: answer.answer, chapterToken, remaining }, cookies: await spendCookies(gate, quota, "followup") };
  }, { gate, spend: "followup" });
}
