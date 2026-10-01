import { isSignId, kstWeekId } from "@starlog/core";
import { bondsRoute, fail, ok } from "@/lib/bonds/api";
import { readOwnerId } from "@/lib/bonds/identity";
import { rankingBoards, rankingView, type RankingBoards } from "@/lib/bonds/service";
import { SITE } from "@/lib/config";
import { fromCache, toCache } from "@/lib/og/edgeCache";

const BOARDS_TTL_SECONDS = 60;

/**
 * GET → one sign's ranking: this week's and the hall of fame's top 20 (nicknames only) and the viewer's
 * own record and rank. The two top lists come from the edge cache (60 s per sign and week); the viewer's
 * part is read per request.
 */
export async function GET(request: Request, { params }: { params: Promise<{ sign: string }> }): Promise<Response> {
  return bondsRoute(request, "ranking", async ({ secret, now, cookies, repo }) => {
    const { sign } = await params;
    if (!isSignId(sign)) return fail("NOT_FOUND");
    const key = `${new URL(SITE.url).origin}/__cache/ranking/${sign}/${kstWeekId(now)}`;
    const hit = await fromCache(key);
    let boards: RankingBoards;
    if (hit) boards = (await hit.json()) as RankingBoards;
    else {
      boards = await rankingBoards(repo, now, sign);
      await toCache(key, Response.json(boards), BOARDS_TTL_SECONDS);
    }
    return ok({ ...(await rankingView(repo, now, sign, await readOwnerId(cookies, secret), boards)) });
  });
}
