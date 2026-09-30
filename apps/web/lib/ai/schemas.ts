import { z } from "zod";

/**
 * Reading shapes. They follow the gold samples (content/samples/*.json) without the retired `story`
 * block and with the `observation` (one thing to notice in the coming days or weeks); the model returns the
 * "draft" shapes through structured outputs and code adds what it owns (locked TOC, fixed headings,
 * card identity). Lengths, counts and content rules are checked in validate.ts, not here, so a
 * too-long paragraph becomes a regeneration with feedback instead of a parse failure.
 */

const Section = z.object({ heading: z.string(), body: z.string() });
const Story = z.object({ title: z.string(), body: z.string() });

// ---- tarot ----

export const TarotTeaserDraftSchema = z.object({
  cards: z.array(z.object({ position: z.string(), cardId: z.string(), keyword: z.string() })),
  firstCard: Section,
});

export const TarotTeaserSchema = TarotTeaserDraftSchema.extend({ lockedToc: z.array(z.string()) });

export const TarotReadingSchema = z.object({
  verdict: z.string(),
  cards: z.array(z.object({ position: z.string(), cardId: z.string(), heading: z.string(), body: z.string() })),
  connection: Section,
  timing: Section,
  scenarios: z.object({ heading: z.string(), items: z.array(z.object({ label: z.string(), body: z.string() })) }),
  messages: z.object({ heading: z.string(), items: z.array(z.string()), hint: z.string() }),
  avoid: z.object({ heading: z.string(), items: z.array(z.string()) }),
  alternatives: Section,
  action: Section,
  /** 며칠 안에 확인해 볼 신호: a concrete, low-stakes thing to notice (the UI can check in on it later) */
  observation: Section,
  followUps: z.array(z.string()),
});

/**
 * A reading as a device may hand it back (follow-ups): older saved readings carry `story` and no
 * `observation`, so both are optional here. New readings are written with TarotReadingSchema.
 */
export const StoredTarotReadingSchema = TarotReadingSchema.extend({ observation: Section.optional(), story: Story.optional() });

export const DailyDraftSchema = z.object({
  keyword: z.string(),
  /** fortune-cookie line */
  summary: z.string(),
  body: z.string(),
  areas: z.object({ love: z.string(), money: z.string(), work: z.string() }),
  color: z.string(),
  tip: z.string(),
});

// ---- saju ----

export const SajuTeaserDraftSchema = z.object({ title: z.string(), summary: z.string() });

export const SajuTeaserSchema = SajuTeaserDraftSchema.extend({ lockedToc: z.array(z.string()) });

export const SajuReadingSchema = z.object({
  sections: z.array(Section),
  observation: Section,
  followUps: z.array(z.string()),
});

/** Older saved prologues carry `story` and no `observation` (see StoredTarotReadingSchema). */
export const StoredSajuReadingSchema = SajuReadingSchema.extend({ observation: Section.optional(), story: Story.optional() });

// ---- follow-up ----

export const FOLLOW_UP_KINDS = ["clarify", "scenario", "new_fact", "pushback", "new_question", "out_of_scope"] as const;

export const FollowUpAnswerSchema = z.object({ kind: z.enum(FOLLOW_UP_KINDS), answer: z.string() });

export type TarotTeaserDraft = z.infer<typeof TarotTeaserDraftSchema>;
export type TarotTeaser = z.infer<typeof TarotTeaserSchema>;
export type TarotReading = z.infer<typeof TarotReadingSchema>;
export type StoredTarotReading = z.infer<typeof StoredTarotReadingSchema>;
export type DailyDraft = z.infer<typeof DailyDraftSchema>;
export type SajuTeaserDraft = z.infer<typeof SajuTeaserDraftSchema>;
export type SajuTeaser = z.infer<typeof SajuTeaserSchema>;
export type SajuReading = z.infer<typeof SajuReadingSchema>;
export type StoredSajuReading = z.infer<typeof StoredSajuReadingSchema>;
export type FollowUpAnswer = z.infer<typeof FollowUpAnswerSchema>;

export interface DailyReading {
  card: { cardId: string; orientation: "upright" | "reversed"; keyword: string };
  summary: string;
  body: string;
  areas: { love: string; money: string; work: string };
  lucky: { color: string; number: number };
  tip: string;
}
