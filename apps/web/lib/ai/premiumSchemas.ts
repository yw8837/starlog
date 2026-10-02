import { z } from "zod";

/**
 * Premium reading shapes (P5). The model returns the *draft* parts through structured outputs;
 * code owns positions, card ids and headings and assembles the reading. Lengths and content rules
 * live in validatePremium.ts, so a short paragraph is a regeneration with feedback, not a parse error.
 */

const Body = z.object({ body: z.string() });
const Section = z.object({ heading: z.string(), body: z.string() });
const CardBody = z.object({ position: z.string(), cardId: z.string(), body: z.string() });
const CardSection = CardBody.extend({ heading: z.string() });

// ---- 심층 타로 · 카드 10장 ----

export const DeepTeaserDraftSchema = z.object({ now: Body });

export const DeepPartASchema = z.object({
  verdict: z.string(),
  positions: z.array(CardBody),
});

export const DeepPartBSchema = z.object({
  crossing: Body,
  axes: z.object({ vertical: z.string(), horizontal: z.string() }),
  staff: Body,
  timing: Body,
  action: Body,
  observation: Body,
  followUps: z.array(z.string()),
});

export const DeepTarotReadingSchema = z.object({
  verdict: z.string(),
  positions: z.array(CardSection),
  crossing: Section,
  axes: z.object({ heading: z.string(), vertical: Section, horizontal: Section }),
  staff: Section,
  timing: Section,
  action: Section,
  observation: Section,
  followUps: z.array(z.string()),
});

export type DeepTeaserDraft = z.infer<typeof DeepTeaserDraftSchema>;
export type DeepPartA = z.infer<typeof DeepPartASchema>;
export type DeepPartB = z.infer<typeof DeepPartBSchema>;
export type DeepTarotReading = z.infer<typeof DeepTarotReadingSchema>;

export interface PreviewCard {
  position: string;
  cardId: string;
  orientation: "upright" | "reversed";
  keyword: string;
}

export interface DeepTarotPreview {
  cards: PreviewCard[];
  now: { heading: string; body: string };
  lockedToc: string[];
}
