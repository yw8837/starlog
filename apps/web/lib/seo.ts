import type { Metadata } from "next";
import { CONSTELLATIONS } from "@starlog/core";
import { SITE } from "./config";
import { GUIDE_ARTICLES, GUIDE_CATEGORIES, articlesIn, guideIndexPath } from "./guide";
import { FEED_URL, absoluteUrl, isGuidePath, type SiteHost } from "./hosts";
import { INFO_PAGES } from "./infoPages";
import { LEGAL_EFFECTIVE_DATE } from "./legal";
import { OG_ALT } from "./og";

/**
 * Every not-found state has this title and stays out of search: app/not-found.tsx, and each page
 * that calls notFound() returns it from its metadata too (otherwise the page's own title shows).
 */
export const NOT_FOUND_METADATA: Metadata = { title: "페이지를 찾을 수 없어요", robots: { index: false, follow: false } };

/**
 * Personal readings, stories, invites, the account page, in-progress flow screens (카드 뽑기, 풀이
 * 결과, 상황 고르기, 명식) and dev screens: never in search results (spec §10).
 */
export const NOINDEX: NonNullable<Metadata["robots"]> = { index: false, follow: false };

/** og:site_name, as Kakao and the other link previews show it. */
export const OG_SITE_NAME = `${SITE.name} · ${SITE.nameKo}`;

/** The shared Open Graph image (app/opengraph-image.tsx). A page's openGraph replaces the layout's, so each page repeats it. */
export const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: OG_ALT } as const;

/** <link rel="alternate" type="application/rss+xml">: the guide articles' feed (app/rss.xml/route.ts), on the root domain with the articles. */
export const FEED_ALTERNATES = { "application/rss+xml": [{ url: FEED_URL, title: `${SITE.nameKo} 가이드` }] };

/** The home's title and the default for pages without one: brand first, then what the site is for. */
export const HOME_TITLE = `${SITE.nameKo}(${SITE.name}) · 내 질문에 맞춘 타로와 사주 풀이`;

/** The home's meta description and the default for pages without one. */
export const HOME_DESCRIPTION =
  "고양이 점성술사가 1909년 원판 타로 카드로, 한복 입은 토끼 선생님이 만세력으로 세운 사주 명식으로 내 질문에 맞춰 풀이해요. 지금의 한 장과 오늘의 한 장은 무료예요.";

interface PageMetadataInput {
  /** Leave out to keep the layout's default title (the home). */
  title?: Metadata["title"];
  description: string;
  /** Canonical path, also og:url. A guide path (/guide/…) becomes a full URL on the root domain. */
  path: string;
  type?: "website" | "article";
  /** YYYY-MM-DD, for article pages. */
  publishedTime?: string;
  modifiedTime?: string;
}

/**
 * Title, description, canonical and Open Graph for an indexable page. og:title and og:description
 * follow the page's title and description (Next fills them in), Twitter follows Open Graph, and the
 * layout sets the large-image Twitter card. Paths resolve against metadataBase (the app host), except
 * the guide's: those pages live on the root domain, so their canonical and og:url name it in full,
 * whichever host serves them.
 */
export function pageMetadata({ title, description, path, type = "website", publishedTime, modifiedTime }: PageMetadataInput): Metadata {
  const url = isGuidePath(path) ? absoluteUrl(path) : path;
  const shared = { url, siteName: OG_SITE_NAME, locale: "ko_KR", images: [{ ...OG_IMAGE }] };
  return {
    ...(title === undefined ? {} : { title }),
    description,
    // A page's alternates replace the layout's, so the feed link rides along with the canonical.
    alternates: { canonical: url, types: FEED_ALTERNATES },
    openGraph:
      type === "article"
        ? { ...shared, type: "article", ...(publishedTime ? { publishedTime } : {}), ...(modifiedTime ? { modifiedTime } : {}), authors: [SITE.business.name] }
        : { ...shared, type: "website" },
  };
}

type VerificationCodes = { google?: string; naver?: string; bing?: string };

/**
 * Search console ownership codes, read at build time (NEXT_PUBLIC_*, inlined like the bonds flag) so
 * the owner adds them in .env.local without a code change. Empty values add no tag.
 */
const VERIFICATION_ENV: VerificationCodes = {
  google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  naver: process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION,
  bing: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
};

