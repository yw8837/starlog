// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuideArticlePage from "@/app/guide/[slug]/page";
import GuideAboutPage from "@/app/guide/about/page";
import { SITE } from "@/lib/config";
import { GUIDE_ARTICLES, GUIDE_CATEGORY_LABEL, adjacentArticles, articlesIn } from "@/lib/guide";

/**
 * Navigation on a guide article (SEO audit SEO-17 / P2-10, AdSense "명확한 탐색"): a visible breadcrumb that names and
 * links exactly what the BreadcrumbList JSON-LD says, and at the end of every article the previous and next article of
 * its tab with a way back to the tab's list, so no article is a dead end.
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

/** The BreadcrumbList on the page, as [name, item] pairs. */
function jsonLdCrumbs(container: HTMLElement): Array<[string, string]> {
  const lists = [...container.querySelectorAll('script[type="application/ld+json"]')]
    .map((script) => JSON.parse(script.textContent ?? "null") as { "@type"?: string; itemListElement?: Array<{ name: string; item: string }> } | null)
    .filter((node) => node?.["@type"] === "BreadcrumbList");
  expect(lists).toHaveLength(1);
  return (lists[0]?.itemListElement ?? []).map((item) => [item.name, item.item]);
}

/** The visible breadcrumb, as [name, href or null] pairs; the current page is not a link. */
function visibleCrumbs(): Array<[string, string | null]> {
  const nav = screen.getByRole("navigation", { name: "현재 위치" });
  return [...nav.querySelectorAll("li")].map((li) => [li.textContent ?? "", li.querySelector("a")?.getAttribute("href") ?? null]);
}

describe("the visible breadcrumb", () => {
  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: the JSON-LD's names, in order, above the title; the page itself is not a link", async (slug, article) => {
    const { container } = await renderSlug(slug);
    const ld = jsonLdCrumbs(container);
    const shown = visibleCrumbs();
    expect(shown.map(([name]) => name)).toEqual(ld.map(([name]) => name));
    expect(shown.map(([name]) => name)).toEqual([SITE.nameKo, `${GUIDE_CATEGORY_LABEL[article.category]} 가이드`, article.title]);
    expect(shown.at(-1)?.[1]).toBeNull();
    const current = screen.getByRole("navigation", { name: "현재 위치" }).querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe(article.title);
    const h1 = container.querySelector("h1") as HTMLElement;
    expect(screen.getByRole("navigation", { name: "현재 위치" }).compareDocumentPosition(h1)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    cleanup();
  });

  it.each([["the-hermit"], ["five-elements"]])("%s: on the real hosts, each link opens the very URL its JSON-LD item names", async (slug) => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    const { container } = await renderSlug(slug);
    const ld = jsonLdCrumbs(container);
    const shown = visibleCrumbs();
    // A path is on the page's own host, the root domain.
    const resolved = shown.slice(0, -1).map(([, href]) => new URL(href as string, `${SITE.guideUrl}/guide/${slug}`).toString());
    expect(resolved).toEqual(ld.slice(0, -1).map(([, item]) => item));
    expect(ld.at(-1)?.[1]).toBe(`${SITE.guideUrl}/guide/${slug}`);
  });

  it("the editorial page has one too, matching its JSON-LD", () => {
    const { container } = render(<GuideAboutPage />);
    const ld = jsonLdCrumbs(container);
    expect(visibleCrumbs().map(([name]) => name)).toEqual(ld.map(([name]) => name));
    expect(ld.map(([name]) => name)).toEqual([SITE.nameKo, "가이드", "가이드 소개와 편집 원칙"]);
    expect(ld.at(-1)?.[1]).toBe(`${SITE.guideUrl}/guide/about`);
  });
});

describe("the previous and next article of the tab", () => {
  it("follows each tab's order, with nothing before the first and nothing after the last", () => {
    for (const category of ["tarot", "saju"] as const) {
      const list = articlesIn(category);
      expect(adjacentArticles(list[0]!)).toEqual({ prev: undefined, next: list[1] });
      expect(adjacentArticles(list.at(-1)!)).toEqual({ prev: list.at(-2), next: undefined });
      expect(adjacentArticles(list[3]!)).toEqual({ prev: list[2], next: list[4] });
    }
  });

  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: links them and its tab's list, after the related reads; never a dead end, nothing unfinished", async (slug, article) => {
    const { container } = await renderSlug(slug);
    // No under-construction wording on a page the root domain serves (AdSense: no ads on unfinished screens).
    expect(container.textContent).not.toMatch(/준비 중|개발 중|공사 중/);
    const tab = GUIDE_CATEGORY_LABEL[article.category];
    const nav = screen.getByRole("navigation", { name: `${tab} 가이드 이어 읽기` });
    const links = within(nav).getAllByRole("link");
    const hrefs = links.map((a) => a.getAttribute("href"));
    const { prev, next } = adjacentArticles(article);
    if (prev) expect(within(nav).getByRole("link", { name: new RegExp(`이전 글.*${escape(prev.title)}`) }).getAttribute("href")).toBe(`/guide/${prev.slug}`);
    if (next) expect(within(nav).getByRole("link", { name: new RegExp(`다음 글.*${escape(next.title)}`) }).getAttribute("href")).toBe(`/guide/${next.slug}`);
    expect(hrefs).toContain(`/guide/${article.category}`);
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
    expect(hrefs.every((href) => href?.startsWith("/guide/"))).toBe(true);
    const related = screen.getByRole("navigation", { name: "같이 읽어 볼 글" });
    expect(related.compareDocumentPosition(nav)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    cleanup();
  });

  it("keeps the tab's list on the root domain's / for a tarot article when the hosts are split", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    await renderSlug("the-fool");
    const nav = screen.getByRole("navigation", { name: "타로 가이드 이어 읽기" });
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toContain("/");
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
