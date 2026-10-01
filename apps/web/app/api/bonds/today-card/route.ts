import { StarBody, body, bondsRoute, ok } from "@/lib/bonds/api";
import { readOwnerId } from "@/lib/bonds/identity";
import { BondsError, todayBondCard } from "@/lib/bonds/service";
import { todayLine } from "@/lib/bonds/todayLine";

/**
 * POST {starId} → 오늘의 인연 카드 with that friend: one card per day (KST), and its line (the model's,
 * up to 5 new ones per owner per day, else the rule-based one). Never changes a score or a rank.
 */
export async function POST(request: Request): Promise<Response> {
  return bondsRoute(request, "today-card", async ({ secret, now, cookies, repo }) => {
    const { starId } = await body(request, StarBody);
    const ownerId = await readOwnerId(cookies, secret);
    if (!ownerId) throw new BondsError("NO_OWNER");
    const card = await todayBondCard(repo, now, ownerId, starId);
    const line = await todayLine({ ownerId, starId, day: card.day, cardId: card.cardId, orientation: card.orientation, now });
    return ok({ card: { cardId: card.cardId, orientation: card.orientation }, day: card.day, line });
  });
}
