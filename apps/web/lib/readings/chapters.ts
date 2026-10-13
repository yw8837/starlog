import "server-only";
import { SITE } from "@/lib/config";
import { PREMIUM, type PremiumId } from "@/lib/premium/products";
import type { ServerChapter } from "./store";

/**
 * The chapter a device would save for a fresh reading (lib/storage/chapters.ts NewChapter), built on
 * the server so a reading saved to the account matches what the device keeps.
 */

type Body = { reading: unknown; chapterToken: string };

export function tarotChapter(
  input: { question: string; conditions: ReadonlyArray<{ label: string; value: string }>; note?: string },
  cards: ReadonlyArray<{ position: string; cardId: string; orientation: "upright" | "reversed" }>,
  body: Body,
  now: number,
): ServerChapter {
  return {
    kind: "tarot",
    question: input.question,
    conditions: input.conditions.map(({ label, value }) => ({ label, value })),
    note: (input.note ?? "").trim(),
    cards: cards.map(({ position, cardId, orientation }) => ({ position, cardId, orientation })),
    reading: body.reading as Record<string, unknown>,
    chapterToken: body.chapterToken,
    createdAt: now,
    turns: [],
    followUpsLeft: SITE.reading.followUps,
  };
}

export function sajuChapter(
  input: {
    birth: unknown;
    context: { loveStatus?: string; workStatus?: string };
    /** 주제별 사주: the topic (saju-topics spec §9.4); absent for 전체 흐름 */
    topic?: string;
    display?: { title: string; summary: string };
  },
  body: Body,
  now: number,
): ServerChapter {
  const context = {
    ...(input.context.loveStatus ? { loveStatus: input.context.loveStatus } : {}),
    ...(input.context.workStatus ? { workStatus: input.context.workStatus } : {}),
  };
  return {
    kind: "saju",
    birth: input.birth,
    ...(input.topic ? { topic: input.topic } : {}),
    title: input.display?.title ?? "",
    summary: input.display?.summary ?? "",
    ...(Object.keys(context).length > 0 ? { context } : {}),
    reading: body.reading as Record<string, unknown>,
    chapterToken: body.chapterToken,
    createdAt: now,
    turns: [],
    followUpsLeft: SITE.reading.followUps,
  };
}

/**
 * A premium chapter as the device keeps it (lib/storage/chapters.ts): the product's own fields
 * (question and cards; relation, both births and cards; birth and title) plus the reading.
 */
export function premiumChapter(product: PremiumId, fields: Record<string, unknown>, body: Body, now: number): ServerChapter {
  return {
    kind: product,
    ...fields,
    reading: body.reading as Record<string, unknown>,
    chapterToken: body.chapterToken,
    createdAt: now,
    turns: [],
    followUpsLeft: PREMIUM[product].followUps,
  };
}
