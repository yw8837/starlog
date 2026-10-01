import { z } from "zod";
import { body, bondsRoute, ok } from "@/lib/bonds/api";
import { readOwnerId } from "@/lib/bonds/identity";
import { BondsError, updateSettings } from "@/lib/bonds/service";

const SettingsBody = z.object({ rankingPublic: z.boolean().optional(), nickname: z.string().max(40).optional() });

/** POST {rankingPublic?, nickname?} → `랭킹에 내 이름 올리기` and the nickname. */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "settings", async ({ secret, now, cookies, repo }) => {
    const patch = await body(request, SettingsBody);
    const ownerId = await readOwnerId(cookies, secret);
    if (!ownerId) throw new BondsError("NO_OWNER");
    const owner = await updateSettings(repo, now, ownerId, patch);
    return ok({ owner: { nickname: owner.nickname, rankingPublic: owner.rankingPublic } });
  });
}
