import { z } from "zod";
import { body, bondsRoute, fail, ok } from "@/lib/bonds/api";

const LinkBody = z.object({
  /** when the account already has an owner: which one stays */
  keep: z.enum(["device", "account"]).optional(),
});

/**
 * POST {keep?} → links this device's owner (made on this device, belonging to no account) to the logged-in account, only
 * when the person taps 연결하기 (owner 2026-10-27). Where the account already has an owner, `keep` names the one that
 * stays and the other is deleted with its constellations, their stars and its invites: left unlinked it would keep a
 * live invite link filling a constellation nobody can open any more. The page asks first when it holds friends' stars.
 */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "link", async ({ repo, who }) => {
    const { keep } = await body(request, LinkBody);
    const { userId, deviceOwnerId } = await who();
    if (!userId) return fail("LOGIN_REQUIRED");
    if (!deviceOwnerId) return fail("NOT_FOUND");
    const account = await repo.ownerOfUser(userId);
    if (account) {
      if (!keep) return fail("BAD_INPUT", { field: "keep" });
      if (keep === "account") {
        await repo.deleteOwner(deviceOwnerId);
        return ok({ kept: "account" });
      }
      await repo.deleteOwner(account.id);
    }
    const linked = await repo.linkOwner(deviceOwnerId, userId);
    if (linked === "unsupported") return fail("NOT_CONFIGURED");
    if (linked === "taken") return fail("NOT_FOUND");
    return ok({ kept: "device" });
  });
}
