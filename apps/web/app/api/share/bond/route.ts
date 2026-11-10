import { friendStar } from "@/lib/bonds/share";
import { bondsShare } from "@/lib/bonds/shareRoute";
import { friendKeysOf } from "@/lib/bonds/identity";
import { whoOwns } from "@/lib/bonds/owner";

/**
 * 별자리 인연, a friend's own star (owner 2026-10-23).
 * POST {starId} → {id, path, preview}: the friend's result at /s/<id>, read live (lib/bonds/share.ts): their card,
 * their score and its reasons from their side, the owner's nickname. Only the friend who joined as that star makes it,
 * logged in (owner 2026-11-10: a friend logs in to join; 401 LOGIN_REQUIRED `reason: "share"` with no session): the
 * account's star, or one this device left before a join needed a login. DELETE {starId} → {deleted}: stops it.
 */
const find: Parameters<typeof bondsShare>[2] = async ({ repo, cookies, secret, body }) => {
  const { userId } = await whoOwns(repo, cookies, secret, Date.now());
  if (!userId) return "LOGIN_REQUIRED";
  const id = body.starId;
  if (typeof id !== "string" || id.length > 64) return null;
  for (const key of await friendKeysOf(userId, cookies, secret)) {
    const star = await friendStar(repo, key, id);
    if (star) return { kind: "bond", v: 1, constellationId: star.constellationId, starId: star.id };
  }
  return null;
};

export const POST = (request: Request) => bondsShare(request, "POST", find);
export const DELETE = (request: Request) => bondsShare(request, "DELETE", find);
