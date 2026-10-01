import { z } from "zod";
import { BirthSchema, body, bondsRoute, ok } from "@/lib/bonds/api";
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
    await saveOwner(repo, now, id, input);
    const invite = await inviteOf(repo, now, id);
    return ok({ code: invite.code }, [setCookie]);
  });
}
