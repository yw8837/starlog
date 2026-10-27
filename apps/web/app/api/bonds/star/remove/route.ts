import { StarBody, body, bondsRoute, ok } from "@/lib/bonds/api";
import { BondsError, removeStar } from "@/lib/bonds/service";

/** POST {starId} → the owner removes one star (the page confirms first). */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "star.remove", async ({ secret, now, cookies, repo, who }) => {
    const { starId } = await body(request, StarBody);
    const ownerId = (await who()).ownerId;
    if (!ownerId) throw new BondsError("NO_OWNER");
    await removeStar(repo, now, ownerId, starId);
    return ok({});
  });
}
