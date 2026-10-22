import { ImageResponse } from "next/og";
import { SITE } from "@/lib/config";
import { KEYWORD_TITLE, iljuBySlug } from "@/lib/keyword2027";
import { contentOf } from "@/lib/keyword2027Content";
import { cachedImage } from "@/lib/og/edgeCache";
import { ogFonts } from "@/lib/og/googleFont";
import { KEYWORD_OG, keywordOgImage, keywordOgText } from "@/lib/og/keywordImage";

/**
 * GET → one 일주's 2027 keyword card (1200×630), the og:image of /2027-keyword/<slug> and its Kakao message. Sixty
 * fixed pictures: only the slug is read (any query is ignored), anything else is a 404, and each is cached at the
 * edge for 30 days, so a popular link renders once per location.
 */

const TTL = 30 * 24 * 60 * 60;

export async function GET(_request: Request, { params }: { params: Promise<{ ilju: string }> }): Promise<Response> {
  const ilju = iljuBySlug((await params).ilju);
  if (!ilju) return new Response("Not found", { status: 404 });
  const data = { iljuKo: ilju.ko, keyword: contentOf(ilju).keyword, footer: `${KEYWORD_TITLE} · ${SITE.nameKo}`, host: new URL(SITE.url).host };
  return cachedImage(`${new URL(SITE.url).origin}/api/og/2027-keyword/${ilju.slug}`, TTL, async () => {
    const text = keywordOgText(data);
    return new ImageResponse(keywordOgImage(data), { ...KEYWORD_OG, fonts: await ogFonts(text.serif, text.sans) });
  });
}
