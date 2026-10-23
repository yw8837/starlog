// @vitest-environment jsdom
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuideArticlePage, { generateMetadata as articleMetadata } from "@/app/guide/[slug]/page";
import { SITE } from "@/lib/config";
import { guideReferences } from "@/lib/evidence";
import { GUIDE_ABOUT_PATH, GUIDE_ARTICLES, lastReviewed, type GuideArticle } from "@/lib/guide";
import { INFO_PAGES } from "@/lib/infoPages";
import { guideArticleJsonLd } from "@/lib/jsonld";
import { koreanDate } from "@/lib/legal";
import { sitemapEntriesFor } from "@/lib/seo";

/**
 * Site-level trust on every guide article (AdSense "가치가 별로 없는 콘텐츠", Search Central's Who/How/Why): who writes
 * and checks it, when it was first written and last checked, and what it rests on, by category, never hand-typed.
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

const renderSlug = async (slug: string) => render(await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">));
const trustBox = (container: HTMLElement) => container.querySelector<HTMLElement>('section[aria-labelledby="trust-title"]');
const byline = (container: HTMLElement) => [...container.querySelectorAll("article header p")].find((p) => p.textContent?.startsWith("글·검토")) as HTMLElement | undefined;

describe("마지막 검토: one date for the byline, the trust box, JSON-LD and the sitemap", () => {
  it("is the article's last content change, or its first publication when it has none", () => {
    const base: Pick<GuideArticle, "published" | "updated"> = { published: "2026-10-01" };
    expect(lastReviewed(base)).toBe("2026-10-01");
    expect(lastReviewed({ ...base, updated: "2026-10-14" })).toBe("2026-10-14");
    expect(lastReviewed({})).toBeUndefined();
  });

  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: a first and a last-checked date, the JSON-LD and metadata carry the same", async (slug, article) => {
    const reviewed = lastReviewed(article);
    expect(article.published, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(reviewed, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(guideArticleJsonLd(article)).toMatchObject({ datePublished: article.published, dateModified: reviewed });
    const meta = await articleMetadata({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">);
    expect(meta.openGraph).toMatchObject({ publishedTime: article.published, modifiedTime: reviewed });
    expect(sitemapEntriesFor("guide").find((entry) => entry.path === `/guide/${slug}`)?.lastModified).toBe(reviewed);
  });

  it("points the Article JSON-LD at the editorial page as its publishing principles", () => {
    const article = GUIDE_ARTICLES[0] as GuideArticle;
    expect(guideArticleJsonLd(article)).toMatchObject({ publishingPrinciples: `${SITE.guideUrl}${GUIDE_ABOUT_PATH}` });
  });
});

describe("the sources a guide article names, by category", () => {
  it("tarot: the 1909 deck and Waite's book (public domain), the card names' source and the modern cross-check; no calendar", () => {
    const titles = guideReferences("tarot").map((row) => row.title).join(" | ");
    expect(titles).toContain("라이더-웨이트-스미스 덱 (1909)");
    expect(titles).toContain("A. E. Waite 『The Pictorial Key to the Tarot』 (1910)");
    expect(titles).not.toMatch(/KASI|JPL|만세력/);
  });

  it("saju: the calendar engine, KASI, JPL, the standard-time and DST history; no tarot book", () => {
    const titles = guideReferences("saju").map((row) => row.title).join(" | ");
    for (const word of ["만세력 엔진", "한국천문연구원(KASI)", "NASA JPL", "서머타임"]) expect(titles, word).toContain(word);
    expect(titles).not.toMatch(/Waite|1909/);
  });
});

describe("the byline under the title", () => {
  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: who writes and checks it, both dates, and the editorial page", async (slug, article) => {
    const { container } = await renderSlug(slug);
    const line = byline(container);
    const reviewed = lastReviewed(article) as string;
    expect(line?.textContent).toBe(`글·검토 ${SITE.business.name} · 처음 쓴 날 ${koreanDate(article.published as string)} · 마지막 검토 ${koreanDate(reviewed)} · 편집 원칙`);
    expect([...(line?.querySelectorAll("time") ?? [])].map((time) => time.getAttribute("datetime"))).toEqual([article.published, reviewed]);
    expect(within(line as HTMLElement).getByRole("link", { name: "편집 원칙" }).getAttribute("href")).toBe(GUIDE_ABOUT_PATH);
  });
});

describe("the trust box after the body", () => {
  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: maker, dates, its category's sources, how to report an error", async (slug, article) => {
    const { container } = await renderSlug(slug);
    const box = trustBox(container);
    expect(box, slug).not.toBeNull();
    const text = box?.textContent ?? "";
    expect(within(box as HTMLElement).getByRole("heading", { level: 2 }).textContent).toBe("이 글에 대해");
    expect(text).toContain(`글·검토${SITE.business.name}`);
    // How it was made, the same facts as the editorial page: an AI draft checked against its category's sources.
    expect(text).toContain(article.category === "tarot" ? "AI 도구로 초안을 쓰고 1909년 원판 그림과 웨이트 해설서에 대조해 다듬었어요" : "AI 도구로 초안을 쓰고 만세력 계산 규칙에 대조해 다듬었어요");
    expect([...(box?.querySelectorAll("time") ?? [])].map((time) => time.getAttribute("datetime"))).toEqual([article.published, lastReviewed(article)]);

    const listed = [...(box?.querySelectorAll("li") ?? [])].map((li) => li.textContent);
    const expected = guideReferences(article.category);
    expect(listed).toHaveLength(expected.length);
    for (const [i, row] of expected.entries()) expect(listed[i], row.title).toContain(row.title);

    // An error report goes to the business email; the editorial page and the evidence page are one tap away.
    expect(text).toContain(SITE.business.email);
    const hrefs = [...(box?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`mailto:${SITE.business.email}`);
    expect(hrefs).toContain(GUIDE_ABOUT_PATH);
    expect(hrefs).toContain(INFO_PAGES.evidence.path);
    cleanup();
  });

  it("follows the body and comes before the call-to-action, and the ad is never inside it", async () => {
    vi.stubEnv("ADSENSE_CLIENT", "ca-pub-1234567890123456");
    vi.stubEnv("ADSENSE_SLOT_GUIDE", "1234567890");
    const { container } = await renderSlug("five-elements");
    const box = trustBox(container) as HTMLElement;
    const h1 = container.querySelector("h1") as HTMLElement;
    const ad = container.querySelector('aside[aria-label="광고"]') as HTMLElement;
    expect(ad).not.toBeNull();
    expect(box.contains(ad)).toBe(false);
    expect(h1.compareDocumentPosition(box)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(ad.compareDocumentPosition(box)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const cta = container.querySelector('aside[aria-label="사주 보기"]') as HTMLElement;
    expect(box.compareDocumentPosition(cta)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("links the app's pages on the app host when the hosts are split, and the editorial page stays on the root domain", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    const { container } = await renderSlug("the-hermit");
    const hrefs = [...(trustBox(container)?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`${SITE.url}${INFO_PAGES.evidence.path}`);
    expect(hrefs).toContain(GUIDE_ABOUT_PATH);
  });
});
