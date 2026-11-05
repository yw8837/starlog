import { bondsRoute, ok, requireOwner } from "@/lib/bonds/api";
import { regenerateInvite } from "@/lib/bonds/service";

/** POST → 코드 새로 만들기: a new invite code; the old code and link stop working at once. */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "invite", async ({ secret, now, cookies, repo, who }) => {
    const ownerId = await requireOwner(who);
    const invite = await regenerateInvite(repo, now, ownerId);
    return ok({ code: invite.code });
  });
}
