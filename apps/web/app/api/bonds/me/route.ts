import { loadLeaders, weekTop, type WeekTop } from "@/app/ranking/loadLeaders";
import { bondsRoute, ok } from "@/lib/bonds/api";
import { readOwnerId } from "@/lib/bonds/identity";
import { BondsError, ownerView } from "@/lib/bonds/service";

/**
 * GET → this device's 별자리 인연: `{ owner: null }` before the first start, else the owner view (`?view=home`: no ranks or TOP 5).
 * Both carry `weekTop`, this week's best constellation for the 인연 랭킹 tile (from the leaderboard's edge-cached
 * query, no query of its own; null before any completion, left out when it cannot be read).
 */
export async function GET(request: Request): Promise<Response> {
  return bondsRoute(request, "me", async ({ secret, now, cookies, repo }) => {
    const leaders = await loadLeaders(now, () => repo);
    const top: { weekTop?: WeekTop | null } = leaders ? { weekTop: weekTop(leaders) } : {};
    const ownerId = await readOwnerId(cookies, secret);
    if (!ownerId) return ok({ owner: null, ...top });
    try {
      const light = new URL(request.url).searchParams.get("view") === "home";
      return ok({ ...(await ownerView(repo, now, ownerId, { light })), ...top });
    } catch (error) {
      if (error instanceof BondsError && error.code === "NO_OWNER") return ok({ owner: null, ...top });
      throw error;
    }
  });
}
