import { bestRecord, loadLeaders, type WeekTop } from "@/app/ranking/loadLeaders";
import { bondsRoute, ok } from "@/lib/bonds/api";
import { existingFriendKey, readOwnerId } from "@/lib/bonds/identity";
import { BondsError, joinedView, ownerView, type JoinedView } from "@/lib/bonds/service";

/**
 * GET → this device's 별자리 인연: `{ owner: null }` before the first start, else the owner view (`?view=home`: ranks as usual, no TOP 5).
 * Both carry `weekTop` (the field keeps its name for clients that already read it), the best constellation of
 * all time for the 인연 랭킹 tile (from the leaderboard's edge-cached query, no query of its own; null before
 * any completion, left out when it cannot be read). `joined` (owner 2026-10-14): the constellations this device
 * joined as a friend, when there are any (never on the home row's light view).
 */
export async function GET(request: Request): Promise<Response> {
  return bondsRoute(request, "me", async ({ secret, now, cookies, repo }) => {
    const leaders = await loadLeaders(() => repo);
    let top: { weekTop?: WeekTop | null; joined?: JoinedView[] } = leaders ? { weekTop: bestRecord(leaders) } : {};
    const ownerId = await readOwnerId(cookies, secret);
    const light = new URL(request.url).searchParams.get("view") === "home";
    const friend = light ? null : await existingFriendKey(cookies, secret);
    const joined = friend ? await joinedView(repo, friend, ownerId) : [];
    if (joined.length) top = { ...top, joined };
    if (!ownerId) return ok({ owner: null, ...top });
    try {
      return ok({ ...(await ownerView(repo, now, ownerId, { light })), ...top });
    } catch (error) {
      if (error instanceof BondsError && error.code === "NO_OWNER") return ok({ owner: null, ...top });
      throw error;
    }
  });
}
