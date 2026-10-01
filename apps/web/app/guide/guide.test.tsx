// @vitest-environment jsdom
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GuideArticlePage from "@/app/guide/[slug]/page";
import GuideSajuPage, { metadata as sajuMetadata } from "@/app/guide/saju/page";
import GuideTarotPage, { metadata as tarotMetadata } from "@/app/guide/tarot/page";
import { GUIDE_CATEGORIES, articlesIn, findArticle } from "@/lib/guide";
import nextConfig from "@/next.config";

afterEach(cleanup);

const TABS = [
  { category: "tarot", Page: GuideTarotPage, metadata: tarotMetadata, title: "타로 가이드", hero: "타로 카드를 펼치기 전에 알아 두면 좋은 이야기", host: "별을 읽는 점성술사 고양이", line: "카드 읽는 법, 제가 차근차근 알려 줄게요" },
  { category: "saju", Page: GuideSajuPage, metadata: sajuMetadata, title: "사주 가이드", hero: "사주 명식을 읽기 전에 알아 두면 좋은 이야기", host: "한복 입은 토끼 선생님", line: "명식 읽는 법은 제가 맡을게요" },
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

      // The leader is tap-reactive (a button), and speaks the tab's line.
      expect(screen.getByRole("button", { name: tab.host })).toBeTruthy();
      expect(screen.getByText(tab.line)).toBeTruthy();

      const items = within(screen.getByRole("main").querySelector("ul") as HTMLElement).getAllByRole("link");
      const articles = articlesIn(tab.category);
      expect(items.map((a) => a.getAttribute("href"))).toEqual(articles.map((a) => `/guide/${a.slug}`));
      for (const [i, article] of articles.entries()) expect(items[i]?.textContent).toContain(article.title);
    });

    it(`${tab.category}: its own title, description and canonical`, () => {
      expect(tab.metadata.title).toBe(tab.title);
      expect(tab.metadata.alternates?.canonical).toBe(`/guide/${tab.category}`);
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
