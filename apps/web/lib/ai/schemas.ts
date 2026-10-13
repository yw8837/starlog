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

/**
 * 한눈에 보기 (owner 2026-10-07): one plain sentence per item, shown on top of the reading under code-owned labels
 * (lib/sajuPrologue.ts SAJU_GLANCE_LABELS). Written after the observation, so the model sums up a body it has written.
 */
export const SajuGlanceSchema = z.object({
  /** ✔ 잘 풀리는 쪽 */
  goesWell: z.string(),
  /** ⚠ 조심할 쪽 */
  watchOut: z.string(),
  /** → 이렇게 보완: one everyday action */
  remedy: z.string(),
  /** 올해 흐름: this year's 세운 in one sentence */
  thisYear: z.string(),
  /** → the one thing to do this year */
  thisYearAction: z.string(),
});

export const SajuReadingSchema = z.object({
  sections: z.array(Section),
  observation: Section,
  glance: SajuGlanceSchema,
  followUps: z.array(z.string()),
});

/** 정통 사주's 7절 (이름표 풀이) and 8절 (기운 채우기), written by their own call next to the main one (review 2026-10-08, B). */
export const SajuEnrichmentSchema = z.object({ nameplate: z.string(), gaeun: z.string() });

/**
 * Older saved prologues carry `story` and no `observation`, and none before 2026-10-07 has a `glance` (see StoredTarotReadingSchema).
 * A card that cannot be read is dropped, not the reading: the page leaves it out and the follow-ups go on (review 2026-10-08).
 */
export const StoredSajuReadingSchema = SajuReadingSchema.extend({
  observation: Section.optional(),
  glance: SajuGlanceSchema.optional().catch(undefined),
  story: Story.optional(),
});

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
export type SajuGlance = z.infer<typeof SajuGlanceSchema>;
export type SajuReading = z.infer<typeof SajuReadingSchema>;
export type SajuEnrichment = z.infer<typeof SajuEnrichmentSchema>;
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

/**
 * A stored 오늘의 한 장: the reading of the picked card plus which face-down slot was picked. The
 * other two cards are never stored or shown (owner order). Results from before the 3-card deal have
 * pick null.
 */
export interface DailyResult extends DailyReading {
  pick: number | null;
}
