import { ImageResponse } from "next/og";
import { SITE } from "@/lib/config";
import { codeGuard } from "@/lib/bonds/codeGuard";
import { BondsError, resolveInvite } from "@/lib/bonds/service";
import { normalizeCode } from "@/lib/bonds/text";
import { bondsRepo } from "@/lib/db";
import { OG_CARD, inviteOgImage, inviteOgText, type InviteOgData } from "@/lib/og/cardsImage";
import { cachedImage, fromCache, toCache } from "@/lib/og/edgeCache";
import { ogFonts } from "@/lib/og/googleFont";

/**
 * GET → the invite link's OG card (1200×630): "용우님의 양자리 2/4". Rendered cards are cached at the edge
 * for 10 minutes per code. A lookup counts like any code lookup (codeGuard): a code that does not
 * exist counts strictly, and it (or a blocked network) gets the generic card, rendered once and cached.
 */

const CODE_TTL = 600;
const GENERIC_TTL = 24 * 60 * 60;

async function render(data: InviteOgData): Promise<Response> {
  const text = inviteOgText(data);
  return new ImageResponse(inviteOgImage(data), { ...OG_CARD, fonts: await ogFonts(text.serif, text.sans) });
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  if (!SITE.features.bonds) return new Response("Not found", { status: 404 });
  const origin = new URL(SITE.url).origin;
  const host = new URL(SITE.url).host;
  const generic = () => cachedImage(`${origin}/api/og/invite/_generic`, GENERIC_TTL, () => render({ ownerNickname: null, sign: null, filled: 0, host }));

  const code = normalizeCode(safeDecode((await params).code));
  if (!code) return generic();
  const key = `${origin}/api/og/invite/${code}`;
  const hit = await fromCache(key);
  if (hit) return hit;

  const guard = codeGuard(request);
  if (!(await guard.allowed())) return generic();
  let data: InviteOgData;
  try {
    const info = await resolveInvite(bondsRepo(), code);
    data = { ownerNickname: info.ownerNickname, sign: info.sign, filled: info.filled, host };
  } catch (error) {
    if (error instanceof BondsError && error.code === "BAD_CODE") await guard.failed();
    return generic();
  }
  return toCache(key, await render(data), CODE_TTL);
}
