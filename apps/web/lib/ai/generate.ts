import "server-only";
import type { SajuTopicId } from "@/lib/reading/types";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { TOPIC_OBSERVATION_HEADING, TOPIC_SECTIONS, topicLockedToc } from "@/lib/sajuTopics";
import { mockDaily, mockSajuFollowUp, mockSajuReading, mockSajuTeaser, mockTarotFollowUp, mockTarotReading, mockTarotTeaser } from "./mock";
import { mockSajuTopicFollowUp, mockSajuTopicReading, mockSajuTopicTeaser } from "./mockSajuTopics";
import { SAJU_LOCKED_TOC, SAJU_OBSERVATION_HEADING, SAJU_SYSTEM, sajuFollowUpPrompt, sajuReadingPrompt, sajuTeaserPrompt, type SajuFactSet } from "./prompts/saju";
import { SAJU_TOPIC_SYSTEM, sajuTopicFollowUpPrompt, sajuTopicReadingPrompt, sajuTopicTeaserPrompt } from "./prompts/sajuTopicPrompts";
import type { SajuTopicFactSet } from "./prompts/sajuTopics";
import {
  TAROT_SYSTEM, cardLabel, dailyPrompt, tarotFollowUpPrompt, tarotHeadings, tarotLockedToc, tarotReadingPrompt, tarotTeaserPrompt,
  type FollowUpTurn, type TarotContext,
} from "./prompts/tarot";
import { generationSetting } from "./config";
import { generateValidated, type GenerationHooks, type ReadingProvider, type Usage } from "./provider";
import {
  DailyDraftSchema, FollowUpAnswerSchema, SajuReadingSchema, SajuTeaserDraftSchema, TarotReadingSchema, TarotTeaserDraftSchema,
  type DailyDraft, type FollowUpAnswer, type SajuGlance, type SajuReading, type SajuTeaser, type StoredSajuReading, type StoredTarotReading,
  type TarotReading, type TarotTeaser,
} from "./schemas";
import {
  validateDaily, validateSajuFollowUp, validateSajuReading, validateSajuTeaser, validateTarotFollowUp, validateTarotReading, validateTarotTeaser,
} from "./validate";
import { validateSajuTopicFollowUp, validateSajuTopicReading, validateSajuTopicTeaser } from "./validateSajuTopics";

/**
 * One function per reading kind: prompt + schema + validator + mock, then the parts code owns
 * (locked TOC, fixed headings, card identity) are written over the model's output.
 */

export interface Result<T> {
  data: T;
  usage: Usage[];
}

export async function generateTarotTeaser(provider: ReadingProvider, ctx: TarotContext, hooks?: GenerationHooks): Promise<Result<TarotTeaser>> {
  const { data, usage } = await generateValidated(provider, {
    name: "tarot-teaser",
    system: TAROT_SYSTEM,
    user: tarotTeaserPrompt(ctx),
    schema: TarotTeaserDraftSchema,
    ...generationSetting("tarot-teaser"),
    mock: () => mockTarotTeaser(ctx),
  }, (draft) => validateTarotTeaser(draft, ctx), hooks);
  return {
    data: {
      cards: ctx.cards.map((card, i) => ({ position: card.position, cardId: card.cardId, keyword: data.cards[i]!.keyword.trim() })),
      firstCard: { heading: cardLabel(ctx.cards[0]!), body: data.firstCard.body.trim() },
      lockedToc: tarotLockedToc(ctx),
    },
    usage,
  };
}

export async function generateTarotReading(provider: ReadingProvider, ctx: TarotContext, hooks?: GenerationHooks): Promise<Result<TarotReading>> {
  const { data, usage } = await generateValidated(provider, {
    name: "tarot-reading",
    system: TAROT_SYSTEM,
    user: tarotReadingPrompt(ctx),
    schema: TarotReadingSchema,
    ...generationSetting("tarot-reading"),
    mock: () => mockTarotReading(ctx),
  }, (reading) => validateTarotReading(reading, ctx), hooks);
  const h = tarotHeadings(ctx);
  return {
    data: {
      ...data,
      cards: data.cards.map((section, i) => ({ ...section, position: ctx.cards[i]!.position, cardId: ctx.cards[i]!.cardId })),
      connection: { ...data.connection, heading: h.connection },
      timing: { ...data.timing, heading: h.timing },
      scenarios: { ...data.scenarios, heading: h.scenarios },
      messages: { ...data.messages, heading: h.messages },
      avoid: { ...data.avoid, heading: h.avoid },
      alternatives: { ...data.alternatives, heading: h.alternatives },
      action: { ...data.action, heading: h.action },
      observation: { ...data.observation, heading: h.observation },
    },
    usage,
  };
}

export async function generateDaily(provider: ReadingProvider, ctx: TarotContext, hooks?: GenerationHooks): Promise<Result<DailyDraft>> {
  return generateValidated(provider, {
    name: "tarot-daily",
    system: TAROT_SYSTEM,
    user: dailyPrompt(ctx),
    schema: DailyDraftSchema,
    ...generationSetting("tarot-daily"),
    mock: () => mockDaily(ctx),
  }, (draft) => validateDaily(draft, ctx), hooks);
}

export async function generateTarotFollowUp(
  provider: ReadingProvider, ctx: TarotContext, reading: StoredTarotReading, turns: FollowUpTurn[], question: string, hooks?: GenerationHooks,
): Promise<Result<FollowUpAnswer>> {
  return generateValidated(provider, {
    name: "followup",
    system: TAROT_SYSTEM,
    user: tarotFollowUpPrompt(ctx, reading, turns, question),
    schema: FollowUpAnswerSchema,
    ...generationSetting("followup"),
    mock: () => mockTarotFollowUp(ctx, question),
  }, (answer) => validateTarotFollowUp(answer, ctx, question), hooks);
}

