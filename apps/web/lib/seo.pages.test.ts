import { CONSTELLATIONS } from "@starlog/core";
import type { Metadata } from "next";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { metadata as keywordMeta } from "@/app/2027-keyword/page";
import { generateMetadata as keywordResultMeta } from "@/app/2027-keyword/[ilju]/page";
import { metadata as aboutMeta } from "@/app/about/page";
import { metadata as accountDeletionMeta } from "@/app/account-deletion/page";
import { metadata as bInviteIndexMeta } from "@/app/b/page";
import { generateMetadata as bInviteMeta } from "@/app/b/[code]/page";
import { metadata as birthCardMeta } from "@/app/birth-card/page";
import { generateMetadata as birthCardResultMeta } from "@/app/birth-card/[card]/page";
import { metadata as bondsMeta } from "@/app/bonds/page";
import { generateMetadata as chapterMeta } from "@/app/chapter/[id]/page";
import { metadata as evidenceMeta } from "@/app/evidence/page";
import { metadata as faqMeta } from "@/app/faq/page";
import { generateMetadata as guideArticleMeta } from "@/app/guide/[slug]/page";
import { metadata as guideAboutMeta } from "@/app/guide/about/page";
import { metadata as guideSajuMeta } from "@/app/guide/saju/page";
import { metadata as guideTarotMeta } from "@/app/guide/tarot/page";
import { metadata as helpMeta } from "@/app/help/page";
import { metadata as howMeta } from "@/app/how/page";
import { metadata as layoutMeta } from "@/app/layout";
import { metadata as reviewLoginMeta } from "@/app/login/review/page";
import { generateMetadata as luckyMeta } from "@/app/lucky/page";
import { metadata as meMeta } from "@/app/me/page";
import { metadata as nowMeta } from "@/app/now/page";
import { metadata as ownerMeta } from "@/app/owner/page";
import { metadata as homeMeta } from "@/app/page";
import { metadata as pricingMeta } from "@/app/pricing/page";
import { generateMetadata as privacyMetadata } from "@/app/privacy/page";
import { generateMetadata as rankingSignMeta } from "@/app/ranking/[sign]/page";
import { metadata as rankingMeta } from "@/app/ranking/page";
import { metadata as refundMeta } from "@/app/refund/page";
import { metadata as sajuChartMeta } from "@/app/saju/chart/page";
import { metadata as sajuNewMeta } from "@/app/saju/new/page";
import { metadata as sajuGradeMeta } from "@/app/saju/grade/page";
import { metadata as sajuGradeHowMeta } from "@/app/saju/grade/how/page";
import { generateMetadata as sajuGradeSharedMeta } from "@/app/saju/grade/[slug]/page";
import { metadata as storyMeta } from "@/app/story/page";
import { metadata as tarotDrawMeta } from "@/app/tarot/draw/page";
import { metadata as tarotNewMeta } from "@/app/tarot/new/page";
import { metadata as tarotSituationMeta } from "@/app/tarot/new/situation/page";
import { metadata as tarotResultMeta } from "@/app/tarot/result/page";
import { generateMetadata as termsMetadata } from "@/app/terms/page";
import { generateMetadata as contactMetadata } from "@/app/contact/page";
import { metadata as todayMeta } from "@/app/today/page";
import { BIRTH_CARDS } from "./birthCard";
import { SITE } from "./config";
import { ALL_GUIDE_ARTICLES, GUIDE_ARTICLES, findArticle } from "./guide";
import { publishInstant } from "./guideMeta";
import { GUIDE_HOST_PAGES, absoluteUrl, isGuidePath } from "./hosts";
import { ILJU } from "./keyword2027";
import { GRADE_SLUGS } from "./sajuGrade";
import { HOME_TITLE, NOINDEX as NOINDEX_ROBOTS, SITEMAP_PATHS, sitemapEntriesFor } from "./seo";

// The root layout loads its fonts through the Next compiler, which is not running here.
vi.mock("next/font/google", () => ({ Gowun_Batang: () => ({ variable: "" }), Noto_Sans_KR: () => ({ variable: "" }) }));

