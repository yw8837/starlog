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

// ---- 우리 사이 궁합 ----

export const MatchTeaserDraftSchema = z.object({ summary: z.string() });

export const MatchPartASchema = z.object({ dayMasters: Body, elements: Body, pillars: Body, luck: Body });

export const MatchPartBSchema = z.object({
  verdict: z.string(),
  cards: z.array(CardBody),
  connection: Body,
  bridge: Body,
  action: Body,
  observation: Body,
  followUps: z.array(z.string()),
});

export const MatchReadingSchema = z.object({
  verdict: z.string(),
  saju: z.object({ dayMasters: Section, elements: Section, pillars: Section, luck: Section }),
  cards: z.array(CardSection),
  connection: Section,
  bridge: Section,
  action: Section,
  observation: Section,
  followUps: z.array(z.string()),
});

export type MatchTeaserDraft = z.infer<typeof MatchTeaserDraftSchema>;
export type MatchPartA = z.infer<typeof MatchPartASchema>;
export type MatchPartB = z.infer<typeof MatchPartBSchema>;
export type MatchReading = z.infer<typeof MatchReadingSchema>;

/** What a chart shows on screen (preview and chapter): no birth date, just the computed pillars. */
export interface ChartView {
  pillars: Array<{ label: string; gz: string; ko: string }>;
  elements: Record<string, number>;
  dayMaster: { display: string; image: string };
}

export interface MatchPreview {
  facts: string[];
  charts: { me: ChartView; partner: ChartView };
  cards: PreviewCard[];
  summary: { heading: string; body: string };
  lockedToc: string[];
}

// ---- 2027 신년운세 ----

export const NewYearTeaserDraftSchema = z.object({ title: z.string(), summary: z.string() });

export const NewYearPartASchema = z.object({
  title: z.string(),
  overview: Body,
  luck: Body,
  areas: z.object({ work: Body, money: Body, relations: Body, health: Body }),
  lucky: Body,
});
export const NewYearPartBSchema = z.object({ firstHalf: z.array(Body) });
export const NewYearPartCSchema = z.object({ secondHalf: z.array(Body), closing: Body, observation: Body, followUps: z.array(z.string()) });

export const NewYearReadingSchema = z.object({
  title: z.string(),
  overview: Section,
  luck: Section,
  areas: z.object({ heading: z.string(), work: Section, money: Section, relations: Section, health: Section }),
  lucky: Section,
  months: z.array(z.object({ month: z.number(), heading: z.string(), body: z.string() })),
  closing: Section,
  observation: Section,
  followUps: z.array(z.string()),
});

export type NewYearTeaserDraft = z.infer<typeof NewYearTeaserDraftSchema>;
export type NewYearPartA = z.infer<typeof NewYearPartASchema>;
export type NewYearPartB = z.infer<typeof NewYearPartBSchema>;
export type NewYearPartC = z.infer<typeof NewYearPartCSchema>;
export type NewYearReading = z.infer<typeof NewYearReadingSchema>;

export interface NewYearPreview {
  title: string;
  facts: string[];
  summary: { heading: string; body: string };
  lockedToc: string[];
}
