import { SignBody, body, bondsRoute, ok, requireOwner } from "@/lib/bonds/api";
import { refill } from "@/lib/bonds/service";

/** POST {sign} → 새로 채우기 a completed sign (once an hour in the beta; COOLDOWN carries `retryAt`). */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "refill", async ({ secret, now, cookies, repo, who }) => {
    const { sign } = await body(request, SignBody);
    const ownerId = await requireOwner(who);
    return ok({ constellation: await refill(repo, now, ownerId, sign) });
  });
}