/**
 * The SEO audit: every indexable page has a unique title (60 characters or less with the site
 * suffix), a description, a canonical equal to its address and its own Open Graph block with the
 * shared image; every personal or in-progress page is noindex; and the sitemaps list exactly the
 * indexable pages, each on its own host. A page's address is its path (resolved against the app
 * host), except the guide's: those pages live on the root domain, so theirs is the full URL there.
 */

/** Next's own resolver, which turns a page's `robots` into the <meta name="robots"> and <meta name="googlebot"> values. */
const { resolveRobots } = createRequire(import.meta.url)("next/dist/lib/metadata/resolvers/resolve-basics") as {
  resolveRobots: (robots: Metadata["robots"]) => { basic: string | null; googleBot: string | null } | null;
};

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) }) as never;

/** The Host header the pages both hosts serve (GUIDE_HOST_PAGES) read for their canonical: the app host unless a test says so. */
const request = vi.hoisted(() => ({ host: "starlog.yeolmaeapps.kr" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: request.host }) }));

/** Metadata of a page both hosts serve, as one host serves it. */
const SERVED_BOTH = { "/privacy": privacyMetadata, "/terms": termsMetadata, "/contact": contactMetadata } as const;
async function servedOn(host: string, path: keyof typeof SERVED_BOTH): Promise<Metadata> {
  request.host = host;
  const meta = await SERVED_BOTH[path]();
  request.host = "starlog.yeolmaeapps.kr";
  return meta;
}

/** The root layout's title template, which every page title that is a plain string goes through. */
const TITLE_TEMPLATE = (layoutMeta.title as { template: string }).template;

const INDEXABLE: Array<[path: string, meta: Metadata]> = [
  ["/", homeMeta],
  ["/tarot/new", tarotNewMeta],
  ["/saju/new", sajuNewMeta],
  ["/now", nowMeta],
  ["/today", todayMeta],
  ["/2027-keyword", keywordMeta],
  ["/guide/tarot", guideTarotMeta],
  ["/guide/saju", guideSajuMeta],
  ["/guide/about", guideAboutMeta],
  ["/about", aboutMeta],
  ["/how", howMeta],
  ["/evidence", evidenceMeta],
  ["/help", helpMeta],
  ["/faq", faqMeta],
  ["/pricing", pricingMeta],
  ["/refund", refundMeta],
  ["/account-deletion", accountDeletionMeta],
  ["/terms", await servedOn("starlog.yeolmaeapps.kr", "/terms")],
  ["/privacy", await servedOn("starlog.yeolmaeapps.kr", "/privacy")],
  ["/contact", await servedOn("starlog.yeolmaeapps.kr", "/contact")],
  ...(await Promise.all(GUIDE_ARTICLES.map(async (article) => [`/guide/${article.slug}`, await guideArticleMeta(params({ slug: article.slug }))] as [string, Metadata]))),
  ["/birth-card", birthCardMeta],
  // 올해의 사주 등급 and its rule page (spec 2026-11-11 B: the rule page is open to search)
  ["/saju/grade", sajuGradeMeta],
  ["/saju/grade/how", sajuGradeHowMeta],
];

/**
 * The 60 일주 and 22 birth-card result pages: one templated page per answer, the same for whoever opens it. Search Console read
 * them as thin duplicates ("크롤링됨 - 현재 색인이 생성되지 않음"), so they are noindex,follow and out of the sitemaps; the hubs
 * (/2027-keyword, /birth-card) are what search lists. Sharing keeps working: canonical and Open Graph stay.
 */
const RESULT_PAGES: Array<[path: string, meta: Metadata]> = [
  ...(await Promise.all(ILJU.map(async (ilju) => [`/2027-keyword/${ilju.slug}`, await keywordResultMeta(params({ ilju: ilju.slug }))] as [string, Metadata]))),
  ...(await Promise.all(BIRTH_CARDS.map(async (card) => [`/birth-card/${card.slug}`, await birthCardResultMeta(params({ card: card.slug }))] as [string, Metadata]))),
  // the 40 shared 사주 등급 cards: a year and a grade each, the same for whoever opens them
  ...(await Promise.all(GRADE_SLUGS.map(async (slug) => [`/saju/grade/${slug}`, await sajuGradeSharedMeta(params({ slug }))] as [string, Metadata]))),
];

