import { bestRecord, loadLeaders, type WeekTop } from "@/app/ranking/loadLeaders";
import { bondsRoute, ok } from "@/lib/bonds/api";
import { existingFriendKey } from "@/lib/bonds/identity";
import { BondsError, joinedView, linkOffer, ownerView, type JoinedView } from "@/lib/bonds/service";

/**
 * GET → this device's 별자리 인연: `{ owner: null }` before the first start, else the owner view (`?view=home`: ranks as usual, no TOP 5).
 * Both carry `weekTop` (the field keeps its name for clients that already read it), the best constellation of
 * all time for the 인연 랭킹 tile (from the leaderboard's edge-cached query, no query of its own; null before
 * any completion, left out when it cannot be read). `joined` (owner 2026-10-14): the constellations this device
 * joined as a friend, when there are any (never on the home row's light view). `signedIn`: a starting owner logs in
 * first (owner 2026-10-27); `link`: this device's owner belongs to no account and the visitor is logged in, so the page
 * offers 연결하기, or asks which of two owners stays (lib/bonds/service.ts linkOffer).
 */
export async function GET(request: Request): Promise<Response> {
  return bondsRoute(request, "me", async ({ secret, now, cookies, repo, who }) => {
    const leaders = await loadLeaders(() => repo);
    let top: { weekTop?: WeekTop | null; joined?: JoinedView[] } = leaders ? { weekTop: bestRecord(leaders) } : {};
    const identity = await who();
    const { ownerId } = identity;
    const signedIn = identity.userId !== null;
    const light = new URL(request.url).searchParams.get("view") === "home";
    const friend = light ? null : await existingFriendKey(cookies, secret);
    const joined = friend ? await joinedView(repo, friend, ownerId) : [];
    if (joined.length) top = { ...top, joined };
    if (!ownerId) return ok({ owner: null, signedIn, ...top });
    const link = light ? null : await linkOffer(repo, identity);
    try {
      return ok({ ...(await ownerView(repo, now, ownerId, { light })), ...top, signedIn, ...(link ? { link } : {}) });
    } catch (error) {
      if (error instanceof BondsError && error.code === "NO_OWNER") return ok({ owner: null, signedIn, ...top });
      throw error;
    }
  });
}
