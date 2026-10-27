import type { Metadata } from "next";
import { BIRTH_CARD_PATH } from "./birthCard";
import { SITE } from "./config";
import { GUIDE_ABOUT_PATH, GUIDE_ARTICLES, GUIDE_CATEGORIES, articlesIn, guideIndexPath, lastReviewed } from "./guide";
import { GUIDE_EDITOR } from "./guideReview";
import { FEED_URL, absoluteUrl, isGuidePath, type SiteHost } from "./hosts";
import { INFO_PAGES } from "./infoPages";
import { KEYWORD_PATH } from "./keyword2027";
import { OG_ALT } from "./og";
import { PREMIUM_IDS, premiumPath } from "./premium/products";

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

/**
 * Templated result pages that exist to be shared (a 일주's keyword, a birth card): one page per answer, the same
 * for whoever opens it, so Search Console reads them as thin duplicates. Out of the index and the sitemaps, but
 * their links are followed and canonical and Open Graph stay, so a shared link still previews.
 */
export const NOINDEX_FOLLOW: NonNullable<Metadata["robots"]> = { index: false, follow: true };

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
  "1909년 원판 구도를 따른 스타로그 타로 카드와 만세력 사주로 내 질문에 맞춰 풀이해요. 무료 타로로 지금의 한 장과 오늘의 한 장을 볼 수 있어요.";

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
        ? { ...shared, type: "article", ...(publishedTime ? { publishedTime } : {}), ...(modifiedTime ? { modifiedTime } : {}), authors: [GUIDE_EDITOR.name] }
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

/**
 * One code, or several separated by commas: the guide domain and the app host are separate sites in
 * each console, each with its own code, and both hosts serve every tag (an extra one is harmless).
 */
function verificationCodes(value: string | undefined): string | string[] | undefined {
  const list = (value ?? "").split(",").map((code) => code.trim()).filter(Boolean);
  return list.length > 1 ? list : list[0];
}

/** <meta name="google-site-verification">, "naver-site-verification" and "msvalidate.01" (Bing). */
export function siteVerification(codes: VerificationCodes = VERIFICATION_ENV): Metadata["verification"] {
  const google = verificationCodes(codes.google);
  const naver = verificationCodes(codes.naver);
  const bing = verificationCodes(codes.bing);
  const other = { ...(naver ? { "naver-site-verification": naver } : {}), ...(bing ? { "msvalidate.01": bing } : {}) };
  if (!google && Object.keys(other).length === 0) return undefined;
  return { ...(google ? { google } : {}), ...(Object.keys(other).length ? { other } : {}) };
}

export type ChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export interface SitemapEntry {
  path: string;
  /** YYYY-MM-DD, only where the content carries its own date (guide articles). Never a date still ahead. */
  lastModified?: string;
  changeFrequency?: ChangeFrequency;
  priority?: number;
}

const latest = (dates: ReadonlyArray<string | undefined>): string | undefined =>
  dates.filter((date): date is string => Boolean(date)).sort().at(-1);

/**
 * Public, indexable pages of both hosts: the entry points, the free daily cards, the guide tabs and
 * every article (on the root domain), the service pages (about, how, help, FAQ), pricing and the
 * policies. `/guide` itself is a permanent redirect to the first tab (next.config.ts), so it is not
 * listed. Personal and in-progress screens never are (NOINDEX), nor are the 82 shared result pages (NOINDEX_FOLLOW), nor are 별자리 인연's /lucky and
 * /ranking and the twelve /ranking/<sign> pages: their lists load in the browser, so the server sends
 * only a "불러오는 중" shell, and no page links to them. sitemapEntriesFor splits them by host. The premium product
 * pages join with `premium` (STARLOG_PREMIUM=on, the sitemap route decides): never their samples or flow screens.
 */
export function sitemapEntries({ premium = false }: { premium?: boolean } = {}): SitemapEntry[] {
  return [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/tarot/new", changeFrequency: "monthly", priority: 0.9 },
    { path: "/saju/new", changeFrequency: "monthly", priority: 0.9 },
    { path: "/now", changeFrequency: "monthly", priority: 0.8 },
    { path: "/today", changeFrequency: "daily", priority: 0.8 },
    // 나를 닮은 타로 카드: the form only; its 22 result pages are noindex (NOINDEX_FOLLOW), so not listed.
    { path: BIRTH_CARD_PATH, changeFrequency: "monthly", priority: 0.7 },
    ...GUIDE_CATEGORIES.map(
      (category): SitemapEntry => ({
        path: guideIndexPath(category),
        lastModified: latest(articlesIn(category).map(lastReviewed)),
        changeFrequency: "weekly",
        priority: 0.8,
      }),
    ),
    ...GUIDE_ARTICLES.map(
      (article): SitemapEntry => ({ path: `/guide/${article.slug}`, lastModified: lastReviewed(article), changeFrequency: "monthly", priority: 0.7 }),
    ),
    // 가이드 소개와 편집 원칙: who writes the guide and how (no lastModified: the page carries no date of its own).
    { path: GUIDE_ABOUT_PATH, changeFrequency: "monthly", priority: 0.5 },
    ...Object.values(INFO_PAGES).map((page): SitemapEntry => ({ path: page.path, changeFrequency: "monthly", priority: 0.6 })),
    // 2027년 나의 키워드: the form only; its 60 일주 result pages are noindex (NOINDEX_FOLLOW), so not listed.
    { path: KEYWORD_PATH, changeFrequency: "monthly", priority: 0.7 },
    { path: "/pricing", changeFrequency: "monthly", priority: 0.5 },
    ...(premium ? PREMIUM_IDS.map((id): SitemapEntry => ({ path: premiumPath(id), changeFrequency: "monthly", priority: 0.5 })) : []),
    // No lastModified: the only date the policies carry is their 시행일, which can be ahead of today and is not when the text changed.
    ...["/refund", "/terms", "/privacy"].map((path): SitemapEntry => ({ path, changeFrequency: "yearly", priority: 0.2 })),
  ];
}

/** Every indexable path across both hosts' sitemaps. */
export const SITEMAP_PATHS: readonly string[] = sitemapEntries().map((entry) => entry.path);

/**
 * What one host's sitemap lists: the guide URLs on the root domain, every other page on the app host
 * (the app host's /guide URLs redirect to the root domain, so they are not listed there).
 */
export function sitemapEntriesFor(host: SiteHost, options: { premium?: boolean } = {}): SitemapEntry[] {
  return sitemapEntries(options).filter((entry) => isGuidePath(entry.path) === (host === "guide"));
}

/**
 * app/sitemap.xml/route.ts: one host's sitemap, as the sitemaps.org XML Next's own sitemap route
 * wrote (a `sitemap.ts` is handed no request, so a route reads the host and builds it).
 */
export function sitemapXml(host: SiteHost, options: { premium?: boolean } = {}): string {
  const urls = sitemapEntriesFor(host, options).flatMap(({ path, lastModified, changeFrequency, priority }) => [
    "<url>",
    `<loc>${absoluteUrl(path)}</loc>`,
    ...(lastModified ? [`<lastmod>${lastModified}</lastmod>`] : []),
    ...(changeFrequency ? [`<changefreq>${changeFrequency}</changefreq>`] : []),
    ...(priority === undefined ? [] : [`<priority>${priority}</priority>`]),
    "</url>",
  ]);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, "</urlset>", ""].join("\n");
}
