import { ImageResponse } from "next/og";
import { z } from "zod";
import { CARDS } from "@starlog/core";
import { MATCH_RELATIONS, RELATION_KO } from "@/lib/ai/prompts/match";
import { clientKey, readJson } from "@/lib/api/http";
import { SITE } from "@/lib/config";
import { PREMIUM_SHARE, STORY, premiumShareImage, premiumShareText } from "@/lib/og/cardsImage";
import { ogFonts } from "@/lib/og/googleFont";
import { PREMIUM } from "@/lib/premium/products";
import { rateLimit } from "@/lib/security/rateLimit";

const CARD_IDS = new Set(CARDS.map((card) => card.id));
const Card = z.object({ cardId: z.string().refine((id) => CARD_IDS.has(id)), orientation: z.enum(["upright", "reversed"]) }).strict();

/**
 * Only what a premium share may show (plan task 23, spec §9): the dealt cards, the relation's fixed name and the year's
 * own title. Every object is strict, so a question, a note, a name or label, a birth or the day masters (they come from
 * the partner's birth) is a 400, never drawn.
 */
const PremiumImageBody = z.discriminatedUnion("product", [
  z.object({ product: z.literal("tarot-deep"), cards: z.array(Card).length(10) }).strict(),
  z.object({ product: z.literal("match"), relation: z.enum(MATCH_RELATIONS), cards: z.array(Card).length(5) }).strict(),
  z.object({ product: z.literal("newyear-2027"), title: z.string().regex(/^[가-힣\s·,]{2,14}$/) }).strict(),
]);

/** POST {product, cards | relation+cards | title} → a 1080×1350 PNG (`?size=story`: 1080×1920). Nothing personal in it. */
export async function POST(request: Request): Promise<Response> {
  if (!(await rateLimit("GEN_LIMITER", clientKey(request)))) return new Response("Too many requests", { status: 429 });
  const body = PremiumImageBody.safeParse(await readJson(request, 4_000));
  if (!body.success) return new Response("Bad request", { status: 400 });
  const size = new URL(request.url).searchParams.get("size") === "story" ? STORY : PREMIUM_SHARE;
  const b = body.data;
  const headline =
    b.product === "tarot-deep" ? `${PREMIUM["tarot-deep"].name} · 카드 10장` : b.product === "match" ? `우리 사이 · ${RELATION_KO[b.relation]}` : `2027년, ${b.title.trim()}`;
  const data = { headline, cards: b.product === "newyear-2027" ? [] : b.cards, host: new URL(SITE.url).host, ...size };
  const text = premiumShareText(data);
  // Every field allowed in is the same for anyone who sends it, so the image may be cached.
  return new ImageResponse(premiumShareImage(data), { ...size, fonts: await ogFonts(text.serif, text.sans), headers: { "Cache-Control": "public, max-age=3600" } });
}
