import "server-only";
import { accountDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { chapterTurns as kvTurns, recordChapterTurns } from "./spend";

/**
 * G1: follow-up answers given per chapter, so replaying an older chapter token (fewer turns) cannot reset
 * the chapter's cap, and follow-ups sent together cannot pass it.
 * - In D1 (chapter_turns, migration 0012) a turn is held with one conditional upsert: it is taken only
 *   while the count stays within the cap, so the cap holds under any concurrency. A row lives until
 *   `until` (a day past its chapter token); the maintenance cron purges it after.
 * - The KV count (`turns:<chapterId>`, lib/api/spend.ts) is still read as a floor, for chapters answered
 *   before the count moved to D1; nothing writes it any more. Drop that read after 2026-11-22, when the
 *   last 30-day premium chapter token from before is dead.
 * - Without D1 (next dev without the Workers bindings) KV stays the counter, as before: not atomic.
 * When a count cannot be read or held the answer is null and the route gives no new answer.
 */

/** Answers given in this chapter (0 when none are on record), or null when the count cannot be read. */
export async function answeredTurns(chapterId: string): Promise<number | null> {
  const legacy = await kvTurns(chapterId);
  if (legacy === null) return null;
  const db = accountDb();
  if (!db) return legacy;
  try {
    const row = await db.prepare("SELECT turns FROM chapter_turns WHERE chapter_id = ?").bind(chapterId).first<{ turns: number }>();
    return Math.max(legacy, row?.turns ?? 0);
  } catch (error) {
    logD1Error("read", error);
    return null;
  }
}

/**
 * Holds the chapter's next turn, starting from `answered` (what the token and the count on record say)
 * and never below what is on record: the new count, "capped" when it would pass `cap`, or null when it
 * could not be held. `ttlSeconds`: the KV fallback's lifetime (spend.ts recordChapterTurns).
 */
export async function holdTurn(
  chapterId: string,
  input: { answered: number; cap: number; until: number; ttlSeconds?: number },
): Promise<number | "capped" | null> {
  const next = input.answered + 1;
  if (next > input.cap) return "capped";
  const db = accountDb();
  if (!db) {
    await recordChapterTurns(chapterId, next, input.ttlSeconds);
    return next;
  }
  try {
    const row = await db
      .prepare(
        `INSERT INTO chapter_turns (chapter_id, turns, expires_at) VALUES (?, ?, ?)
         ON CONFLICT(chapter_id) DO UPDATE SET turns = MAX(chapter_turns.turns + 1, excluded.turns), expires_at = MAX(chapter_turns.expires_at, excluded.expires_at)
           WHERE MAX(chapter_turns.turns + 1, excluded.turns) <= ?
         RETURNING turns`,
      )
      .bind(chapterId, next, input.until, input.cap)
      .first<{ turns: number }>();
    return row ? row.turns : "capped";
  } catch (error) {
    logD1Error("hold", error);
    return null;
  }
}

/** Gives back the turn held as `held` (its answer failed), unless the count already went below it. Never throws. */
export async function giveBackTurn(chapterId: string, held: number, ttlSeconds?: number): Promise<void> {
  const db = accountDb();
  if (!db) {
    const now = await kvTurns(chapterId);
    if (now !== null && now >= held) await recordChapterTurns(chapterId, now - 1, ttlSeconds);
    return;
  }
  try {
    await db.prepare("UPDATE chapter_turns SET turns = turns - 1 WHERE chapter_id = ? AND turns >= ?").bind(chapterId, held).run();
  } catch (error) {
    logD1Error("give_back", error);
  }
}

/** The maintenance cron: deletes rows whose chapter token died more than a day ago, at most `limit`. */
export async function purgeChapterTurns(db: D1Binding, now: number, limit = 500): Promise<number> {
  const result = await db
    .prepare("DELETE FROM chapter_turns WHERE chapter_id IN (SELECT chapter_id FROM chapter_turns WHERE expires_at < ? LIMIT ?)")
    .bind(now, limit)
    .run();
  return result.meta?.changes ?? 0;
}

function logD1Error(op: string, error: unknown): void {
  console.error(JSON.stringify({ evt: "followup.turns_d1_error", op, error: error instanceof Error ? error.constructor.name : typeof error }));
}
