import { bondsRoute, ok } from "@/lib/bonds/api";
import { readOwnerId } from "@/lib/bonds/identity";
import { BondsError, ownerView } from "@/lib/bonds/service";

/** GET → this device's 별자리 인연: `{ owner: null }` before the first start, else the owner view (`?view=home`: no ranks or TOP 5). */
export async function GET(request: Request): Promise<Response> {
  return bondsRoute(request, "me", async ({ secret, now, cookies, repo }) => {
    const ownerId = await readOwnerId(cookies, secret);
    if (!ownerId) return ok({ owner: null });
    try {
      const light = new URL(request.url).searchParams.get("view") === "home";
      return ok({ ...(await ownerView(repo, now, ownerId, { light })) });
    } catch (error) {
      if (error instanceof BondsError && error.code === "NO_OWNER") return ok({ owner: null });
      throw error;
    }
  });
}
