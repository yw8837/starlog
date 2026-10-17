import "server-only";
import { z } from "zod";
import { MATCH_RELATIONS } from "@/lib/ai/prompts/match";
import { BirthBody, LOVE_STATUS, TarotInputBody, WORK_STATUS } from "@/lib/api/inputs";

/** Premium request bodies. Unknown keys are dropped; every string is capped. */

const keys = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...Array<keyof T & string>];
const Status = { loveStatus: z.enum(keys(LOVE_STATUS)).optional(), workStatus: z.enum(keys(WORK_STATUS)).optional() };

/** Only a purchase or the owner pass opens premium; the signup gift (`free`) never does (spec §7). */
const Unlock = z.object({ method: z.enum(["paid", "owner"]) });
const Resume = z.string().min(1).max(120_000).optional();

export const DeepTarotBody = z.object({
  drawToken: z.string().min(1).max(4096),
  input: TarotInputBody.omit({ history: true }),
});
export const DeepTarotReadingBody = DeepTarotBody.extend({ unlock: Unlock, resume: Resume });

export const MatchBody = z.object({
  me: z.object({ birth: BirthBody, ...Status }),
  partner: z.object({ birth: BirthBody, label: z.string().trim().max(10).optional() }),
  relation: z.enum(MATCH_RELATIONS),
  concern: z.string().trim().max(60).optional(),
  drawToken: z.string().min(1).max(4096),
  /** "상대에게 알리거나 동의를 받을 수 있는 사이에서만 입력할게요" (spec §5.2) */
  ack: z.literal(true),
  /** The card design the user sees, as the deep reading's input takes it: the five cards quote its pictures (absent: the 1909 scans). */
  deck: TarotInputBody.shape.deck,
});
export const MatchReadingBody = MatchBody.extend({ unlock: Unlock, resume: Resume });

/** No free text: the saju side takes no one-line concern, 신년운세 included (saju-topics spec §18-1); a sent one is dropped. */
export const NewYearBody = z.object({ birth: BirthBody, ...Status });
export const NewYearReadingBody = NewYearBody.extend({ unlock: Unlock, resume: Resume });

/** Largest accepted bodies: a preview is small; a reading may carry a resume token. */
export const TEASER_MAX_BYTES = 8_000;
export const READING_MAX_BYTES = 160_000;

export type DeepTarotBodyData = z.infer<typeof DeepTarotBody>;
export type MatchBodyData = z.infer<typeof MatchBody>;
export type NewYearBodyData = z.infer<typeof NewYearBody>;
