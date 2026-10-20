import "server-only";
import { TEMPLATES, type DrawnCard, type Orientation } from "@starlog/core";
import { generationSetting } from "@/lib/ai/config";
import { mockSajuFollowUp, mockTarotFollowUp } from "@/lib/ai/mock";
import { mockMatchFollowUp } from "@/lib/ai/mockPremium";
import { DeepTarotReadingSchema, LegacyMatchReadingSchema, MatchReadingSchema, NewYearReadingSchema } from "@/lib/ai/premiumSchemas";
import { DEEP_TAROT_SYSTEM, buildDeepContext, deepShared } from "@/lib/ai/prompts/deepTarot";
import { MATCH_SAJU_SYSTEM, buildMatchFacts, matchSajuShared } from "@/lib/ai/prompts/match";
import { NEWYEAR_SYSTEM, buildNewYearFacts, newyearShared } from "@/lib/ai/prompts/newyear";
import { cleanUserText, type FollowUpTurn } from "@/lib/ai/prompts/tarot";
import { FollowUpAnswerSchema, type FollowUpAnswer } from "@/lib/ai/schemas";
import { generateValidated, type GenerationHooks, type ReadingProvider } from "@/lib/ai/provider";
import { validateMatchFollowUp } from "@/lib/ai/validatePremium";
import { validateSajuFollowUp, validateTarotFollowUp } from "@/lib/ai/validate";
import { errorResponse } from "@/lib/api/http";
import { checkSajuForm, todayInKorea } from "@/lib/sajuForm";
import type { ChapterContext } from "@/lib/security/chapterToken";
import { openPartner } from "./partnerSeal";
import { MATCH_FOLLOWUP_DEVICE_ONLY } from "./products";

/**
 * Follow-ups on a premium reading (P5 spec §6.3). The product's shared block (cards, charts, the
 * year's facts: the one its parts were written from, so a question soon after the reading reads it
 * from the cache) and, instead of the whole 5,000–7,000 characters, a digest of the reading: every
 * heading with its first sentence, plus up to two sections the question points at.
 */

interface Sec {
  heading: string;
  body: string;
}

const plain = (text: string) => text.replaceAll("**", "").trim();
const firstSentence = (text: string) => plain(text).split(/(?<=[.?!])\s+/)[0] ?? plain(text);

function sectionsOf(value: unknown, out: Sec[] = []): Sec[] {
  if (Array.isArray(value)) value.forEach((v) => sectionsOf(v, out));
  else if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.heading === "string" && typeof o.body === "string") out.push({ heading: o.heading, body: o.body });
    for (const v of Object.values(o)) if (v && typeof v === "object") sectionsOf(v, out);
  }
  return out;
}

export function readingDigest(reading: unknown, question: string): string {
  const r = (reading ?? {}) as Record<string, unknown>;
  const sections = sectionsOf(reading);
  const lead = typeof r.verdict === "string" ? [`- 한 줄 결론: ${plain(r.verdict)}`] : typeof r.title === "string" ? [`- 제목: ${plain(r.title)}`] : [];
  const month = question.match(/(\d{1,2})\s?월/)?.[1];
  // "관계는" → also "관계": a particle at the end of a word should not hide the section it names
  const words = question
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .flatMap((w) => (w.length >= 3 ? [w, w.slice(0, -1)] : [w]));
  const pointed = sections
    .filter((s) => (month ? s.heading.startsWith(`${Number(month)}월`) : false) || words.some((w) => s.heading.includes(w)))
    .slice(0, 2);
  return [
    "## 소제목과 첫 문장",
    ...lead,
    ...sections.map((s) => `- ${s.heading}: ${firstSentence(s.body)}`),
    ...(pointed.length ? ["## 질문과 가까운 절", ...pointed.map((s) => `### ${s.heading}\n${plain(s.body)}`)] : []),
  ].join("\n");
}

const drawn = (templateId: "deep-tarot", cards: Array<[string, Orientation]>): DrawnCard[] =>
  cards.map(([cardId, orientation], slot) => ({ cardId, orientation, slot, position: TEMPLATES[templateId].positions[slot]! }));

