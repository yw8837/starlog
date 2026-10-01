import { ImageResponse } from "next/og";
import { z } from "zod";
import { CARDS } from "@starlog/core";
import { clientKey, readJson } from "@/lib/api/http";
import { SITE } from "@/lib/config";
import { STORY, chapterShareImage, chapterShareText } from "@/lib/og/cardsImage";
import { ogFonts } from "@/lib/og/googleFont";
import { rateLimit } from "@/lib/security/rateLimit";

const CARD_IDS = new Set(CARDS.map((card) => card.id));

const ChapterImageBody = z.object({
  /** the chapter's title, never the question or a note */
  title: z.string().trim().min(1).max(40).refine((title) => !/[\u0000-\u001f\u007f]/.test(title)),
  cards: z.array(z.object({ cardId: z.string().refine((id) => CARD_IDS.has(id)), orientation: z.enum(["upright", "reversed"]) })).min(1).max(3),
});

/** POST {title, cards} → a 1080×1920 chapter title card: the title and the cards, no question text. */
export async function POST(request: Request): Promise<Response> {
  if (!(await rateLimit("GEN_LIMITER", clientKey(request)))) return new Response("Too many requests", { status: 429 });
  const body = ChapterImageBody.safeParse(await readJson(request, 2_000));
  if (!body.success) return new Response("Bad request", { status: 400 });
  const data = { ...body.data, host: new URL(SITE.url).host };
  const text = chapterShareText(data);
  return new ImageResponse(chapterShareImage(data), {
    ...STORY,
    fonts: await ogFonts(text.serif, text.sans),
    headers: { "Cache-Control": "no-store" },
  });
}
