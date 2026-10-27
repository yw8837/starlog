import "server-only";
import { z } from "zod";
import { HistorySchema } from "@/lib/ai/history";
import { UNLOCK_METHODS } from "@/lib/pay/unlockMethod";
import { findPlace } from "@/lib/sajuForm";
import { MAX_TEASER_SEAL_CHARS } from "@/lib/security/teaserSeal";

/** Request bodies. Every string is capped; unknown keys are dropped. */

const WHO = z.enum(["me", "us", "work", "group"]);
const WHEN = z.enum(["today", "week", "month", "year"]);

/** The spreads /api/tarot/draw deals. The 프리미엄 궁합 reads no cards since 2026-10-17 (owner), so none is dealt for it. */
export const DRAW_TEMPLATES = ["relationship-contact", "relationship", "work", "choice", "self-flow", "group", "deep-tarot"] as const;

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
  /**
   * The card design the reader sees (내 정보 → 카드 디자인): the reading quotes that deck's picture. It
   * rides in the chapter, so follow-ups and a share see the same one. Absent (older clients, earlier
   * chapters): the 1909 scans, which those readings were written for.
   */
  deck: z.enum(["starlog", "rws1909"]).optional(),
});

/** How the full reading is opened (P4). Absent means 오픈 기념 무료, one free tarot reading per logged-in account and per device (refused for saju). */
export const UnlockBody = z.object({ method: z.enum(UNLOCK_METHODS) });

export const TarotBody = z.object({
  drawToken: z.string().min(1).max(4096),
  input: TarotInputBody,
  unlock: UnlockBody.optional(),
  /**
   * The teaser's seal (감질맛, lib/security/teaserSeal.ts), sent with the full reading so it reads on from the cut. One that
   * is not a string of the sealed size is dropped, never refused: the reading is then written as before.
   */
  seal: z.string().min(1).max(MAX_TEASER_SEAL_CHARS).optional().catch(undefined),
});

/** The saju form as the client holds it (lib/sajuForm.ts `SajuForm`). */
export const BirthBody = z.object({
  calendar: z.enum(["solar", "lunar"]),
  year: z.number().int().min(1800).max(2200),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  isLeapMonth: z.boolean().default(false),
  /** 윤달 '모름' (lunar dates); absent from older clients and from every other form, so their bodies parse as before */
  leapMonthUnknown: z.boolean().optional(),
  timeKnown: z.boolean(),
  hour: z.number().int().min(0).max(23).nullable().default(null),
  minute: z.number().int().min(0).max(59).nullable().default(null),
  gender: z.enum(["female", "male"]),
  /** a 시·군 id, or one of the 17 시·도 ids from before (lib/birthPlaces.ts LEGACY_PLACE_IDS) */
  placeId: z.string().refine((id) => findPlace(id) !== undefined),
});

/** Trimmed, then cut to `max` characters (whole code points, so no emoji is split): never a reason to refuse. */
const clipped = (max: number) => z.string().trim().transform((text) => Array.from(text).slice(0, max).join(""));

export const LOVE_STATUS = {
  single: "솔로", dating: "연애 중", engaged: "결혼 준비 중", married: "기혼", "fresh-start": "새로운 출발", unsure: "잘 모르겠어요",
} as const;
export const WORK_STATUS = {
  student: "학생", employee: "직장인", "self-employed": "자영업·프리랜서", "between-jobs": "구직·쉬는 중", unsure: "잘 모르겠어요",
} as const;

const SAJU_TOPIC_VALUES = ["overall", "love", "reunion", "money", "career"] as const;

export const SajuBody = z
  .object({
    birth: BirthBody,
    /** 주제별 사주 (saju-topics spec §7.3): the 운 on the chart page; an older client sends none and gets 전체 흐름 */
    topic: z.enum(SAJU_TOPIC_VALUES).default("overall"),
    loveStatus: z.enum(Object.keys(LOVE_STATUS) as [keyof typeof LOVE_STATUS, ...Array<keyof typeof LOVE_STATUS>]).optional(),
    workStatus: z.enum(Object.keys(WORK_STATUS) as [keyof typeof WORK_STATUS, ...Array<keyof typeof WORK_STATUS>]).optional(),
    // No free text on the saju side (saju-topics spec §7.3): an older client's `concern` is an unknown key, dropped
    // here. So is a `situation`: no chip is exposed in the API (owner cut §0).
    /** up to three earlier readings from this device (lib/ai/history.ts) */
    history: HistorySchema.optional(),
    unlock: UnlockBody.optional(),
    /**
     * the free teaser's title and summary, kept with a reading saved to the account. The teaser's
     * summary may run to 500 non-space characters (validateSajuTeaser: 250–400 with a 25% band), so
     * with spaces it is capped well above that (1000). Text past a cap is cut, and a display that is
     * not one is dropped: it only labels the saved reading, so it never stops a paid opening.
     */
    display: z.object({ title: clipped(80), summary: clipped(1000) }).optional().catch(undefined),
  })
  // 전체 흐름 takes the status chips, a topic takes none (spec §7.3); anything else is a 400.
  .superRefine((body, ctx) => {
    if (body.topic !== "overall" && (body.loveStatus || body.workStatus)) {
      ctx.addIssue({ code: "custom", path: ["loveStatus"], message: "a topic takes no status chips" });
    }
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
