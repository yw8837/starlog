import { generateTarotTeaser } from "@/lib/ai/generate";
import { checkServerLimits, openGate } from "@/lib/api/http";
import { giveBackPlace, requireMember, takePlace } from "@/lib/api/member";
import { respondGeneration } from "@/lib/api/stream";
import { tarotContextFrom } from "@/lib/api/tarotRequest";
import { checkBot } from "@/lib/api/turnstile";
import { sealTeaser, teaserCut } from "@/lib/security/teaserSeal";
import { sealFreeShare } from "@/lib/share/freeSeal";
import { buildTarotFreePayload } from "@/lib/share/payload";

/**
 * POST {drawToken, input} → free teaser: every card's keyword, the first card's paragraph, the second card cut about
 * halfway (감질맛) with both cards sealed for the full reading to read on from, and the locked TOC. Never returns paid
 * text, nor the second card's hidden part as text. `share`: the free part as its share holds it, sealed (owner
 * 2026-10-23, lib/share/freeSeal.ts). Needs a login (owner 2026-11-04, lib/api/member.ts): a visitor gets 401
 * LOGIN_REQUIRED `reason: "teaser"` before the browser check and before anything is generated or counted; only a body that
 * cannot be read, or words that get the care screen (lib/crisis.ts), are answered before it. Spends one of the account's day teasers (counted on the
 * server, per account: a place taken before the generation and given back when it fails). Then a browser check when Turnstile is on (lib/api/turnstile.ts).
 * Streams NDJSON progress with `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  // The input first: words that state a thought of dying get the care screen, logged in or not (owner 2026-10-31 comes
  // before 2026-11-04); a passive wish's reading written with care is still a reading, so it asks for the login below.
  const parsed = await tarotContextFrom(request, gate);
  if (parsed instanceof Response) return parsed;
  const member = await requireMember(request, gate.secret, gate.now, "teaser");
  if (member instanceof Response) return member;
  const bot = await checkBot(request, gate);
  if (bot) return bot;
  const limited = await checkServerLimits(gate, "teaser");
  if (limited) return limited;
  // One of the account's day 맛보기, taken before the generation (D1, atomic); given back if it fails, kept if the client left.
  const place = await takePlace(gate, member, "teaser");
  if (place instanceof Response) return place;

  const writeTeaser = async (hooks: Parameters<typeof generateTarotTeaser>[2]) => {
    const { secondCard, ...teaser } = (await generateTarotTeaser(gate.provider, parsed.ctx, hooks)).data;
    const shown = secondCard ? { heading: secondCard.heading, body: teaserCut(secondCard.body) } : undefined;
    // What the free screen shows, cleaned like every share, sealed for 공유하기 (never the second card's hidden part).
    const free = buildTarotFreePayload(
      { templateId: parsed.draw.templateId, input: parsed.input, cards: parsed.draw.cards.map((card) => [card.cardId, card.orientation] as [string, typeof card.orientation]) },
      { first: teaser.firstCard, ...(shown ? { second: shown } : {}) },
    );
    const share = await sealFreeShare(free, gate.secret, gate.now);
    const body = secondCard
      ? {
          ...teaser,
          secondCard: { ...shown!, cut: true },
          seal: await sealTeaser([teaser.firstCard, secondCard], { drawToken: parsed.drawToken, input: parsed.input }, gate.secret, gate.now),
          share,
        }
      : { ...teaser, share };
    return { body, cookies: [] };
  };

  return respondGeneration(request, async (hooks) => {
    try {
      return await writeTeaser(hooks);
    } catch (error) {
      if (!hooks.signal?.aborted) await giveBackPlace(place);
      throw error;
    }
  }, { gate, spend: "teaser", care: parsed.care });
}
