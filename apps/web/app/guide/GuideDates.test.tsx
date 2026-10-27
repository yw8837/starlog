// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuideArticlePage from "@/app/guide/[slug]/page";
import { SITE } from "@/lib/config";
import { GUIDE_DATES } from "@/lib/guide-articles/answers";
import { DAY_MASTER_ARTICLES } from "@/lib/guide-articles/day-masters";
import { SAJU_ARTICLES } from "@/lib/guide-articles/saju";
import { SAJU_CONCEPT_ARTICLES } from "@/lib/guide-articles/saju-concepts";
import { SPREAD_ARTICLES } from "@/lib/guide-articles/spreads";
import { MAJOR_ARCANA_ARTICLES } from "@/lib/guide-articles/tarot";
import { TAROT_BASICS_ARTICLES } from "@/lib/guide-articles/tarot-basics";
import { GUIDE_ARTICLES, lastReviewed } from "@/lib/guide";
import { sitemapXml } from "@/lib/seo";

/**
 * One date per article, everywhere: answers.ts GUIDE_DATES agrees with any date an article entry carries itself, and the
 * byline, the 이 글에 대해 box, the Article JSON-LD's dateModified and the root domain's sitemap lastmod all show it.
 */

vi.mock("next/script", async () => {
  const { createElement } = await import("react");
  return { default: ({ src }: { src: string }) => createElement("script", { "data-ads-src": src }) };
});

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", ""));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const ENTRIES = [...SPREAD_ARTICLES, ...TAROT_BASICS_ARTICLES, ...MAJOR_ARCANA_ARTICLES, ...SAJU_ARTICLES, ...SAJU_CONCEPT_ARTICLES, ...DAY_MASTER_ARTICLES];

/** lastmod per URL in the root domain's sitemap. */
const LASTMOD = new Map([...sitemapXml("guide").matchAll(/<loc>([^<]+)<\/loc>\n<lastmod>([^<]+)<\/lastmod>/g)].map((match) => [match[1], match[2]]));

describe("GUIDE_DATES and the articles' own dates", () => {
  it.each(ENTRIES.filter((entry) => entry.published || entry.updated).map((entry) => [entry.slug, entry] as const))("%s: the entry's own date is the one GUIDE_DATES holds", (slug, entry) => {
    const dates = GUIDE_DATES[slug];
    expect(dates, slug).toBeDefined();
    if (entry.published) expect(dates?.published).toBe(entry.published);
    if (entry.updated) expect(dates?.updated).toBe(entry.updated);
  });

  it("dates every article, the 22 card articles' last check 2026-10-27 (third review), the 29 saju articles' 2026-10-27 (saju third review)", () => {
    for (const article of GUIDE_ARTICLES) expect(GUIDE_DATES[article.slug], article.slug).toBeDefined();
    const cards = GUIDE_ARTICLES.filter((article) => article.cardId);
    expect(cards).toHaveLength(22);
    for (const card of cards) expect(lastReviewed(card), card.slug).toBe("2026-10-27");
    const saju = [...SAJU_ARTICLES, ...SAJU_CONCEPT_ARTICLES, ...DAY_MASTER_ARTICLES];
    expect(saju).toHaveLength(29);
    for (const entry of saju) expect(GUIDE_DATES[entry.slug]?.updated, entry.slug).toBe("2026-10-27");
  });
});

describe("the same date on the page, in the JSON-LD and in the sitemap", () => {
  it.each(GUIDE_ARTICLES.map((article) => [article.slug] as const))("%s", async (slug) => {
    const dates = GUIDE_DATES[slug] as { published: string; updated: string };
    const { container } = render(await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">));
    const byline = [...container.querySelectorAll("article header p")].find((p) => p.textContent?.startsWith("글·검토"));
    expect([...(byline?.querySelectorAll("time") ?? [])].map((time) => time.getAttribute("datetime"))).toEqual([dates.published, dates.updated]);
    const box = container.querySelector('section[aria-labelledby="trust-title"]');
    expect([...(box?.querySelectorAll("time") ?? [])].map((time) => time.getAttribute("datetime"))).toEqual([dates.published, dates.updated]);
    const article = [...container.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => JSON.parse(script.textContent ?? "null") as { "@type"?: string; datePublished?: string; dateModified?: string } | null)
      .find((node) => node?.["@type"] === "Article");
    expect(article).toMatchObject({ datePublished: dates.published, dateModified: dates.updated });
    expect(LASTMOD.get(`${SITE.guideUrl}/guide/${slug}`)).toBe(dates.updated);
  });
});
