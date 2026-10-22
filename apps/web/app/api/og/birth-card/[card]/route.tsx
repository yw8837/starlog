import { ImageResponse } from "next/og";
import { birthCardOgPath, findBirthCard } from "@/lib/birthCard";
import { SITE } from "@/lib/config";
import { BIRTH_CARD_OG, birthCardOgImage, birthCardOgText } from "@/lib/og/birthCardImage";
import { fromCache, toCache } from "@/lib/og/edgeCache";
import { ogFonts } from "@/lib/og/googleFont";
import { inline } from "@/lib/share/og";

/**
 * GET → the 1200×630 link preview of /birth-card/<slug> (나를 닮은 타로 카드): the card's Starlog face, its
 * name and first trait. Only the 22 slugs exist; anything else is a 404 before anything is fetched. The
 * picture depends on the slug alone, so it is kept at the edge for a day under the slug's own address
 * (a query string never makes a new render).
 */

const TTL = 24 * 60 * 60;

export async function GET(request: Request, { params }: { params: Promise<{ card: string }> }): Promise<Response> {
  const card = findBirthCard((await params).card);
  if (!card) return new Response("Not found", { status: 404 });
  const key = `${new URL(SITE.url).origin}${birthCardOgPath(card.slug)}`;
  const hit = await fromCache(key);
  if (hit) return hit;

  const face = await inline(`${new URL(request.url).origin}/cards/og/starlog/${card.cardId}.jpg`, fetch);
  const data = { roman: card.roman, name: card.name, trait: card.traits[0], face, host: new URL(SITE.url).host };
  const text = birthCardOgText(data);
  const image = new ImageResponse(birthCardOgImage(data), { ...BIRTH_CARD_OG, fonts: await ogFonts(text.serif, text.sans) });
  return toCache(key, image, TTL);
}
