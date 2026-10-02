import "server-only";
import { z } from "zod";
import { HistorySchema } from "@/lib/ai/history";
import { UNLOCK_METHODS } from "@/lib/pay/unlockMethod";
import { BIRTH_PLACES } from "@/lib/sajuForm";

/** Request bodies. Every string is capped; unknown keys are dropped. */

const WHO = z.enum(["me", "us", "work", "group"]);
const WHEN = z.enum(["today", "week", "month", "year"]);

export const DRAW_TEMPLATES = ["relationship-contact", "relationship", "work", "choice", "self-flow", "group", "deep-tarot", "match"] as const;

export const DrawBody = z.object({
  templateId: z.enum(DRAW_TEMPLATES),
  // The template fixes the exact count (pickCards throws → 400); 10 is the largest spread.
  picks: z.array(z.number().int().min(0).max(77)).min(1).max(10),
});

/** Free text the user typed under a chip (question builder C4): trimmed, at most 30 characters. */
const customText = z.string().trim().max(30).optional();

/** `topicId: "custom"` means the user typed the topic (`topicText`); the spread then follows `whoId`. */
export const CUSTOM_TOPIC_ID = "custom";

export const TarotInputBody = z.object({
  topicId: z.string().trim().min(1).max(40),
  whoId: WHO.optional(),
  whenId: WHEN.optional(),
  question: z.string().max(120).default(""),
  conditions: z.array(z.object({ label: z.string().trim().min(1).max(30), value: z.string().trim().min(1).max(40) })).max(8).default([]),
  note: z.string().max(200).optional(),
  /** a custom 무엇 (replaces the topic chip) */
  topicText: customText,
  /** who exactly (e.g. 엄마, 팀장님); the who chip still picks the spread */
  whoText: customText,
  /** a custom 언제 (replaces the when chip) */
  whenText: customText,
  /** up to three earlier readings from this device (lib/ai/history.ts) */
  history: HistorySchema.optional(),
});

/** How the full reading is opened (P4). Absent means the 오픈 기념 daily free reading. */
export const UnlockBody = z.object({ method: z.enum(UNLOCK_METHODS) });

export const TarotBody = z.object({
  drawToken: z.string().min(1).max(4096),
  input: TarotInputBody,
  unlock: UnlockBody.optional(),
});

/** The saju form as the client holds it (lib/sajuForm.ts `SajuForm`). */
export const BirthBody = z.object({
  calendar: z.enum(["solar", "lunar"]),
  year: z.number().int().min(1800).max(2200),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  isLeapMonth: z.boolean().default(false),
  timeKnown: z.boolean(),
  hour: z.number().int().min(0).max(23).nullable().default(null),
  minute: z.number().int().min(0).max(59).nullable().default(null),
  gender: z.enum(["female", "male"]),
  placeId: z.string().refine((id) => BIRTH_PLACES.some((place) => place.id === id)),
});

export const LOVE_STATUS = {
  single: "솔로", dating: "연애 중", engaged: "결혼 준비 중", married: "기혼", "fresh-start": "새로운 출발", unsure: "잘 모르겠어요",
} as const;
export const WORK_STATUS = {
  student: "학생", employee: "직장인", "self-employed": "자영업·프리랜서", "between-jobs": "구직·쉬는 중", unsure: "잘 모르겠어요",
} as const;

export const SajuBody = z.object({
  birth: BirthBody,
  loveStatus: z.enum(Object.keys(LOVE_STATUS) as [keyof typeof LOVE_STATUS, ...Array<keyof typeof LOVE_STATUS>]).optional(),
  workStatus: z.enum(Object.keys(WORK_STATUS) as [keyof typeof WORK_STATUS, ...Array<keyof typeof WORK_STATUS>]).optional(),
  /** one line about what is on the user's mind */
  concern: z.string().trim().max(60).optional(),
  /** up to three earlier readings from this device (lib/ai/history.ts) */
  history: HistorySchema.optional(),
  unlock: UnlockBody.optional(),
  /**
   * the free teaser's title and summary, kept with a reading saved to the account. The teaser's
   * summary may run to 500 non-space characters (validateSajuTeaser: 250–400 with a 25% band), so
   * with spaces it is capped well above that.
   */
  display: z.object({ title: z.string().trim().max(80), summary: z.string().trim().max(1000) }).optional(),
});

export const FollowUpBody = z.object({
  chapterToken: z.string().min(1).max(32_768),
  /** the reading exactly as returned with the token (checked against the token's digest) */
  reading: z.unknown(),
  question: z.string().trim().min(1).max(200),
  /** the reading's id in the account (P4): the answer is saved there too */
  readingId: z.string().regex(/^[a-z0-9]{20}$/).optional(),
});

export const OwnerBody = z.object({ code: z.string().min(1).max(200) });

export type BirthInput = z.infer<typeof BirthBody>;
export type SajuBodyData = z.infer<typeof SajuBody>;
export type TarotInputData = z.infer<typeof TarotInputBody>;
