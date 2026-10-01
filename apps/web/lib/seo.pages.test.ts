import { CONSTELLATIONS } from "@starlog/core";
import type { Metadata } from "next";
import { describe, expect, it } from "vitest";
import { metadata as aboutMeta } from "@/app/about/page";
import { metadata as bInviteIndexMeta } from "@/app/b/page";
import { generateMetadata as bInviteMeta } from "@/app/b/[code]/page";
import { metadata as bondsMeta } from "@/app/bonds/page";
import { generateMetadata as chapterMeta } from "@/app/chapter/[id]/page";
import { metadata as faqMeta } from "@/app/faq/page";
import { generateMetadata as guideArticleMeta } from "@/app/guide/[slug]/page";
import { metadata as guideSajuMeta } from "@/app/guide/saju/page";
import { metadata as guideTarotMeta } from "@/app/guide/tarot/page";
import { metadata as helpMeta } from "@/app/help/page";
import { metadata as howMeta } from "@/app/how/page";
import { metadata as luckyMeta } from "@/app/lucky/page";
import { metadata as meMeta } from "@/app/me/page";
import { metadata as nowMeta } from "@/app/now/page";
import { metadata as ownerMeta } from "@/app/owner/page";
import { metadata as homeMeta } from "@/app/page";
import { metadata as pricingMeta } from "@/app/pricing/page";
import { metadata as privacyMeta } from "@/app/privacy/page";
import { generateMetadata as rankingSignMeta } from "@/app/ranking/[sign]/page";
import { metadata as rankingMeta } from "@/app/ranking/page";
import { metadata as refundMeta } from "@/app/refund/page";
import { metadata as sajuChartMeta } from "@/app/saju/chart/page";
import { metadata as sajuNewMeta } from "@/app/saju/new/page";
import { metadata as storyMeta } from "@/app/story/page";
import { metadata as tarotDrawMeta } from "@/app/tarot/draw/page";
import { metadata as tarotNewMeta } from "@/app/tarot/new/page";
import { metadata as tarotSituationMeta } from "@/app/tarot/new/situation/page";
import { metadata as tarotResultMeta } from "@/app/tarot/result/page";
import { metadata as termsMeta } from "@/app/terms/page";
import { metadata as todayMeta } from "@/app/today/page";
import { SITE } from "./config";
import { GUIDE_ARTICLES } from "./guide";
import { HOME_TITLE, SITEMAP_PATHS } from "./seo";

/**
 * The SEO audit: every indexable page has a unique title (60 characters or less with the site
 * suffix), a description, a canonical equal to its address and its own Open Graph block with the
 * shared image; every personal or in-progress page is noindex; and the sitemap lists exactly the
 * indexable pages.
 */

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) }) as never;

const INDEXABLE: Array<[path: string, meta: Metadata]> = [
  ["/", homeMeta],
  ["/tarot/new", tarotNewMeta],
  ["/saju/new", sajuNewMeta],
  ["/now", nowMeta],
  ["/today", todayMeta],
  ["/guide/tarot", guideTarotMeta],
  ["/guide/saju", guideSajuMeta],
  ["/about", aboutMeta],
  ["/how", howMeta],
  ["/help", helpMeta],
  ["/faq", faqMeta],
  ["/pricing", pricingMeta],
  ["/refund", refundMeta],
  ["/terms", termsMeta],
  ["/privacy", privacyMeta],
  ["/lucky", luckyMeta],
  ["/ranking", rankingMeta],
  ...(await Promise.all(GUIDE_ARTICLES.map(async (article) => [`/guide/${article.slug}`, await guideArticleMeta(params({ slug: article.slug }))] as [string, Metadata]))),
  ...(await Promise.all(CONSTELLATIONS.map(async (sign) => [`/ranking/${sign.id}`, await rankingSignMeta(params({ sign: sign.id }))] as [string, Metadata]))),
];

const NOINDEX: Array<[path: string, meta: Metadata]> = [
  ["/chapter/sample", await chapterMeta(params({ id: "sample" }))],
  ["/story", storyMeta],
  ["/me", meMeta],
  ["/tarot/draw", tarotDrawMeta],
  ["/tarot/result", tarotResultMeta],
  ["/tarot/new/situation", tarotSituationMeta],
  ["/saju/chart", sajuChartMeta],
  ["/b", bInviteIndexMeta],
  ["/b/ABC234", await bInviteMeta(params({ code: "ABC234" }))],
  ["/bonds", bondsMeta],
  ["/owner", ownerMeta],
];

/** The <title> the browser shows: the page title through the layout template, or the home default. */
function fullTitle(meta: Metadata): string {
  const title = meta.title;
  if (title === undefined || title === null) return HOME_TITLE;
  if (typeof title === "string") return `${title} · ${SITE.name}`;
  if ("absolute" in title) return title.absolute;
  return String(title.default);
}

describe("indexable pages", () => {
  it.each(INDEXABLE)("%s: title, description, canonical, og:url and the share image", (path, meta) => {
    const title = fullTitle(meta);
    expect(title.length, title).toBeLessThanOrEqual(60);
    const description = String(meta.description ?? "");
    const isArticle = /^\/guide\/(?!tarot$|saju$)/.test(path);
    // Guide articles keep the guide's 80-character teaser; the other pages aim for 80-120.
    expect(description.length, description).toBeGreaterThanOrEqual(isArticle ? 20 : 60);
    expect(description.length, description).toBeLessThanOrEqual(isArticle ? 80 : 130);
    expect(meta.alternates?.canonical).toBe(path);
    expect(meta.robots).toBeUndefined();
    const og = meta.openGraph as { url?: string; images?: Array<{ url: string; width: number; height: number }>; locale?: string; type?: string };
    expect(og.url).toBe(path);
    expect(og.locale).toBe("ko_KR");
    expect(og.type).toBe(isArticle ? "article" : "website");
    expect(og.images?.[0]).toMatchObject({ url: "/opengraph-image", width: 1200, height: 630 });
  });

  it("gives every page its own title and description", () => {
    const titles = INDEXABLE.map(([, meta]) => fullTitle(meta));
    expect(new Set(titles).size).toBe(titles.length);
    const descriptions = INDEXABLE.map(([, meta]) => String(meta.description));
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("is exactly the set the sitemap lists", () => {
    expect([...SITEMAP_PATHS].sort()).toEqual(INDEXABLE.map(([path]) => path).sort());
  });
});

describe("personal and in-progress pages", () => {
  it.each(NOINDEX)("%s: noindex, never in the sitemap", (path, meta) => {
    expect(meta.robots).toMatchObject({ index: false });
    expect(SITEMAP_PATHS).not.toContain(path);
  });
});