/** In INDEXABLE for its own metadata, but out of the sitemaps (none since /ranking went noindex,follow). */
const UNLISTED: string[] = [];

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
  ["/login/review", reviewLoginMeta],
  // 이번 주 행운 번호 is drawn in the browser from a birth date: the server sends a form and a loading line (SEO P2-4).
  ["/lucky", await luckyMeta()],
  // Their lists load in the browser, so the server sends a "불러오는 중" shell: thin to a crawler.
  ...(await Promise.all(CONSTELLATIONS.map(async (sign) => [`/ranking/${sign.id}`, await rankingSignMeta(params({ sign: sign.id }))] as [string, Metadata]))),
];

/** The <title> the browser shows: the page title through the layout template, or the home default. */
function fullTitle(meta: Metadata): string {
  const title = meta.title;
  if (title === undefined || title === null) return HOME_TITLE;
  if (typeof title === "string") return TITLE_TEMPLATE.replace("%s", title);
  if ("absolute" in title) return title.absolute;
  return String(title.default);
}

describe("indexable pages", () => {
  it.each(INDEXABLE)("%s: title, description, canonical, og:url and the share image", (path, meta) => {
    const title = fullTitle(meta);
    expect(title.length, title).toBeLessThanOrEqual(60);
    const description = String(meta.description ?? "");
    const isArticle = /^\/guide\/(?!tarot$|saju$|about$)/.test(path);
    // Guide articles keep the guide's 80-character teaser; the other pages aim for 80-120.
    expect(description.length, description).toBeGreaterThanOrEqual(isArticle ? 20 : 60);
    expect(description.length, description).toBeLessThanOrEqual(isArticle ? 80 : 130);
    // A guide page's address is on the root domain, the tarot tab (the guide's home) at its own "/".
    const address = path === "/guide/tarot" ? `${SITE.guideUrl}/` : isGuidePath(path) ? `${SITE.guideUrl}${path}` : path;
    expect(meta.alternates?.canonical).toBe(address);
    expect(meta.robots).toBeUndefined();
    const og = meta.openGraph as { url?: string; images?: Array<{ url: string; width: number; height: number }>; locale?: string; type?: string };
    expect(og.url).toBe(address);
    expect(og.locale).toBe("ko_KR");
    expect(og.type).toBe(isArticle ? "article" : "website");
    // A card article leads with its card scan (600×1040, the image search has to index), then the shared picture (SEO audit 2026-10-27).
    const cardId = isArticle ? findArticle(path.slice("/guide/".length))?.cardId : undefined;
    if (cardId) expect(og.images?.map((image) => image.url)).toEqual([`/cards/${cardId}.webp`, "/opengraph-image"]);
    if (cardId) expect(og.images?.[0]).toMatchObject({ width: 600, height: 1040 });
    else expect(og.images?.[0]).toMatchObject({ url: "/opengraph-image", width: 1200, height: 630 });
  });

  it("gives every page its own title and description", () => {
    const titles = INDEXABLE.map(([, meta]) => fullTitle(meta));
    expect(new Set(titles).size).toBe(titles.length);
    const descriptions = INDEXABLE.map(([, meta]) => String(meta.description));
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("ends every page title with the Korean brand: the English name alone collides with a magazine in search", () => {
    expect(TITLE_TEMPLATE).toBe(`%s · ${SITE.nameKo}`);
    const suffixed = INDEXABLE.filter(([, meta]) => typeof meta.title === "string");
    expect(suffixed.length).toBeGreaterThan(GUIDE_ARTICLES.length);
    for (const [path, meta] of suffixed) expect(fullTitle(meta), path).toMatch(new RegExp(` · ${SITE.nameKo}$`));
  });

  it("is exactly the set the sitemaps list", () => {
    expect([...SITEMAP_PATHS].sort()).toEqual(INDEXABLE.map(([path]) => path).filter((path) => !UNLISTED.includes(path)).sort());
  });

  it("is listed by the sitemap of the host that serves it: guide pages on the root domain, the rest on the app host, the pages both serve on both", () => {
    const listed = { guide: sitemapEntriesFor("guide").map((entry) => entry.path), app: sitemapEntriesFor("app").map((entry) => entry.path) };
    for (const path of GUIDE_HOST_PAGES) {
      expect(listed.guide, path).toContain(path);
      expect(listed.app, path).toContain(path);
    }
    for (const [path] of INDEXABLE.filter(([path]) => !UNLISTED.includes(path) && !(GUIDE_HOST_PAGES as readonly string[]).includes(path))) {
      expect(listed[isGuidePath(path) ? "guide" : "app"], path).toContain(path);
      expect(listed[isGuidePath(path) ? "app" : "guide"], path).not.toContain(path);
    }
  });
});

describe("every sitemap URL", () => {
  it("is a page whose canonical is itself, on the host that lists it", async () => {
    const base = layoutMeta.metadataBase ?? undefined;
    const byPath = new Map(INDEXABLE);
    for (const host of ["app", "guide"] as const) {
      for (const { path } of sitemapEntriesFor(host)) {
        const both = host === "guide" && path in SERVED_BOTH;
        const meta = both ? await servedOn(new URL(SITE.guideUrl).host, path as keyof typeof SERVED_BOTH) : byPath.get(path);
        expect(meta, path).toBeDefined();
        const listed = new URL(both ? `${SITE.guideUrl}${path}` : absoluteUrl(path));
        expect(new URL(String(meta?.alternates?.canonical), base).toString(), `${host} ${path}`).toBe(listed.toString());
        expect(listed.origin, path).toBe(new URL(host === "guide" ? SITE.guideUrl : SITE.url).origin);
        expect(meta?.robots, path).toBeUndefined();
      }
    }
  });
});

describe("the pages the root domain serves besides the guide", () => {
  it("/privacy, /terms and /contact name the host that served them as canonical and og:url (AdSense audit 2026-11-06)", async () => {
    const base = layoutMeta.metadataBase;
    expect(base?.toString()).toBe(`${SITE.url}/`);
    for (const path of GUIDE_HOST_PAGES) {
      const onApp = await servedOn("starlog.yeolmaeapps.kr", path);
      expect(new URL(String(onApp.alternates?.canonical), base ?? undefined).toString(), path).toBe(`${SITE.url}${path}`);
      const onApex = await servedOn(new URL(SITE.guideUrl).host, path);
      expect(onApex.alternates?.canonical, path).toBe(`${SITE.guideUrl}${path}`);
      expect((onApex.openGraph as { url?: string }).url, path).toBe(`${SITE.guideUrl}${path}`);
    }
  });
});

describe("search result previews", () => {
  it("lets Google show large image previews and full-length snippets on every indexable page: set once, in the root layout", () => {
    expect(layoutMeta.robots).toEqual({ "max-image-preview": "large", googleBot: { "max-image-preview": "large", "max-snippet": -1 } });
    // What Next writes for it: <meta name="robots"> for every engine (Bing and the rest, SEO P2-16), and the googlebot tag.
    expect(resolveRobots(layoutMeta.robots)).toEqual({ basic: "max-image-preview:large", googleBot: "max-image-preview:large, max-snippet:-1" });
    // The indexable pages leave robots alone, so they inherit it.
    for (const [path, meta] of INDEXABLE) expect(meta.robots, path).toBeUndefined();
  });

  it("does not reach personal and in-progress pages: their own robots replaces the layout's whole, so they stay plain noindex", () => {
    for (const [path, meta] of NOINDEX) {
      expect(resolveRobots(meta.robots), path).toEqual({ basic: "noindex, nofollow", googleBot: null });
    }
    expect(resolveRobots(NOINDEX_ROBOTS)).toEqual({ basic: "noindex, nofollow", googleBot: null });
  });
});

describe("result pages (2027 keyword, birth card, 사주 등급)", () => {
  it("covers all 60 일주, 22 cards and 40 grade cards", () => {
    expect(RESULT_PAGES).toHaveLength(122);
  });

  it.each(RESULT_PAGES)("%s: noindex,follow (links still followed), never in the sitemap", (path, meta) => {
    expect(resolveRobots(meta.robots), path).toEqual({ basic: "noindex, follow", googleBot: null });
    expect(SITEMAP_PATHS).not.toContain(path);
  });

  it.each(RESULT_PAGES)("%s: a shared link keeps its canonical, og:url and its own preview image", (path, meta) => {
    expect(meta.alternates?.canonical).toBe(path);
    const og = meta.openGraph as { url?: string; images?: Array<{ url: string; width: number; height: number }>; locale?: string; type?: string };
    expect(og).toMatchObject({ url: path, locale: "ko_KR", type: "website" });
    // the grade cards' pictures are at /api/og/saju-grade/<slug> (spec 2026-11-11 C), the others under their own path
    const image = path.startsWith("/saju/grade/") ? `/api/og/saju-grade/${path.split("/").at(-1)}` : `/api/og${path}`;
    expect(og.images?.[0]).toMatchObject({ url: image, width: 1200, height: 630 });
    expect(String(meta.title).length).toBeGreaterThan(0);
  });

  it("leaves the two hubs indexable and listed", () => {
    for (const path of ["/2027-keyword", "/birth-card"]) {
      expect(INDEXABLE.map(([listed]) => listed)).toContain(path);
      expect(sitemapEntriesFor("app").map((entry) => entry.path)).toContain(path);
    }
  });
});

describe("query duplicates of the entry points", () => {
  it("/tarot/new and /saju/new canonicalise to their param-free address, so ?new=1 and other query variants fold into it", () => {
    for (const [path, meta] of [["/tarot/new", tarotNewMeta], ["/saju/new", sajuNewMeta]] as const) {
      expect(meta.alternates?.canonical, path).toBe(path);
      expect(String(meta.alternates?.canonical), path).not.toContain("?");
      expect(meta.robots, path).toBeUndefined();
    }
  });
});

describe("personal and in-progress pages", () => {
  it.each(NOINDEX)("%s: noindex, never in the sitemap", (path, meta) => {
    expect(meta.robots).toMatchObject({ index: false });
    expect(SITEMAP_PATHS).not.toContain(path);
  });
});

describe("the ranking index", () => {
  // SEO audit 2026-10-27 [M3]: thin to a crawler, so out of search and the sitemaps; its links to the twelve signs still count.
  it("is noindex,follow and in no sitemap, and a shared link keeps its canonical", () => {
    expect(resolveRobots(rankingMeta.robots)).toEqual({ basic: "noindex, follow", googleBot: null });
    expect(SITEMAP_PATHS).not.toContain("/ranking");
    expect(rankingMeta.alternates?.canonical).toBe("/ranking");
  });
});

describe("sign rankings", () => {
  it("are out of search only: a shared link keeps its title, description, canonical and preview image", async () => {
    for (const sign of CONSTELLATIONS) {
      const meta = await rankingSignMeta(params({ sign: sign.id }));
      expect(meta.robots, sign.id).toEqual(NOINDEX_ROBOTS);
      expect(meta.title, sign.id).toBe(`${sign.ko} 랭킹`);
      expect(String(meta.description), sign.id).toContain(sign.ko);
      expect(meta.alternates?.canonical, sign.id).toBe(`/ranking/${sign.id}`);
      expect(meta.openGraph, sign.id).toMatchObject({ url: `/ranking/${sign.id}`, locale: "ko_KR", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] });
    }
  });
});

describe("articles dated ahead (publishAt): the same metadata rules, checked before they come out", () => {
  it.each(ALL_GUIDE_ARTICLES.filter((article) => article.publishAt).map((article) => [article.slug, article] as const))("%s: from its day, a title, description, canonical and og:url of its own", async (slug, article) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(publishInstant(article.publishAt as string) - 60_000);
      expect(await guideArticleMeta(params({ slug }))).toEqual({});
      vi.setSystemTime(publishInstant(article.publishAt as string));
      const meta = await guideArticleMeta(params({ slug }));
      expect(fullTitle(meta).length).toBeLessThanOrEqual(60);
      const description = String(meta.description ?? "");
      expect(description.length).toBeGreaterThanOrEqual(20);
      expect(description.length).toBeLessThanOrEqual(80);
      expect(meta.alternates?.canonical).toBe(`${SITE.guideUrl}/guide/${slug}`);
      expect((meta.openGraph as { url?: string; type?: string }).url).toBe(`${SITE.guideUrl}/guide/${slug}`);
      expect(meta.robots).toBeUndefined();
      // every other page's title (once its day has come, INDEXABLE holds the article itself too)
      const titles = INDEXABLE.filter(([path]) => path !== `/guide/${slug}`).map(([, m]) => fullTitle(m));
      expect(titles).not.toContain(fullTitle(meta));
    } finally {
      vi.useRealTimers();
    }
  });
});