// ---- saju ----

export async function generateSajuTeaser(provider: ReadingProvider, facts: SajuFactSet, hooks?: GenerationHooks): Promise<Result<SajuTeaser>> {
  const { data, usage } = await generateValidated(provider, {
    name: "saju-teaser",
    system: SAJU_SYSTEM,
    user: sajuTeaserPrompt(facts),
    schema: SajuTeaserDraftSchema,
    ...generationSetting("saju-teaser"),
    mock: () => mockSajuTeaser(facts),
  }, (draft) => validateSajuTeaser(draft, facts), hooks);
  return { data: { title: data.title.trim(), summary: data.summary.trim(), lockedToc: [...SAJU_LOCKED_TOC] }, usage };
}

export async function generateSajuReading(provider: ReadingProvider, facts: SajuFactSet, hooks?: GenerationHooks): Promise<Result<SajuReading>> {
  const { data, usage } = await generateValidated(provider, {
    name: "saju-reading",
    system: SAJU_SYSTEM,
    user: sajuReadingPrompt(facts),
    schema: SajuReadingSchema,
    ...generationSetting("saju-reading"),
    mock: () => mockSajuReading(facts),
  }, (reading) => validateSajuReading(reading, facts), hooks);
  // Headings are code-owned so the locked TOC stays 1:1 with the paid sections.
  return {
    data: {
      ...data,
      sections: data.sections.map((section, i) => ({ heading: SAJU_PROLOGUE_SECTIONS[i]!, body: section.body.trim() })),
      observation: { heading: SAJU_OBSERVATION_HEADING, body: data.observation.body.trim() },
      glance: trimGlance(data.glance),
    },
    usage,
  };
}

/** The 한눈에 보기 sentences as written, without stray whitespace (the card's labels are code-owned on screen). */
const trimGlance = (g: SajuGlance): SajuGlance => ({
  goesWell: g.goesWell.trim(), watchOut: g.watchOut.trim(), remedy: g.remedy.trim(), thisYear: g.thisYear.trim(), thisYearAction: g.thisYearAction.trim(),
});

export async function generateSajuFollowUp(
  provider: ReadingProvider, facts: SajuFactSet, reading: StoredSajuReading, turns: FollowUpTurn[], question: string, hooks?: GenerationHooks,
): Promise<Result<FollowUpAnswer>> {
  return generateValidated(provider, {
    name: "followup",
    system: SAJU_SYSTEM,
    user: sajuFollowUpPrompt(facts, reading, turns, question),
    schema: FollowUpAnswerSchema,
    ...generationSetting("followup"),
    mock: () => mockSajuFollowUp(facts, question),
  }, (answer) => validateSajuFollowUp(answer, facts, question), hooks);
}

// ---- 주제별 사주 (saju-topics spec §7.6) ----

/** A topic teaser as the API returns it: the model's title and summary, then what code owns (spec §6.5). */
export interface SajuTopicTeaser extends SajuTeaser {
  topic: SajuTopicId;
  freshUntil: string;
}

export async function generateSajuTopicTeaser(provider: ReadingProvider, facts: SajuTopicFactSet, hooks?: GenerationHooks): Promise<Result<SajuTopicTeaser>> {
  const { data, usage } = await generateValidated(provider, {
    name: "saju-topic-teaser",
    system: SAJU_TOPIC_SYSTEM,
    user: sajuTopicTeaserPrompt(facts),
    schema: SajuTeaserDraftSchema,
    ...generationSetting("saju-topic-teaser"),
    mock: () => mockSajuTopicTeaser(facts),
  }, (draft) => validateSajuTopicTeaser(draft, facts), hooks);
  return {
    data: { title: data.title.trim(), summary: data.summary.trim(), lockedToc: topicLockedToc(facts.topic), topic: facts.topic, freshUntil: facts.freshUntil },
    usage,
  };
}

export async function generateSajuTopicReading(provider: ReadingProvider, facts: SajuTopicFactSet, hooks?: GenerationHooks): Promise<Result<SajuReading>> {
  const { data, usage } = await generateValidated(provider, {
    name: "saju-topic-reading",
    system: SAJU_TOPIC_SYSTEM,
    user: sajuTopicReadingPrompt(facts),
    schema: SajuReadingSchema,
    ...generationSetting("saju-topic-reading"),
    mock: () => mockSajuTopicReading(facts),
  }, (reading) => validateSajuTopicReading(reading, facts), hooks);
  // Headings are code-owned so the locked list stays 1:1 with the paid sections.
  const headings = TOPIC_SECTIONS[facts.topic];
  return {
    data: {
      ...data,
      sections: data.sections.map((section, i) => ({ heading: headings[i] ?? section.heading, body: section.body.trim() })),
      observation: { heading: TOPIC_OBSERVATION_HEADING, body: data.observation.body.trim() },
      glance: trimGlance(data.glance),
    },
    usage,
  };
}

export async function generateSajuTopicFollowUp(
  provider: ReadingProvider, facts: SajuTopicFactSet, reading: StoredSajuReading, turns: FollowUpTurn[], question: string, hooks?: GenerationHooks,
): Promise<Result<FollowUpAnswer>> {
  return generateValidated(provider, {
    name: "followup",
    system: SAJU_TOPIC_SYSTEM,
    user: sajuTopicFollowUpPrompt(facts, reading, turns, question),
    schema: FollowUpAnswerSchema,
    ...generationSetting("followup"),
    mock: () => mockSajuTopicFollowUp(facts, question),
  }, (answer) => validateSajuTopicFollowUp(answer, facts, question), hooks);
}
