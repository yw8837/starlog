import "server-only";
import { z } from "zod";
import { BIRTH_PLACES } from "@/lib/sajuForm";

/** Request bodies. Every string is capped; unknown keys are dropped. */

const WHO = z.enum(["me", "us", "work", "group"]);
const WHEN = z.enum(["today", "week", "month", "year"]);

export const DRAW_TEMPLATES = ["relationship-contact", "relationship", "work", "choice", "self-flow", "group"] as const;

export const DrawBody = z.object({
  templateId: z.enum(DRAW_TEMPLATES),
  picks: z.array(z.number().int().min(0).max(77)).min(1).max(3),
});

export const TarotInputBody = z.object({
  topicId: z.string().trim().min(1).max(40),
  whoId: WHO.optional(),
  whenId: WHEN.optional(),
  question: z.string().max(120).default(""),
  conditions: z.array(z.object({ label: z.string().trim().min(1).max(30), value: z.string().trim().min(1).max(40) })).max(8).default([]),
  note: z.string().max(200).optional(),
});

export const TarotBody = z.object({
  drawToken: z.string().min(1).max(4096),
  input: TarotInputBody,
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

export const SajuBody = z.object({ birth: BirthBody });

export const FollowUpBody = z.object({
  chapterToken: z.string().min(1).max(32_768),
  /** the reading exactly as returned with the token (checked against the token's digest) */
  reading: z.unknown(),
  question: z.string().trim().min(1).max(200),
});

export const OwnerBody = z.object({ code: z.string().min(1).max(200) });

export type BirthInput = z.infer<typeof BirthBody>;
export type TarotInputData = z.infer<typeof TarotInputBody>;
