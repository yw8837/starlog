import { z } from "zod";
import { BirthSchema, allowed, body, bondsRoute, fail, ok } from "@/lib/bonds/api";
import { codeGuard } from "@/lib/bonds/codeGuard";
import { friendKey } from "@/lib/bonds/identity";
import { BondsError, joinStar } from "@/lib/bonds/service";

const JoinBody = z.object({
  code: z.string().max(32),
  nickname: z.string().max(40),
  /** used for the score inside this request only: never stored, logged or echoed */
  birth: BirthSchema,
  pick: z.number().int().min(0).max(20),
  message: z.string().max(200).nullish(),
  /** the form showed the score notice (owner 2026-10-23): only then may this star's score show on the owner's share */
  scoreNotice: z.boolean().optional(),
});

/** POST → a friend becomes the next star of the owner's constellation. */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "join", async ({ secret, now, cookies, repo, who }) => {
    if (!(await allowed(request, "BOND_JOIN_LIMITER", now))) return fail("RATE_LIMIT");
    const guard = codeGuard(request, now);
    if (!(await guard.allowed())) return fail("RATE_LIMIT");
    const input = await body(request, JoinBody);
    const device = await friendKey(cookies, secret);
    let result: Awaited<ReturnType<typeof joinStar>>;
    try {
      result = await joinStar(repo, now, { ...input, friendKey: device.key, joinerOwnerId: (await who()).ownerId });
    } catch (error) {
      if (error instanceof BondsError && error.code === "BAD_CODE") await guard.failed();
      throw error;
    }
    return ok(
      {
        nickname: result.star.nickname,
        score: result.score,
        parts: result.parts,
        completed: result.completed,
        sign: result.sign,
        slot: result.star.slot,
        starId: result.star.id,
        ownerNickname: result.ownerNickname,
        card: result.card,
        bondLine: result.bondLine,
      },
      [device.setCookie],
    );
  });
}
