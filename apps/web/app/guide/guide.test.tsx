// @vitest-environment jsdom
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuideArticlePage, { generateMetadata as articleMetadata } from "@/app/guide/[slug]/page";
import GuideSajuPage, { metadata as sajuMetadata } from "@/app/guide/saju/page";
import GuideTarotPage, { metadata as tarotMetadata } from "@/app/guide/tarot/page";
import { GUIDE_HOST_LINES } from "@/app/guide/GuideHost";
import { SITE } from "@/lib/config";
import { GUIDE_CATEGORIES, articlesIn, findArticle } from "@/lib/guide";
import nextConfig from "@/next.config";

// The deploy build sets NEXT_PUBLIC_SPLIT_HOSTS=1; these tests run on one origin unless a test says so.
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", ""));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const TABS = [
  { category: "tarot", Page: GuideTarotPage, metadata: tarotMetadata, title: "타로 가이드", hero: "타로 카드를 펼치기 전에 알아 두면 좋은 이야기", host: "별을 읽는 점성술사 고양이" },
  { category: "saju", Page: GuideSajuPage, metadata: sajuMetadata, title: "사주 가이드", hero: "사주 명식을 읽기 전에 알아 두면 좋은 이야기", host: "한복 입은 토끼 선생님" },
] as const;

describe("guide tabs", () => {
  for (const tab of TABS) {
    it(`${tab.category}: tab links with the current one marked, its leader and line, only its articles`, () => {
      render(<tab.Page />);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(tab.hero);
      // The tab's own name heads its article list.
      expect(screen.getByRole("heading", { level: 2, name: tab.title })).toBeTruthy();

      const links = within(screen.getByRole("navigation", { name: "가이드 분류" })).getAllByRole("link");
      expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
        ["타로", "/guide/tarot"],
        ["사주", "/guide/saju"],
      ]);
      expect(links.map((a) => a.getAttribute("aria-current"))).toEqual(GUIDE_CATEGORIES.map((c) => (c === tab.category ? "page" : null)));

      // The leader is tap-reactive (a button), and speaks one of the tab's lines.
      expect(screen.getByRole("button", { name: tab.host })).toBeTruthy();
      expect(GUIDE_HOST_LINES[tab.category].some((line) => screen.queryByText(line))).toBe(true);

      const items = within(screen.getByRole("main").querySelector("ul") as HTMLElement).getAllByRole("link");
      const articles = articlesIn(tab.category);
      expect(items.map((a) => a.getAttribute("href"))).toEqual(articles.map((a) => `/guide/${a.slug}`));
      for (const [i, article] of articles.entries()) expect(items[i]?.textContent).toContain(article.title);
    });

    it(`${tab.category}: its own title, description and canonical on the root domain`, () => {
      expect(String(tab.metadata.title).startsWith(tab.title)).toBe(true);
      // The guide lives on the root domain: the canonical and og:url name it in full, whatever host serves the page.
      expect(tab.metadata.alternates?.canonical).toBe(`${SITE.guideUrl}/guide/${tab.category}`);
      expect(tab.metadata.openGraph).toMatchObject({ url: `${SITE.guideUrl}/guide/${tab.category}` });
      const description = String(tab.metadata.description);
      expect(description.length).toBeGreaterThan(20);
      expect(description.length).toBeLessThanOrEqual(120);
      expect(description).toMatch(/요\.$/);
    });
  }

  it("keeps each tab a static route next to [slug], and no /guide page (it redirects)", () => {
    const dir = (path: string) => fileURLToPath(new URL(path, import.meta.url));
    for (const category of GUIDE_CATEGORIES) expect(existsSync(dir(`./${category}/page.tsx`)), category).toBe(true);
    expect(existsSync(dir("./page.tsx"))).toBe(false);
  });

  it("sends /guide to the tarot tab with a permanent redirect", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects).toContainEqual({ source: "/guide", destination: "/guide/tarot", permanent: true });
  });
});

