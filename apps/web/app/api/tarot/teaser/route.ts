import { generateTarotTeaser } from "@/lib/ai/generate";
import { checkQuota, openGate, spendCookies } from "@/lib/api/http";
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
 * 2026-10-23, lib/share/freeSeal.ts). Spends one teaser only after a validated generation.
 * A browser check first when Turnstile is on (lib/api/turnstile.ts).
 * Streams NDJSON progress with `Accept: application/x-ndjson`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await openGate(request);
  if (gate instanceof Response) return gate;
  const bot = await checkBot(request, gate);
  if (bot) return bot;
  const parsed = await tarotContextFrom(request, gate);
  if (parsed instanceof Response) return parsed;
  const quota = await checkQuota(gate, "teaser");
  if (quota instanceof Response) return quota;

  return respondGeneration(request, async (hooks) => {
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
    return { body, cookies: await spendCookies(gate, quota, "teaser") };
  }, { gate, spend: "teaser" });
}
