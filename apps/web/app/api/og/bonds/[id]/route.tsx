import { ImageResponse } from "next/og";
import { allowed } from "@/lib/bonds/api";
import { SITE } from "@/lib/config";
import { BondsError, shareCard } from "@/lib/bonds/service";
import { bondsRepo } from "@/lib/db";
import { SHARE_SIZES, bondsShareImage, bondsShareText, bondsShareVersion, type ShareSize } from "@/lib/og/bondsImage";
import { fromCache, toCache } from "@/lib/og/edgeCache";
import { ogFonts } from "@/lib/og/googleFont";

/**
 * GET ?size=feed|story → the PNG share image of a completed constellation (1080×1350 or 1080×1920).
 * Public: it carries what the friends agreed to show (their nicknames), the sign, the owner's nickname,
 * total and all-time rank (when ranked and public) and the date. Never a friend's score or a birth date.
 * 404 for anything not complete. Every request counts against the per-network limit (BOND_VIEW_LIMITER),
 * cached answers too.
 *
 * The picture is read from the database on every request and cached at the edge under a key that carries
 * a fingerprint of everything it shows (`bondsShareVersion`): a changed rank, total, member or name is a
 * new key, so a render is only ever reused for the very same picture. Each render is also kept under the
 * id and size alone (the last picture), which is served while the database cannot be read instead of a
 * 503. Browsers are told to ask again.
 */

const TTL = 60 * 60;
/** How long the last picture stays on hand for a database outage: short, so a constellation deleted during an
 * outage stops showing soon (review 2026-10-08). */
const LAST_TTL = 6 * 60 * 60;

/** The same picture for the client, which must not keep it without asking: the rank can change at any time. */
function revalidated(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "private, no-cache");
  return new Response(res.body, { status: res.status, headers });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!SITE.features.bonds) return new Response("Not found", { status: 404 });
  const id = (await params).id.slice(0, 64);
  const size: ShareSize = new URL(request.url).searchParams.get("size") === "story" ? "story" : "feed";
  if (!(await allowed(request, "BOND_VIEW_LIMITER", Date.now()))) return new Response("Too many requests", { status: 429 });
  const base = `${new URL(SITE.url).origin}/api/og/bonds/${encodeURIComponent(id)}?size=${size}`;
  // its own key: the previous release cached under `base` itself and served it before reading the database,
  // so a rollback must never find this outage copy there
  const lastKey = `${base}&last=1`;

  let card: Awaited<ReturnType<typeof shareCard>>;
  try {
    card = await shareCard(bondsRepo(), id);
  } catch (error) {
    if (error instanceof BondsError) return new Response("Not found", { status: 404 });
    console.error(JSON.stringify({ evt: "og.bonds", error: error instanceof Error ? error.constructor.name : typeof error }));
    const last = await fromCache(lastKey);
    return last ? revalidated(last) : new Response("Unavailable", { status: 503 });
  }
  const data = { ...card, host: new URL(SITE.url).host };
  const key = `${base}&v=${bondsShareVersion(data)}`;
  const hit = await fromCache(key);
  if (hit) return revalidated(hit);
  const text = bondsShareText(data);
  const image = new ImageResponse(bondsShareImage(data, size), { ...SHARE_SIZES[size], fonts: await ogFonts(text.serif, text.sans) });
  return revalidated(await toCache(lastKey, await toCache(key, image, TTL), LAST_TTL));
}
