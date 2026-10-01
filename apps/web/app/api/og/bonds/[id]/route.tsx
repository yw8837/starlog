import { ImageResponse } from "next/og";
import { allowed } from "@/lib/bonds/api";
import { SITE } from "@/lib/config";
import { BondsError, shareCard } from "@/lib/bonds/service";
import { bondsRepo } from "@/lib/db";
import { SHARE_SIZES, bondsShareImage, bondsShareText, type ShareSize } from "@/lib/og/bondsImage";
import { fromCache, toCache } from "@/lib/og/edgeCache";
import { ogFonts } from "@/lib/og/googleFont";

/**
 * GET ?size=feed|story → the PNG share image of a completed constellation (1080×1350 or 1080×1920).
 * Public: it carries only what the friends agreed to show (their nicknames), the sign, the total, the
 * owner's nickname and the date. 404 for anything not complete. Cached at the edge for an hour;
 * renders are limited per network (BOND_VIEW_LIMITER).
 */

const TTL = 60 * 60;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!SITE.features.bonds) return new Response("Not found", { status: 404 });
  const id = (await params).id.slice(0, 64);
  const size: ShareSize = new URL(request.url).searchParams.get("size") === "story" ? "story" : "feed";
  const key = `${new URL(SITE.url).origin}/api/og/bonds/${encodeURIComponent(id)}?size=${size}`;
  const hit = await fromCache(key);
  if (hit) return hit;
  if (!(await allowed(request, "BOND_VIEW_LIMITER", Date.now()))) return new Response("Too many requests", { status: 429 });

  let card: Awaited<ReturnType<typeof shareCard>>;
  try {
    card = await shareCard(bondsRepo(), id);
  } catch (error) {
    if (error instanceof BondsError) return new Response("Not found", { status: 404 });
    console.error(JSON.stringify({ evt: "og.bonds", error: error instanceof Error ? error.constructor.name : typeof error }));
    return new Response("Unavailable", { status: 503 });
  }
  const data = { ...card, host: new URL(SITE.url).host };
  const text = bondsShareText(data);
  const image = new ImageResponse(bondsShareImage(data, size), { ...SHARE_SIZES[size], fonts: await ogFonts(text.serif, text.sans) });
  return toCache(key, image, TTL);
}
