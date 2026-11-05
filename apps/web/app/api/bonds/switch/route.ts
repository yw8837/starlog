import { SignBody, body, bondsRoute, ok, requireOwner } from "@/lib/bonds/api";
import { switchSign } from "@/lib/bonds/service";

/** POST {sign} → 별자리 바꾸기: clears the sign being filled and starts `sign` from zero (the page confirms first). */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "switch", async ({ secret, now, cookies, repo, who }) => {
    const { sign } = await body(request, SignBody);
    const ownerId = await requireOwner(who);
    return ok({ constellation: await switchSign(repo, now, ownerId, sign) });
  });
}