/** <meta name="google-site-verification">, "naver-site-verification" and "msvalidate.01" (Bing). */
export function siteVerification(codes: VerificationCodes = VERIFICATION_ENV): Metadata["verification"] {
  const google = codes.google?.trim();
  const naver = codes.naver?.trim();
  const bing = codes.bing?.trim();
  const other = { ...(naver ? { "naver-site-verification": naver } : {}), ...(bing ? { "msvalidate.01": bing } : {}) };
  if (!google && Object.keys(other).length === 0) return undefined;
  return { ...(google ? { google } : {}), ...(Object.keys(other).length ? { other } : {}) };
}

export type ChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export interface SitemapEntry {
  path: string;
  /** YYYY-MM-DD, only where the content carries its own date (guide articles, the policies). */
  lastModified?: string;
  changeFrequency?: ChangeFrequency;
  priority?: number;
}

const latest = (dates: ReadonlyArray<string | undefined>): string | undefined =>
  dates.filter((date): date is string => Boolean(date)).sort().at(-1);

/**
 * Public, indexable pages of both hosts: the entry points, the free daily cards, the guide tabs and
 * every article (on the root domain), the service pages (about, how, help, FAQ), pricing, the
 * policies, and with 별자리 인연 the weekly lucky numbers and the sign rankings. `/guide` itself is a
 * permanent redirect to the first tab (next.config.ts), so it is not listed. Personal and
 * in-progress screens never are (NOINDEX). sitemapEntriesFor splits them by host.
 */
export function sitemapEntries(site: { features: { bonds: boolean } } = SITE): SitemapEntry[] {
  return [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/tarot/new", changeFrequency: "monthly", priority: 0.9 },
    { path: "/saju/new", changeFrequency: "monthly", priority: 0.9 },
    { path: "/now", changeFrequency: "monthly", priority: 0.8 },
    { path: "/today", changeFrequency: "daily", priority: 0.8 },
    ...GUIDE_CATEGORIES.map(
      (category): SitemapEntry => ({
        path: guideIndexPath(category),
        lastModified: latest(articlesIn(category).map((article) => article.updated)),
        changeFrequency: "weekly",
        priority: 0.8,
      }),
    ),
    ...GUIDE_ARTICLES.map(
      (article): SitemapEntry => ({ path: `/guide/${article.slug}`, lastModified: article.updated, changeFrequency: "monthly", priority: 0.7 }),
    ),
    ...Object.values(INFO_PAGES).map((page): SitemapEntry => ({ path: page.path, changeFrequency: "monthly", priority: 0.6 })),
    { path: "/pricing", changeFrequency: "monthly", priority: 0.5 },
    ...["/refund", "/terms", "/privacy"].map((path): SitemapEntry => ({ path, lastModified: LEGAL_EFFECTIVE_DATE, changeFrequency: "yearly", priority: 0.2 })),
    // 이번 주 행운 번호 and the rankings ship with 별자리 인연 (SITE.features.bonds)
    ...(site.features.bonds
      ? [
          { path: "/lucky", changeFrequency: "weekly", priority: 0.5 } satisfies SitemapEntry,
          { path: "/ranking", changeFrequency: "daily", priority: 0.5 } satisfies SitemapEntry,
          ...CONSTELLATIONS.map((sign): SitemapEntry => ({ path: `/ranking/${sign.id}`, changeFrequency: "daily", priority: 0.4 })),
        ]
      : []),
  ];
}

/** Every indexable path across both hosts' sitemaps. */
export const SITEMAP_PATHS: readonly string[] = sitemapEntries().map((entry) => entry.path);

/**
 * What one host's sitemap lists: the guide URLs on the root domain, every other page on the app host
 * (the app host's /guide URLs redirect to the root domain, so they are not listed there).
 */
export function sitemapEntriesFor(host: SiteHost, site: { features: { bonds: boolean } } = SITE): SitemapEntry[] {
  return sitemapEntries(site).filter((entry) => isGuidePath(entry.path) === (host === "guide"));
}

/**
 * app/sitemap.xml/route.ts: one host's sitemap, as the sitemaps.org XML Next's own sitemap route
 * wrote (a `sitemap.ts` cannot see the request's host, so the route builds it).
 */
export function sitemapXml(host: SiteHost, site: { features: { bonds: boolean } } = SITE): string {
  const urls = sitemapEntriesFor(host, site).flatMap(({ path, lastModified, changeFrequency, priority }) => [
    "<url>",
    `<loc>${absoluteUrl(path)}</loc>`,
    ...(lastModified ? [`<lastmod>${lastModified}</lastmod>`] : []),
    ...(changeFrequency ? [`<changefreq>${changeFrequency}</changefreq>`] : []),
    ...(priority === undefined ? [] : [`<priority>${priority}</priority>`]),
    "</url>",
  ]);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, "</urlset>", ""].join("\n");
}
