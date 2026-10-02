import { SITE } from "./config";
import { GUIDE_ARTICLES, GUIDE_CATEGORY_LABEL, type GuideArticle } from "./guide";
import { FEED_URL, absoluteUrl } from "./hosts";

/**
 * /rss.xml: the guide articles as RSS 2.0, for feed readers and 네이버 서치어드바이저's RSS 제출 (it
 * picks up new and updated articles from it). Newest first; each item carries the 요약. The articles
 * and the feed itself are on the root domain (lib/hosts.ts), where the route answers as well as on
 * the app host.
 */

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** A YYYY-MM-DD date as RFC 822 at 0시 KST. */
export const rfc822 = (isoDate: string) => new Date(`${isoDate}T00:00:00+09:00`).toUTCString();

const itemXml = (article: GuideArticle) => {
  const url = absoluteUrl(`/guide/${article.slug}`);
  return [
    "<item>",
    `<title>${escapeXml(article.title)}</title>`,
    `<link>${url}</link>`,
    `<guid isPermaLink="true">${url}</guid>`,
    `<description>${escapeXml(article.summary ?? article.description)}</description>`,
    `<category>${GUIDE_CATEGORY_LABEL[article.category]}</category>`,
    ...(article.published ? [`<pubDate>${rfc822(article.published)}</pubDate>`] : []),
    "</item>",
  ].join("");
};

export function guideRss(articles: readonly GuideArticle[] = GUIDE_ARTICLES): string {
  const newest = [...articles].sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
  const updated = articles.map((article) => article.updated ?? "").sort().at(-1);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(`${SITE.nameKo} 가이드`)}</title>`,
    `<link>${absoluteUrl("/guide/tarot")}</link>`,
    `<description>${escapeXml("타로 카드 뜻과 읽는 법, 사주 명식 읽는 법을 차근차근 정리한 스타로그의 가이드 글이에요.")}</description>`,
    "<language>ko</language>",
    ...(updated ? [`<lastBuildDate>${rfc822(updated)}</lastBuildDate>`] : []),
    `<atom:link href="${FEED_URL}" rel="self" type="application/rss+xml"/>`,
    ...newest.map(itemXml),
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
}
