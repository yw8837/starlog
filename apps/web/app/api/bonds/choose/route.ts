import { SignBody, body, bondsRoute, ok, requireOwner } from "@/lib/bonds/api";
import { chooseSign } from "@/lib/bonds/service";

/** POST {sign} → starts filling that sign (none may be in progress, and it must not be completed). */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "choose", async ({ secret, now, cookies, repo, who }) => {
    const { sign } = await body(request, SignBody);
    const ownerId = await requireOwner(who);
    return ok({ constellation: await chooseSign(repo, now, ownerId, sign) });
  });
}
