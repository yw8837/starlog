import { SignBody, body, bondsRoute, ok } from "@/lib/bonds/api";
import { readOwnerId } from "@/lib/bonds/identity";
import { BondsError, switchSign } from "@/lib/bonds/service";

/** POST {sign} → 별자리 바꾸기: clears the sign being filled and starts `sign` from zero (the page confirms first). */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "switch", async ({ secret, now, cookies, repo }) => {
    const { sign } = await body(request, SignBody);
    const ownerId = await readOwnerId(cookies, secret);
    if (!ownerId) throw new BondsError("NO_OWNER");
    return ok({ constellation: await switchSign(repo, now, ownerId, sign) });
  });
}
