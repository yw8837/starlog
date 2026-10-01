import { ImageResponse } from "next/og";
import { clientKey, parseCookies } from "@/lib/api/http";
import { readDailyResult } from "@/lib/api/dailyStore";
import { SITE } from "@/lib/config";
import { kstMonthDay } from "@/lib/kst";
import { STORY, dailyShareImage, dailyShareText } from "@/lib/og/cardsImage";
import { ogFonts } from "@/lib/og/googleFont";
import { DAILY_COOKIE, readDaily } from "@/lib/security/dailyCookie";
import { kstDay } from "@/lib/security/quota";
import { rateLimit } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";

/**
 * GET → this device's 오늘의 한 장 as a 1080×1920 PNG: the card, its keyword and the one-line summary,
 * from the `sl_daily` cookie and the stored fortune. 404 until today's fortune exists.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = signingSecret();
  if (!secret) return new Response("Unavailable", { status: 503 });
  const now = Date.now();
  if (!(await rateLimit("GEN_LIMITER", clientKey(request), now))) return new Response("Too many requests", { status: 429 });
  const state = await readDaily(parseCookies(request)[DAILY_COOKIE], secret, now);
  if (!state || state.day !== kstDay(now)) return new Response("Not found", { status: 404 });
  const reading = await readDailyResult(state.did, state.day).catch(() => null);
  if (!reading) return new Response("Not found", { status: 404 });
  const data = {
    cardId: reading.card.cardId,
    orientation: reading.card.orientation,
    keyword: reading.card.keyword,
    summary: reading.summary,
    date: kstMonthDay(now),
    host: new URL(SITE.url).host,
  };
  const text = dailyShareText(data);
  return new ImageResponse(dailyShareImage(data), {
    ...STORY,
    fonts: await ogFonts(text.serif, text.sans),
    headers: { "Cache-Control": "private, max-age=600" },
  });
}
