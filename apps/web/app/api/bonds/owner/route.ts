import { z } from "zod";
import { BirthSchema, allowed, body, bondsRoute, fail, ok } from "@/lib/bonds/api";
import { ownerCookie } from "@/lib/bonds/identity";
import { inviteOf, saveOwner } from "@/lib/bonds/service";
import { randomId } from "@/lib/security/sign";

const OwnerBody = z.object({
  nickname: z.string().max(40),
  /** required the first time; the birth date only becomes the 궁합 basis and is not stored */
  birth: BirthSchema.optional(),
  rankingPublic: z.boolean().optional(),
});

/**
 * POST {nickname, birth} → saves the owner this request acts as (a rename), or starts one, and returns the invite code.
 * Starting needs a login (owner 2026-10-27: "계정 위주로 돌아가는 게 맞다"): the new owner belongs to the account, so the
 * same constellation, invite link and scores show on every device it logs in on. LOGIN_REQUIRED otherwise.
 */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "owner", async ({ secret, now, repo, who }) => {
    const input = await body(request, OwnerBody);
    const { ownerId, userId } = await who();
    if (ownerId) {
      await saveOwner(repo, now, ownerId, input);
      return ok({ code: (await inviteOf(repo, now, ownerId)).code });
    }
    if (!userId) return fail("LOGIN_REQUIRED");
    // A new owner is limited per network; renaming an existing one is not.
    if (!(await allowed(request, "BOND_JOIN_LIMITER", now))) return fail("RATE_LIMIT");
    const id = randomId();
    await saveOwner(repo, now, id, input);
    const linked = await repo.linkOwner(id, userId);
    if (linked === "taken") {
      // Another device of this account started one a moment ago: that one stays.
      await repo.deleteOwner(id);
      const theirs = await repo.ownerOfUser(userId);
      if (!theirs) return fail("SERVER");
      return ok({ code: (await inviteOf(repo, now, theirs.id)).code });
    }
    // A database without migration 0019 yet: the owner stays this device's, as before accounts, until it can be linked.
    const cookie = linked === "unsupported" ? await ownerCookie(id, secret) : null;
    return ok({ code: (await inviteOf(repo, now, id)).code }, [cookie]);
  });
}
