import { StarBody, body, bondsRoute, ok } from "@/lib/bonds/api";
import { readOwnerId } from "@/lib/bonds/identity";
import { BondsError, removeStar } from "@/lib/bonds/service";

/** POST {starId} → the owner removes one star (the page confirms first). */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "star.remove", async ({ secret, now, cookies, repo }) => {
    const { starId } = await body(request, StarBody);
    const ownerId = await readOwnerId(cookies, secret);
    if (!ownerId) throw new BondsError("NO_OWNER");
    await removeStar(repo, now, ownerId, starId);
    return ok({});
  });
}
