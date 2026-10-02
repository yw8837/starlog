import "server-only";
import { SITE } from "@/lib/config";
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
  input: { birth: unknown; context: { loveStatus?: string; workStatus?: string }; display?: { title: string; summary: string } },
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
