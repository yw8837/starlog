import { z } from "zod";
import { BirthSchema, allowed, body, bondsRoute, fail, ok } from "@/lib/bonds/api";
import { friendKey, readOwnerId } from "@/lib/bonds/identity";
import { joinStar } from "@/lib/bonds/service";

const JoinBody = z.object({
  code: z.string().max(32),
  nickname: z.string().max(40),
  /** used for the score inside this request only: never stored, logged or echoed */
  birth: BirthSchema,
  pick: z.number().int().min(0).max(20),
  message: z.string().max(200).nullish(),
});

/** POST → a friend becomes the next star of the owner's constellation. */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "join", async ({ secret, now, cookies, repo }) => {
    if (!(await allowed(request, "BOND_JOIN_LIMITER", now))) return fail("RATE_LIMIT");
    const input = await body(request, JoinBody);
    const device = await friendKey(cookies, secret);
    const result = await joinStar(repo, now, {
      ...input,
      friendKey: device.key,
      joinerOwnerId: await readOwnerId(cookies, secret),
    });
    return ok(
      {
        nickname: result.star.nickname,
        score: result.score,
        parts: result.parts,
        completed: result.completed,
        sign: result.sign,
        slot: result.star.slot,
        ownerNickname: result.ownerNickname,
        card: result.card,
        bondLine: result.bondLine,
      },
      [device.setCookie],
    );
  });
}
