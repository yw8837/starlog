import { isSignId } from "@starlog/core";
import { bondsRoute, fail, ok } from "@/lib/bonds/api";
import { readOwnerId } from "@/lib/bonds/identity";
import { RANKING_LIMIT, rankingBoards, rankingView, type RankingBoards, type RankingView } from "@/lib/bonds/service";
import { SITE } from "@/lib/config";
import { fromCache, toCache } from "@/lib/og/edgeCache";

const BOARDS_TTL_SECONDS = 60;

/**
 * GET → one sign's ranking: the all-time top 50 (nicknames only, one query with a LIMIT) and the viewer's
 * own record and rank. The top list comes from the edge cache (60 s per sign; it never restarts); the
 * viewer's part is read per request, and their rank is counted even far below the list. A viewer whose own
 * record belongs in the list but the cache does not show it yet (just completed) gets a fresh list, which
 * also refreshes the cache.
 */
export async function GET(request: Request, { params }: { params: Promise<{ sign: string }> }): Promise<Response> {
  return bondsRoute(request, "ranking", async ({ secret, now, cookies, repo }) => {
    const { sign } = await params;
    if (!isSignId(sign)) return fail("NOT_FOUND");
    const key = `${new URL(SITE.url).origin}/__cache/ranking/${sign}`;
    const ownerId = await readOwnerId(cookies, secret);
    const fresh = async () => {
      const boards = await rankingBoards(repo, sign);
      await toCache(key, Response.json(boards), BOARDS_TTL_SECONDS);
      return boards;
    };
    const hit = await fromCache(key);
    const cached = hit ? ((await hit.json()) as RankingBoards) : null;
    let view = await rankingView(repo, now, sign, ownerId, cached ?? (await fresh()));
    if (cached && missesOwnRow(view)) view = await rankingView(repo, now, sign, ownerId, await fresh());
    // `week` and `mine.weekRank` repeat the all-time board for pages opened before the weekly board went away
    // (they read data.week on load). Added 2026-10-08 for one release: remove both in the release after it.
    return ok({ ...view, week: view.all, mine: view.mine && { ...view.mine, weekRank: view.mine.allRank } });
  });
}

/** The viewer ranks within the list's length but is not in the (cached) list. */
function missesOwnRow({ mine, all }: RankingView): boolean {
  const rank = mine?.allRank ?? null;
  return rank !== null && rank <= RANKING_LIMIT && !all.some((r) => r.mine);
}
