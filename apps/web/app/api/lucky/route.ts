import { z } from "zod";
import { LUCKY_NOTICE, kstWeekId, weeklyLucky, type BondBasis } from "@starlog/core";
import { BirthSchema, body, bondsRoute, ok } from "@/lib/bonds/api";
import { friendKey } from "@/lib/bonds/identity";
import { basisOf } from "@/lib/bonds/service";

/**
 * 이번 주 행운 번호 (spec §8): six numbers for this KST week, the same all week for the same person.
 * GET uses a 별자리 인연 owner's stored basis (`numbers: null` for anyone else); POST {birth} works for anyone (the date is used in the
 * request only). The seed is the owner id, else this device's id (hashed).
 */

const LuckyBody = z.object({ birth: BirthSchema });

function answer(basis: BondBasis, seedKey: string, now: number, cookies: Array<string | null> = []): Response {
  const weekId = kstWeekId(now);
  const { numbers, card } = weeklyLucky({ basis, seedKey, weekId });
  return ok({ weekId, numbers, card: { cardId: card.id, name: card.names.ko }, notice: LUCKY_NOTICE }, cookies);
}

export async function GET(request: Request): Promise<Response> {
  return bondsRoute(request, "lucky", async ({ secret, now, cookies, repo, who }) => {
    const ownerId = (await who()).ownerId;
    const owner = ownerId ? await repo.getOwner(ownerId) : null;
    // Not a 별자리 인연 owner on this device: nothing stored to go on, so the page asks for a birth date.
    if (!owner) return ok({ numbers: null });
    return answer(owner.basis, `owner:${owner.id}`, now);
  });
}

export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "lucky", async ({ secret, now, cookies, who }) => {
    const { birth } = await body(request, LuckyBody);
    const basis = basisOf(birth, now);
    const ownerId = (await who()).ownerId;
    if (ownerId) return answer(basis, `owner:${ownerId}`, now);
    const device = await friendKey(cookies, secret);
    return answer(basis, `device:${device.key}`, now, [device.setCookie]);
  });
}
