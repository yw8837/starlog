import { ownedConstellation } from "@/lib/bonds/share";
import { bondsShare } from "@/lib/bonds/shareRoute";
import { whoOwns } from "@/lib/bonds/owner";

/**
 * 별자리 인연, the owner's constellation (owner 2026-10-23).
 * POST {constellationId} → {id, path, preview}: its link at /s/<id>, read live (lib/bonds/share.ts): the friends'
 * nicknames on their stars, the total and the average, never a friend's own score or message. Only its owner, logged in,
 * makes it (401 LOGIN_REQUIRED `reason: "share"` with no session). DELETE {constellationId} → {deleted}: stops it, the same way.
 */
const find: Parameters<typeof bondsShare>[2] = async ({ repo, cookies, secret, body }) => {
  const { ownerId, userId } = await whoOwns(repo, cookies, secret, Date.now());
  // An owner's own constellation needs a session (owner 2026-11-05), like the owner's other actions: the login, not "not yours".
  if (!userId) return "LOGIN_REQUIRED";
  const id = body.constellationId;
  if (!ownerId || typeof id !== "string" || id.length > 64) return null;
  const row = await ownedConstellation(repo, ownerId, id);
  return row ? { kind: "bonds", v: 1, constellationId: row.id } : null;
};

export const POST = (request: Request) => bondsShare(request, "POST", find);
export const DELETE = (request: Request) => bondsShare(request, "DELETE", find);