describe("guide article", () => {
  it.each([
    ["the-hermit", "타로", "/guide/tarot"],
    ["five-elements", "사주", "/guide/saju"],
    ["the-fool", "타로", "/guide/tarot"],
    ["daewoon", "사주", "/guide/saju"],
  ])("%s: the back link returns to the %s tab", async (slug, label, href) => {
    render(await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">));
    const back = screen.getByRole("link", { name: `${label} 가이드 목록으로` });
    expect(back.getAttribute("href")).toBe(href);
  });

  it.each(["the-star", "the-fool", "daewoon"])("%s: lists its own related reads under 같이 읽어 볼 글, in order", async (slug) => {
    render(await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">));
    const related = findArticle(slug)?.related ?? [];
    expect(related.length).toBeGreaterThanOrEqual(3);
    const nav = screen.getByRole("navigation", { name: "같이 읽어 볼 글" });
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(related.map((other) => `/guide/${other}`));
  });
});

describe("guide article metadata", () => {
  it("names the article's address on the root domain as its canonical and og:url", async () => {
    for (const slug of ["the-hermit", "five-elements", "how-to-read-tarot"]) {
      const meta = await articleMetadata({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">);
      expect(meta.alternates?.canonical, slug).toBe(`${SITE.guideUrl}/guide/${slug}`);
      expect(meta.openGraph, slug).toMatchObject({ type: "article", url: `${SITE.guideUrl}/guide/${slug}` });
    }
  });
});

/** The links a rendered guide page carries, by landmark. */
function navLinks() {
  const hrefs = (nav: HTMLElement) => within(nav).getAllByRole("link").map((a) => a.getAttribute("href"));
  const [pills, bar] = screen.getAllByRole("navigation", { name: "주요 메뉴" }) as [HTMLElement, HTMLElement];
  return {
    brand: screen.getByRole("link", { name: "스타로그 홈" }).getAttribute("href"),
    pills: hrefs(pills),
    bar: hrefs(bar),
    footer: hrefs(screen.getByRole("navigation", { name: "사이트 안내" })),
  };
}

const APP = SITE.url;

describe("links from a guide page", () => {
  it.each(TABS)("$category tab: with one origin (dev, preview, e2e) every link stays a path", ({ Page }) => {
    render(<Page />);
    expect(navLinks()).toEqual({
      brand: "/",
      pills: ["/", "/guide/tarot", "/faq", "/story", "/me"],
      bar: ["/", "/story", "/guide/tarot", "/me"],
      footer: ["/about", "/how", "/help", "/faq", "/guide/tarot", "/pricing", "/terms", "/privacy", "/refund"],
    });
  });

  it.each(TABS)("$category tab: on the real hosts, links to the app are absolute on the app host and its own links stay paths", ({ Page, category }) => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    render(<Page />);
    expect(navLinks()).toEqual({
      brand: `${APP}/`,
      pills: [`${APP}/`, "/guide/tarot", `${APP}/faq`, `${APP}/story`, `${APP}/me`],
      bar: [`${APP}/`, `${APP}/story`, "/guide/tarot", `${APP}/me`],
      footer: [`${APP}/about`, `${APP}/how`, `${APP}/help`, `${APP}/faq`, "/guide/tarot", `${APP}/pricing`, `${APP}/terms`, `${APP}/privacy`, `${APP}/refund`],
    });
    // The tabs and the article cards are the guide's own pages: paths, so they stay on the root domain.
    const tabs = within(screen.getByRole("navigation", { name: "가이드 분류" })).getAllByRole("link");
    expect(tabs.map((a) => a.getAttribute("href"))).toEqual(["/guide/tarot", "/guide/saju"]);
    const items = within(screen.getByRole("main").querySelector("ul") as HTMLElement).getAllByRole("link");
    expect(items.map((a) => a.getAttribute("href"))).toEqual(articlesIn(category).map((a) => `/guide/${a.slug}`));
  });

  it.each([
    ["the-hermit", "타로 보기", "/tarot/new?new=1"],
    ["five-elements", "사주 보기", "/saju/new?new=1"],
  ])("%s: the %s button starts the flow on the app host when the hosts are split, and with a path otherwise", async (slug, label, path) => {
    const page = async () => GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">);
    render(await page());
    expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(path);
    cleanup();

    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    render(await page());
    expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(`${APP}${path}`);
    expect(navLinks()).toMatchObject({ brand: `${APP}/`, pills: [`${APP}/`, "/guide/tarot", `${APP}/faq`, `${APP}/story`, `${APP}/me`] });
    // The way back and the related reads are guide pages: paths.
    expect(screen.getByRole("link", { name: /가이드 목록으로/ }).getAttribute("href")).toMatch(/^\/guide\/(tarot|saju)$/);
    const related = within(screen.getByRole("navigation", { name: "같이 읽어 볼 글" })).getAllByRole("link");
    expect(related.every((a) => a.getAttribute("href")?.startsWith("/guide/"))).toBe(true);
  });
});
