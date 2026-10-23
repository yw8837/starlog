import { friendStar } from "@/lib/bonds/share";
import { bondsShare } from "@/lib/bonds/shareRoute";
import { existingFriendKey } from "@/lib/bonds/identity";

/**
 * 별자리 인연, a friend's own star (owner 2026-10-23).
 * POST {starId} → {id, path, preview}: the friend's result at /s/<id>, read live (lib/bonds/share.ts): their card,
 * their score and its reasons from their side, the owner's nickname. Only the device that joined as that star makes it.
 * DELETE {starId} → {deleted}: stops it.
 */
const find: Parameters<typeof bondsShare>[2] = async ({ repo, cookies, secret, body }) => {
  const key = await existingFriendKey(cookies, secret);
  const id = body.starId;
  if (!key || typeof id !== "string" || id.length > 64) return null;
  const star = await friendStar(repo, key, id);
  return star ? { kind: "bond", v: 1, constellationId: star.constellationId, starId: star.id } : null;
};

export const POST = (request: Request) => bondsShare(request, "POST", find);
export const DELETE = (request: Request) => bondsShare(request, "DELETE", find);
