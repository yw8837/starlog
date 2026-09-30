import "server-only";
import { mockDaily, mockTarotFollowUp, mockTarotReading, mockTarotTeaser } from "./mock";
import {
  TAROT_SYSTEM, cardLabel, dailyPrompt, tarotFollowUpPrompt, tarotHeadings, tarotLockedToc, tarotReadingPrompt, tarotTeaserPrompt,
  type FollowUpTurn, type TarotContext,
} from "./prompts/tarot";
import { generateValidated, type ReadingProvider, type Usage } from "./provider";
import {
  DailyDraftSchema, FollowUpAnswerSchema, TarotReadingSchema, TarotTeaserDraftSchema,
  type DailyDraft, type FollowUpAnswer, type TarotReading, type TarotTeaser,
} from "./schemas";
import { validateDaily, validateTarotFollowUp, validateTarotReading, validateTarotTeaser } from "./validate";

/**
 * One function per reading kind: prompt + schema + validator + mock, then the parts code owns
 * (locked TOC, fixed headings, card identity) are written over the model's output.
 */

export interface Result<T> {
  data: T;
  usage: Usage[];
}

export async function generateTarotTeaser(provider: ReadingProvider, ctx: TarotContext): Promise<Result<TarotTeaser>> {
  const { data, usage } = await generateValidated(provider, {
    name: "tarot-teaser",
    system: TAROT_SYSTEM,
    user: tarotTeaserPrompt(ctx),
    schema: TarotTeaserDraftSchema,
    effort: "low",
    maxTokens: 8000,
    mock: () => mockTarotTeaser(ctx),
  }, (draft) => validateTarotTeaser(draft, ctx));
  return {
    data: {
      cards: ctx.cards.map((card, i) => ({ position: card.position, cardId: card.cardId, keyword: data.cards[i]!.keyword.trim() })),
      firstCard: { heading: cardLabel(ctx.cards[0]!), body: data.firstCard.body.trim() },
      lockedToc: tarotLockedToc(ctx),
    },
    usage,
  };
}

export async function generateTarotReading(provider: ReadingProvider, ctx: TarotContext): Promise<Result<TarotReading>> {
  const { data, usage } = await generateValidated(provider, {
    name: "tarot-reading",
    system: TAROT_SYSTEM,
    user: tarotReadingPrompt(ctx),
    schema: TarotReadingSchema,
    effort: "medium",
    maxTokens: 16000,
    mock: () => mockTarotReading(ctx),
  }, (reading) => validateTarotReading(reading, ctx));
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
    },
    usage,
  };
}

export async function generateDaily(provider: ReadingProvider, ctx: TarotContext): Promise<Result<DailyDraft>> {
  return generateValidated(provider, {
    name: "tarot-daily",
    system: TAROT_SYSTEM,
    user: dailyPrompt(ctx),
    schema: DailyDraftSchema,
    effort: "low",
    maxTokens: 8000,
    mock: () => mockDaily(ctx),
  }, (draft) => validateDaily(draft, ctx));
}

export async function generateTarotFollowUp(
  provider: ReadingProvider, ctx: TarotContext, reading: TarotReading, turns: FollowUpTurn[], question: string,
): Promise<Result<FollowUpAnswer>> {
  return generateValidated(provider, {
    name: "followup",
    system: TAROT_SYSTEM,
    user: tarotFollowUpPrompt(ctx, reading, turns, question),
    schema: FollowUpAnswerSchema,
    effort: "low",
    maxTokens: 8000,
    mock: () => mockTarotFollowUp(ctx),
  }, (answer) => validateTarotFollowUp(answer, ctx));
}
