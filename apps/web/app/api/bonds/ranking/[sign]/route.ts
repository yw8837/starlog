import { isSignId, kstWeekId } from "@starlog/core";
import { bondsRoute, fail, ok } from "@/lib/bonds/api";
import { readOwnerId } from "@/lib/bonds/identity";
import { RANKING_LIMIT, rankingBoards, rankingView, type RankingBoards, type RankingView } from "@/lib/bonds/service";
import { SITE } from "@/lib/config";
import { fromCache, toCache } from "@/lib/og/edgeCache";

const BOARDS_TTL_SECONDS = 60;

/**
 * GET → one sign's ranking: this week's and the hall of fame's top 20 (nicknames only) and the viewer's
 * own record and rank. The two top lists come from the edge cache (60 s per sign and week); the viewer's
 * part is read per request. A viewer whose own record belongs in a list the cache does not show yet (just
 * completed) gets fresh lists, which also refresh the cache.
 */
export async function GET(request: Request, { params }: { params: Promise<{ sign: string }> }): Promise<Response> {
  return bondsRoute(request, "ranking", async ({ secret, now, cookies, repo }) => {
    const { sign } = await params;
    if (!isSignId(sign)) return fail("NOT_FOUND");
    const key = `${new URL(SITE.url).origin}/__cache/ranking/${sign}/${kstWeekId(now)}`;
    const ownerId = await readOwnerId(cookies, secret);
    const fresh = async () => {
      const boards = await rankingBoards(repo, now, sign);
      await toCache(key, Response.json(boards), BOARDS_TTL_SECONDS);
      return boards;
    };
    const hit = await fromCache(key);
    const cached = hit ? ((await hit.json()) as RankingBoards) : null;
    let view = await rankingView(repo, now, sign, ownerId, cached ?? (await fresh()));
    if (cached && missesOwnRow(view)) view = await rankingView(repo, now, sign, ownerId, await fresh());
    return ok({ ...view });
  });
}

/** The viewer ranks within a list's length but is not in the (cached) list. */
function missesOwnRow(view: RankingView): boolean {
  if (!view.mine) return false;
  const { weekRank, allRank } = view.mine;
  const missing = (rank: number | null, rows: RankingView["week"]) => rank !== null && rank <= RANKING_LIMIT && !rows.some((r) => r.mine);
  return missing(weekRank, view.week) || missing(allRank, view.all);
}
