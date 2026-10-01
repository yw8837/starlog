import { ImageResponse } from "next/og";
import { SITE } from "@/lib/config";
import { STORY, luckyShareImage, luckyShareText } from "@/lib/og/cardsImage";
import { ogFonts } from "@/lib/og/googleFont";

/**
 * GET ?n=4-9-17-23-31-40&w=2026-09-28 → the lucky numbers as a 1080×1920 PNG with the notice. The
 * numbers come from /api/lucky; anything but six distinct numbers in 1-45 and a week id is refused.
 */
export async function GET(request: Request): Promise<Response> {
  if (!SITE.features.bonds) return new Response("Not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const numbers = (params.get("n") ?? "").split("-").map(Number);
  const weekId = params.get("w") ?? "";
  const valid =
    numbers.length === 6 &&
    new Set(numbers).size === 6 &&
    numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= 45) &&
    /^\d{4}-\d{2}-\d{2}$/.test(weekId);
  if (!valid) return new Response("Bad request", { status: 400 });
  const [, m, d] = weekId.split("-").map(Number) as [number, number, number];
  const data = { numbers: [...numbers].sort((a, b) => a - b), week: `${m}월 ${d}일부터 한 주`, host: new URL(SITE.url).host };
  const text = luckyShareText(data);
  return new ImageResponse(luckyShareImage(data), {
    ...STORY,
    fonts: await ogFonts(text.serif, text.sans),
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