function tail(task: string, reading: unknown, turns: FollowUpTurn[], question: string): string {
  return [
    `<task>${task}</task>`,
    `<reading_digest>\n${readingDigest(reading, question)}\n</reading_digest>`,
    `<previous_turns>\n${turns.length ? turns.map((t, i) => `${i + 1}. 질문: ${cleanUserText(t.question)}\n   답: ${t.answer}`).join("\n") : "(없음)"}\n</previous_turns>`,
    `<followup_question>\n${cleanUserText(question)}\n</followup_question>`,
  ].join("\n");
}

export interface PreparedFollowUp {
  generate(provider: ReadingProvider, turns: FollowUpTurn[], question: string, hooks?: GenerationHooks): Promise<FollowUpAnswer>;
}

const common = { name: "premium-followup" as const, schema: FollowUpAnswerSchema, ...generationSetting("premium-followup") };

/**
 * The follow-up for a premium chapter, or the 400 when its reading or births no longer read (checked before a
 * stream starts). `now`: when the reading was written, so the computed facts are the ones it was written from.
 */
export async function preparePremiumFollowUp(
  ctx: Extract<ChapterContext, { kind: "tarot-deep" | "match" | "newyear-2027" }>, reading: unknown, now: number, secret: string, chapterId: string,
): Promise<PreparedFollowUp | Response> {
  const today = todayInKorea(new Date(now));
  if (ctx.kind === "tarot-deep") {
    if (!DeepTarotReadingSchema.safeParse(reading).success) return errorResponse("BAD_TOKEN");
    const tarot = buildDeepContext(drawn("deep-tarot", ctx.cards), ctx.input);
    return {
      generate: async (provider, turns, question, hooks) =>
        (await generateValidated(provider, {
          ...common, system: DEEP_TAROT_SYSTEM, shared: deepShared(tarot), user: tail("deep-followup", reading, turns, question),
          mock: () => mockTarotFollowUp(tarot, question),
        }, (a) => validateTarotFollowUp(a, tarot, question), hooks)).data,
    };
  }
  if (ctx.kind === "match") {
    // A reading from before the 궁합 became saju only (its five cards, owner test readings) still answers from its own digest.
    if (!MatchReadingSchema.safeParse(reading).success && !LegacyMatchReadingSchema.safeParse(reading).success) return errorResponse("BAD_TOKEN");
    // The partner travels sealed in the device's token only (owner 2026-10-16): a token without it is no follow-up.
    const partnerBirth = await openPartner((ctx.partner as { sealed?: unknown }).sealed, secret, chapterId);
    if (!partnerBirth) return errorResponse("BAD_TOKEN", { message: MATCH_FOLLOWUP_DEVICE_ONLY });
    const me = checkSajuForm(ctx.me.birth, today);
    const partner = checkSajuForm(partnerBirth, today);
    if ("error" in me || "error" in partner) return errorResponse("BAD_TOKEN");
    const facts = buildMatchFacts(me.chart, partner.chart, { relation: ctx.relation, label: ctx.partner.label ?? "", concern: ctx.concern ?? "", meProfile: ctx.me.profile }, now);
    return {
      generate: async (provider, turns, question, hooks) =>
        (await generateValidated(provider, {
          ...common, system: MATCH_SAJU_SYSTEM, shared: matchSajuShared(facts), user: tail("match-followup", reading, turns, question),
          mock: () => mockMatchFollowUp(facts, question),
        }, (a) => validateMatchFollowUp(a, facts, question), hooks)).data,
    };
  }
  if (!NewYearReadingSchema.safeParse(reading).success) return errorResponse("BAD_TOKEN");
  const checked = checkSajuForm(ctx.birth, today);
  if ("error" in checked) return errorResponse("BAD_TOKEN");
  const year = buildNewYearFacts(checked.chart, ctx.profile);
  // the year's 세운 and twelve 월건 are allowed too, as in the reading's own checks
  const facts = { ...year.facts, allowed: year.allowed };
  return {
    generate: async (provider, turns, question, hooks) =>
      (await generateValidated(provider, {
        ...common, system: NEWYEAR_SYSTEM, shared: newyearShared(year), user: tail("newyear-followup", reading, turns, question),
        mock: () => mockSajuFollowUp(year.facts, question),
      }, (a) => validateSajuFollowUp(a, facts, question), hooks)).data,
  };
}
