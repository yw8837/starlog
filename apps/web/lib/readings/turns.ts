import "server-only";
import { openAccount } from "@/lib/account/request";
import { updateReadingChapter } from "./store";

/**
 * Writes a follow-up answer into the account's copy of the reading, so another device sees it.
 * Best effort: a failure is logged and never fails the answer, which the device keeps anyway.
 */
export async function saveFollowUpTurn(
  request: Request,
  now: number,
  readingId: string,
  turn: { question: string; answer: string },
  chapterToken: string,
  followUpsLeft: number,
): Promise<void> {
  try {
    const ctx = await openAccount(request, now);
    if (ctx instanceof Response || !ctx.session) return;
    await updateReadingChapter(ctx.db, ctx.accountSecret, ctx.session.user.id, readingId, (chapter) => ({ ...chapter, turns: [...chapter.turns, turn], chapterToken, followUpsLeft }), now);
  } catch (error) {
    console.error(JSON.stringify({ evt: "readings.turn_not_saved", error: error instanceof Error ? error.constructor.name : typeof error }));
  }
}
