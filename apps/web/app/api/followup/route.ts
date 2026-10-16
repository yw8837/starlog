import { TEMPLATES, type DrawnCard } from "@starlog/core";
import { generateSajuFollowUp, generateSajuTopicFollowUp, generateTarotFollowUp } from "@/lib/ai/generate";
import { buildTarotContext } from "@/lib/ai/prompts/tarot";
import { StoredSajuReadingSchema, StoredTarotReadingSchema, type FollowUpAnswer } from "@/lib/ai/schemas";
import { checkQuota, checkServerLimits, crisisResponse, errorResponse, openGate, readJson, spendCookies } from "@/lib/api/http";
import { FollowUpBody } from "@/lib/api/inputs";
import { factsFromBirth, topicFactsFromBirth, withoutConcern } from "@/lib/api/sajuRequest";
import { chapterTurns, recordChapterTurns } from "@/lib/api/spend";
import { respondGeneration } from "@/lib/api/stream";
import { saveFollowUpTurn } from "@/lib/readings/turns";
import { isSajuTopicId } from "@/lib/sajuTopics";
import { OPENING_KEEP_ONLY } from "@/lib/helpGuide";
import { payKeyMode } from "@/lib/pay/mode";
import { preparePremiumFollowUp } from "@/lib/premium/followup";
import { PREMIUM, PREMIUM_CHAPTER_TTL_MS } from "@/lib/premium/products";
import { isOpeningChapter, isPremiumChapter, issueChapter, openChapter } from "@/lib/security/chapterToken";
import { quotaLimits } from "@/lib/security/quota";

/**
 * POST {chapterToken, reading, question} → {kind, answer, chapterToken, remaining}. The reading must
 * be the one the token was issued for (digest check); the returned token carries the new turn.
 * A 오픈 기념 무료 chapter takes none (409 `reason: "opening"`). Capped per chapter
 * (BETA_FOLLOWUPS_PER_CHAPTER, counted server-side too, so an older token of the same chapter does
 * not reset it) and per day; the owner pass skips both caps. Chapter tokens expire 7 days after the reading. Streams NDJSON progress with `Accept: application/x-ndjson`.
 * A premium chapter (P5 spec §6.3) takes PREMIUM[kind].followUps (5) for 30 days: paid for with the
 * reading, so outside the beta's daily cookie quota; the chapter count and the network limits stay,
 * and its cost goes to the paid book when the chapter says it was paid for (signed `paid`; not the owner
 * pass or a test payment, M2), where the free day's budget does not stop it.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const body = FollowUpBody.safeParse(await readJson(request, 64_000));
  if (!body.success) return errorResponse("BAD_REQUEST");
  const chapter = await openChapter(body.data.chapterToken, body.data.reading, gate.secret, gate.now);
  if (!chapter) return errorResponse("BAD_TOKEN", { message: "후속 질문을 이어 갈 수 없는 풀이예요. 풀이를 받은 지 7일이 지났거나 내용이 달라졌어요." });
  // 오픈 기념 무료 is read and kept on the device only (owner 2026-10-14 evening), owner pass or not.
  if (isOpeningChapter(chapter.ctx)) return errorResponse("NOT_AVAILABLE", { reason: "opening", message: OPENING_KEEP_ONLY });

  const limits = quotaLimits();
  const premium = isPremiumChapter(chapter.ctx);
  const cap = isPremiumChapter(chapter.ctx) ? PREMIUM[chapter.ctx.kind].followUps : limits.followupsPerChapter;
  const recorded = await chapterTurns(chapter.id);
  // Without the server's count an older token could reset the chapter cap: no new answer until KV reads again.
  if (recorded === null && !gate.owner) return errorResponse("AI_UNAVAILABLE");
  const answered = Math.max(chapter.turns.length, recorded ?? 0);
  if (!gate.owner && answered >= cap) return errorResponse("BETA_LIMIT", { scope: "chapter", remaining: 0 });
  // Paid for when the reading was: signed in the chapter (a purchase on real keys; not the owner pass or a test
  // payment). A token from before that rule: the same test as a premium reading's (lib/premium/unlock.ts, M2).
  const signedPaid = isPremiumChapter(chapter.ctx) ? chapter.ctx.paid : undefined;
  const paid = premium && (typeof signedPaid === "boolean" ? signedPaid : !(process.env.NODE_ENV === "production" && payKeyMode() === "test"));
  const limited = premium ? await checkServerLimits(gate, "followup", { scope: "day" }, { credit: paid, paid }) : null;
  if (limited) return limited;
  const quota = premium ? null : await checkQuota(gate, "followup", { scope: "day" });
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
    // The facts as of the reading (a premium token lives 30 days from it): a 궁합's 10 years and shared years do not move.
    const prepared = preparePremiumFollowUp(chapter.ctx, body.data.reading, chapter.exp - PREMIUM_CHAPTER_TTL_MS);
    if (prepared instanceof Response) return prepared;
    generate = (hooks) => prepared.generate(gate.provider, chapter.turns, question, hooks);
  }

  // SEC-09: the turn is held before generating, so a follow-up sent meanwhile counts it; any failure
  // before the answer is handed out gives it back. KV has no compare-and-set: requests sent within the
  // same few milliseconds can still both pass. A premium chapter's count lives until its token dies
  // (30 days) and a day more, so its first token can never find the count gone and start over.
  const turnsTtl = premium ? Math.ceil((chapter.exp - gate.now) / 1000) + 86_400 : undefined;
  await recordChapterTurns(chapter.id, answered + 1, turnsTtl);
  return respondGeneration(request, async (hooks) => {
    try {
      const answer = await generate(hooks);
      const turns = [...chapter.turns, { question, answer: answer.answer }];
      const chapterToken = await issueChapter(chapter.ctx, body.data.reading, turns, gate.secret, gate.now, chapter.exp);
      const remaining = Math.max(0, cap - (answered + 1));
      if (body.data.readingId) await saveFollowUpTurn(request, gate.now, body.data.readingId, { question, answer: answer.answer }, chapterToken, remaining);
      return { body: { kind: answer.kind, answer: answer.answer, chapterToken, remaining }, cookies: quota ? await spendCookies(gate, quota, "followup") : [] };
    } catch (error) {
      const held = await chapterTurns(chapter.id);
      if (held !== null && held > answered) await recordChapterTurns(chapter.id, held - 1, turnsTtl);
      throw error;
    }
  }, { gate, spend: "followup", ...(paid ? { paidCost: true } : {}) });
}
