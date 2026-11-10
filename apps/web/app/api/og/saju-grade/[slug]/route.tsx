import { ImageResponse } from "next/og";
import { SITE } from "@/lib/config";
import { fromCache, toCache } from "@/lib/og/edgeCache";
import { GRADE_OG, GRADE_STORY, gradeOgImage, gradeOgText } from "@/lib/og/gradeImage";
import { ogFonts } from "@/lib/og/googleFont";
import { currentGradeYear, gradeLine, gradeSlug, parseGradeSlug, yearName } from "@/lib/sajuGrade";
import { inline } from "@/lib/share/og";

/**
 * GET → the picture of a shared 사주 등급 card (/saju/grade/<year>-<grade>, spec 2026-11-11 C): 1200×630 for link previews, or
 * 1080×1920 with ?size=story (the story image button). It knows the slug alone (no birth, no observation, no share); anything
 * parseGradeSlug refuses (a year outside 2026–2085, any other shape) is a 404 before anything is fetched. Kept at the edge a day
 * under the slug's address and size.
 */

const TTL = 24 * 60 * 60;
/** Drawn without 사주주 (the PNG could not be read): sent briefly and never kept, so the next request tries again. */
const FALLBACK_TTL = 5 * 60;
const ART = "/characters/og/rabbit-hanbok.v2-600.png";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const card = parseGradeSlug((await params).slug);
  if (!card) return new Response("Not found", { status: 404 });
  const story = new URL(request.url).searchParams.get("size") === "story";
  const key = `${new URL(SITE.url).origin}/api/og/saju-grade/${gradeSlug(card.year, card.grade)}${story ? "?size=story" : ""}`;
  const hit = await fromCache(key);
  if (hit) return hit;

  const thisYear = card.year === currentGradeYear();
  const art = await inline(`${new URL(request.url).origin}${ART}`, fetch);
  const data = {
    eyebrow: `${yearName(card)} · ${thisYear ? "올해의 사주 등급" : "사주 등급"}`,
    grade: card.grade,
    nickname: card.nickname,
    line: gradeLine(card.grade, thisYear),
    art,
    host: new URL(SITE.url).host,
  };
  const size = story ? GRADE_STORY : GRADE_OG;
  const text = gradeOgText(data);
  const image = new ImageResponse(gradeOgImage(data, size), { ...size, fonts: await ogFonts(text.serif, text.sans) });
  if (!art) {
    const headers = new Headers(image.headers);
    headers.set("Cache-Control", `public, max-age=${FALLBACK_TTL}`);
    return new Response(image.body, { status: image.status, headers });
  }
  return toCache(key, image, TTL);
}
