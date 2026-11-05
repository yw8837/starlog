import { StarBody, body, bondsRoute, ok, requireOwner } from "@/lib/bonds/api";
import { removeStar } from "@/lib/bonds/service";

/** POST {starId} → the owner removes one star (the page confirms first). */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "star.remove", async ({ secret, now, cookies, repo, who }) => {
    const { starId } = await body(request, StarBody);
    const ownerId = await requireOwner(who);
    await removeStar(repo, now, ownerId, starId);
    return ok({});
  });
}
