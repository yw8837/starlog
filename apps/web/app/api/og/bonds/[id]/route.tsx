import { ImageResponse } from "next/og";
import { SITE } from "@/lib/config";
import { BondsError, shareCard } from "@/lib/bonds/service";
import { bondsRepo } from "@/lib/db";
import { SHARE_SIZES, bondsShareImage, bondsShareText, type ShareSize } from "@/lib/og/bondsImage";
import { ogFonts } from "@/lib/og/googleFont";

/**
 * GET ?size=feed|story → the PNG share image of a completed constellation (1080×1350 or 1080×1920).
 * Public: it carries only what the friends agreed to show (their nicknames), the sign, the total, the
 * owner's nickname and the date. 404 for anything not complete.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!SITE.features.bonds) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const size: ShareSize = new URL(request.url).searchParams.get("size") === "story" ? "story" : "feed";
  let card: Awaited<ReturnType<typeof shareCard>>;
  try {
    card = await shareCard(bondsRepo(), id.slice(0, 64));
  } catch (error) {
    if (error instanceof BondsError) return new Response("Not found", { status: 404 });
    console.error(JSON.stringify({ evt: "og.bonds", error: error instanceof Error ? error.constructor.name : typeof error }));
    return new Response("Unavailable", { status: 503 });
  }
  const data = { ...card, host: new URL(SITE.url).host };
  const text = bondsShareText(data);
  return new ImageResponse(bondsShareImage(data, size), {
    ...SHARE_SIZES[size],
    fonts: await ogFonts(text.serif, text.sans),
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
