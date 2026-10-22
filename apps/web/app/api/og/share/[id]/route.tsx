import { ImageResponse } from "next/og";
import { clientKey } from "@/lib/api/http";
import { accountDb } from "@/lib/db";
import { SHARE_OG, shareOgImage, shareOgText } from "@/lib/og/cardsImage";
import { ogFonts } from "@/lib/og/googleFont";
import { rateLimit } from "@/lib/security/rateLimit";
import { shareOgData, withInlineFaces } from "@/lib/share/og";
import { findShare } from "@/lib/share/store";

/**
 * GET → the 1200×630 link preview of a shared reading; 404 once it is no longer shared. Every request
 * counts against the per-network limit the bonds share images use (BOND_VIEW_LIMITER).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!(await rateLimit("BOND_VIEW_LIMITER", clientKey(request)))) return new Response("Too many requests", { status: 429 });
  const db = accountDb();
  const share = db ? await findShare(db, (await params).id) : null;
  if (!share) return new Response("Not found", { status: 404 });
  const data = await withInlineFaces(shareOgData(share.payload, new URL(request.url).origin));
  const text = shareOgText(data);
  return new ImageResponse(shareOgImage(data), {
    ...SHARE_OG,
    fonts: await ogFonts(text.serif, text.sans),
    // A share only changes by being stopped; for an hour after that a cached preview can still show it: the card
    // names, and for saju its first line (the glance's 올해 or the first sentence), for 오늘의 한 장 its summary.
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
