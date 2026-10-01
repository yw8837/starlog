import { z } from "zod";
import { BirthSchema, allowed, body, bondsRoute, fail, ok } from "@/lib/bonds/api";
import { ensureOwnerId } from "@/lib/bonds/identity";
import { inviteOf, saveOwner } from "@/lib/bonds/service";

const OwnerBody = z.object({
  nickname: z.string().max(40),
  /** required the first time; the birth date only becomes the 궁합 basis and is not stored */
  birth: BirthSchema.optional(),
  rankingPublic: z.boolean().optional(),
});

/** POST {nickname, birth} → starts (or renames) this device's owner and returns the invite code. */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "owner", async ({ secret, now, cookies, repo }) => {
    const input = await body(request, OwnerBody);
    const { id, setCookie } = await ensureOwnerId(cookies, secret);
    // A new owner (a fresh device id) is limited per network; renaming an existing one is not.
    if (setCookie && !(await allowed(request, "BOND_JOIN_LIMITER", now))) return fail("RATE_LIMIT");
    await saveOwner(repo, now, id, input);
    const invite = await inviteOf(repo, now, id);
    return ok({ code: invite.code }, [setCookie]);
  });
}
