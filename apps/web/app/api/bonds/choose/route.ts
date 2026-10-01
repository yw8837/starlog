import { SignBody, body, bondsRoute, ok } from "@/lib/bonds/api";
import { readOwnerId } from "@/lib/bonds/identity";
import { BondsError, chooseSign } from "@/lib/bonds/service";

/** POST {sign} → starts filling that sign (none may be in progress, and it must not be completed). */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "choose", async ({ secret, now, cookies, repo }) => {
    const { sign } = await body(request, SignBody);
    const ownerId = await readOwnerId(cookies, secret);
    if (!ownerId) throw new BondsError("NO_OWNER");
    return ok({ constellation: await chooseSign(repo, now, ownerId, sign) });
  });
}
