import { isSignId } from "@starlog/core";
import { bondsRoute, fail, ok } from "@/lib/bonds/api";
import { readOwnerId } from "@/lib/bonds/identity";
import { rankingView } from "@/lib/bonds/service";

/** GET → this week's ranking and the hall of fame for one sign (top 50, nicknames only), with the viewer's card. */
export async function GET(request: Request, { params }: { params: Promise<{ sign: string }> }): Promise<Response> {
  return bondsRoute(request, "ranking", async ({ secret, now, cookies, repo }) => {
    const { sign } = await params;
    if (!isSignId(sign)) return fail("NOT_FOUND");
    return ok({ ...(await rankingView(repo, now, sign, await readOwnerId(cookies, secret))) });
  });
}
