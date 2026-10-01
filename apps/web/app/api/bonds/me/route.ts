import { bondsRoute, ok } from "@/lib/bonds/api";
import { readOwnerId } from "@/lib/bonds/identity";
import { BondsError, ownerView } from "@/lib/bonds/service";

/** GET → this device's 별자리 인연: `{ owner: null }` before the first start, else the owner view. */
export async function GET(request: Request): Promise<Response> {
  return bondsRoute(request, "me", async ({ secret, now, cookies, repo }) => {
    const ownerId = await readOwnerId(cookies, secret);
    if (!ownerId) return ok({ owner: null });
    try {
      return ok({ ...(await ownerView(repo, now, ownerId)) });
    } catch (error) {
      if (error instanceof BondsError && error.code === "NO_OWNER") return ok({ owner: null });
      throw error;
    }
  });
}
