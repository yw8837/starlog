import { ImageResponse } from "next/og";
import { SITE } from "@/lib/config";
import { resolveInvite } from "@/lib/bonds/service";
import { normalizeCode } from "@/lib/bonds/text";
import { bondsRepo } from "@/lib/db";
import { OG_CARD, inviteOgImage, inviteOgText, type InviteOgData } from "@/lib/og/cardsImage";
import { ogFonts } from "@/lib/og/googleFont";

/**
 * GET → the invite link's OG card (1200×630): "용우님의 양자리 2/4". An unknown or revoked code gets the
 * generic card (link previews never show an error). Cached briefly, since the progress moves.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  if (!SITE.features.bonds) return new Response("Not found", { status: 404 });
  const { code } = await params;
  const host = new URL(SITE.url).host;
  let data: InviteOgData = { ownerNickname: null, sign: null, filled: 0, host };
  const clean = normalizeCode(code);
  if (clean) {
    try {
      const info = await resolveInvite(bondsRepo(), clean);
      data = { ownerNickname: info.ownerNickname, sign: info.sign, filled: info.filled, host };
    } catch {
      // unknown, revoked or unavailable: the generic card
    }
  }
  const text = inviteOgText(data);
  return new ImageResponse(inviteOgImage(data), {
    ...OG_CARD,
    fonts: await ogFonts(text.serif, text.sans),
    headers: { "Cache-Control": "public, max-age=600" },
  });
}
