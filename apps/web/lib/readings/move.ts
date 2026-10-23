import "server-only";
import { TEMPLATES } from "@starlog/core";
import { z } from "zod";
import { LOVE_STATUS, WORK_STATUS } from "@/lib/api/inputs";
import { SITE } from "@/lib/config";
import type { D1Binding } from "@/lib/db/d1";
import { CHAPTER_TOKEN_TTL_MS, openChapter } from "@/lib/security/chapterToken";
import { sajuChapter, tarotChapter } from "./chapters";
import { chapterReadingId, insertReadingStatement, type ServerChapter } from "./store";

/**
 * Account sync: a reading this device kept moves into the account when its user asks (내 기록, 내 정보), from
 * SYNC_REVISION_DATE (lib/legal.ts). Only what the server can vouch for moves: its chapter token is ours (signed) and the
 * reading is the one it was issued for (digest), and the account copy is built from the token's own fields (the draw and
 * input, or the birth; the follow-up turns), never from what the device says. The one exception, as for a paid saju
 * reading (SajuBody.display): a saju record's teaser title and summary, which only label it, cut to the same sizes.
 * Standard tarot and saju only: a premium reading is in the account from the start (opened logged in), and a 궁합's
 * account copy may not hold its token (owner 2026-10-16). What does not move stays on the device, and the answer says so.
 */

/** Readings per request: the device moves its readings a few at a time. */
export const MOVE_BATCH = 5;
/** Five readings with their tokens (a token carries the follow-up answers too) fit well under this. */
export const MOVE_MAX_BYTES = 400_000;

/** Trimmed, then cut to `max` characters (whole code points), as inputs.ts does for SajuBody.display. */
const clipped = (max: number) => z.string().trim().transform((text) => Array.from(text).slice(0, max).join(""));

export const MoveBody = z.object({
  chapters: z
    .array(
      z.object({
        /** the device's own id for the record, given back with the answer */
        id: z.string().regex(/^[a-z0-9]{6,32}$/),
        chapterToken: z.string().max(32_768),
        /** the reading exactly as the device keeps it (checked against the token's digest) */
        reading: z.unknown(),
        title: clipped(80).optional().catch(undefined),
        summary: clipped(1000).optional().catch(undefined),
      }),
    )
    .min(1)
    .max(MOVE_BATCH),
});

export type MoveItem = z.infer<typeof MoveBody>["chapters"][number];
/** unverified: the server cannot vouch for it (not our token, a changed reading); kind: a reading that does not move */
export type KeptReason = "unverified" | "kind";

const keyOf = <T extends Record<string, string>>(labels: T, label: string | undefined): keyof T | undefined =>
  label === undefined ? undefined : (Object.keys(labels) as Array<keyof T>).find((key) => labels[key] === label);

/** The account copy of a device's record, as the server would have saved it, or why it cannot move. */
export async function vouchedChapter(item: MoveItem, secret: string): Promise<{ chapterId: string; chapter: ServerChapter } | KeptReason> {
  // A token past its 7 days still proves what the server wrote (only its follow-ups ended), as a share's does.
  const opened = item.chapterToken ? await openChapter(item.chapterToken, item.reading, secret, 0) : null;
  if (!opened) return "unverified";
  const { ctx } = opened;
  const body = { reading: item.reading, chapterToken: item.chapterToken };
  // A standard chapter's expiry is fixed 7 days after its reading was written (follow-ups keep it).
  const createdAt = opened.exp - CHAPTER_TOKEN_TTL_MS;
  let chapter: ServerChapter;
  if (ctx.kind === "tarot") {
    const positions = Object.hasOwn(TEMPLATES, ctx.templateId) ? TEMPLATES[ctx.templateId].positions : [];
    if (positions.length !== ctx.cards.length) return "unverified";
    const cards = ctx.cards.map(([cardId, orientation], slot) => ({ position: positions[slot]!, cardId, orientation }));
    chapter = { ...tarotChapter(ctx.input, cards, body, createdAt), ...(ctx.opening ? { opening: true } : {}) };
  } else if (ctx.kind === "saju") {
    const context = { loveStatus: keyOf(LOVE_STATUS, ctx.profile?.loveStatus), workStatus: keyOf(WORK_STATUS, ctx.profile?.workStatus) };
    chapter = sajuChapter({ birth: ctx.birth, context, topic: ctx.topic, display: { title: item.title ?? "", summary: item.summary ?? "" } }, body, createdAt);
  } else {
    return "kind";
  }
  const turns = opened.turns.map(({ question, answer }) => ({ question, answer }));
  return { chapterId: opened.id, chapter: { ...chapter, turns, followUpsLeft: Math.max(0, SITE.reading.followUps - turns.length) } };
}

/**
 * Moves the records the server can vouch for into `userId`'s account, each under its chapter's own id (chapterReadingId):
 * a record moved again (a retry, a second device, one already kept from 오픈 기념 무료) is the same row. `moved` pairs each
 * record with its account id; `kept` says which stay on the device, and why.
 */
export async function moveReadings(
  db: D1Binding,
  secrets: { signing: string; account: string },
  userId: string,
  items: readonly MoveItem[],
  now: number,
): Promise<{ moved: Array<{ id: string; readingId: string }>; kept: Array<{ id: string; reason: KeptReason }> }> {
  const kept: Array<{ id: string; reason: KeptReason }> = [];
  const moving: Array<{ id: string; readingId: string }> = [];
  const inserts = [];
  for (const item of items) {
    const vouched = await vouchedChapter(item, secrets.signing);
    if (typeof vouched === "string") {
      kept.push({ id: item.id, reason: vouched });
      continue;
    }
    const readingId = await chapterReadingId(secrets.account, userId, vouched.chapterId);
    moving.push({ id: item.id, readingId });
    // Dated when the reading was written, so 내 기록 keeps its place on every device.
    inserts.push(
      await insertReadingStatement(db, secrets.account, {
        id: readingId, userId, productId: vouched.chapter.kind, source: "free", origin: "moved", unlockId: null, chapter: vouched.chapter, now: Math.min(vouched.chapter.createdAt, now),
      }),
    );
  }
  if (inserts.length) await db.batch(inserts);
  // What the account holds now (written here, or kept before); a deleted account holds nothing.
  const ids = [...new Set(moving.map((m) => m.readingId))];
  const there = new Set(
    ids.length
      ? (await db.prepare(`SELECT id FROM readings WHERE user_id = ? AND id IN (${ids.map(() => "?").join(", ")})`).bind(userId, ...ids).all<{ id: string }>()).results.map((row) => row.id)
      : [],
  );
  const moved = moving.filter((m) => there.has(m.readingId));
  for (const m of moving) if (!there.has(m.readingId)) kept.push({ id: m.id, reason: "unverified" });
  return { moved, kept };
}
