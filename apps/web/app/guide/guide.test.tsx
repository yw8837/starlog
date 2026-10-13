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
import { DECK_KEY } from "@/lib/deck";
import { GUIDE_CATEGORIES, articlesIn, findArticle, type GuideArticle } from "@/lib/guide";
import nextConfig from "@/next.config";

// A plain article, as the first six once were (no 한눈에 보기, no blocks). Every real article has both since
// 2026-10-08, so findArticle serves this one next to the library to keep the page's plain path covered.
const PLAIN = vi.hoisted(
  (): GuideArticle => ({
    slug: "plain-article",
    title: "블록 없는 글",
    category: "tarot",
    description: "블록 없이 문단만 있는 글이 그려지는 모양을 확인해요.",
    sections: [
      { heading: "첫 번째 절", body: "첫 번째 절의 문단이에요." },
      { heading: "두 번째 절", body: "두 번째 절의 문단이에요." },
    ],
  }),
);
vi.mock("@/lib/guide", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/guide")>();
  return { ...actual, findArticle: (slug: string) => (slug === PLAIN.slug ? PLAIN : actual.findArticle(slug)) };
});

// The deploy build sets NEXT_PUBLIC_SPLIT_HOSTS=1; these tests run on one origin unless a test says so.
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", ""));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  localStorage.clear();
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
      // The guide lives on the root domain: the canonical and og:url name it in full, whatever host serves
      // the page. The tarot tab is the guide's home, the root domain's own "/".
      const address = tab.category === "tarot" ? `${SITE.guideUrl}/` : `${SITE.guideUrl}/guide/${tab.category}`;
      expect(tab.metadata.alternates?.canonical).toBe(address);
      expect(tab.metadata.openGraph).toMatchObject({ url: address });
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

describe("guide article body", () => {
  const renderSlug = async (slug: string) => render(await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">));
  /** The tags under each section's box, keyed by its heading. */
  const sectionTags = (heading: string) => [...(screen.getByRole("heading", { level: 2, name: heading }).parentElement?.children ?? [])].map((el) => el.tagName);

  it("renders a section without blocks exactly as before: its heading, then its body as one paragraph", async () => {
    expect(PLAIN.sections.some((section) => section.blocks) || PLAIN.keyPoints).toBeFalsy();
    await renderSlug(PLAIN.slug);
    for (const section of PLAIN.sections) {
      expect(sectionTags(section.heading)).toEqual(["H2", "P"]);
      expect(screen.getByRole("heading", { level: 2, name: section.heading }).nextElementSibling?.textContent).toBe(section.body);
    }
    expect(screen.queryByText("한눈에 보기")).toBeNull();
  });

  it("keeps a real article's sections without blocks to their heading and one paragraph", async () => {
    const article = findArticle("the-hermit");
    const plain = article?.sections.filter((section) => !section.blocks) ?? [];
    expect(plain.length).toBeGreaterThanOrEqual(2);
    await renderSlug("the-hermit");
    for (const section of plain) {
      expect(sectionTags(section.heading)).toEqual(["H2", "P"]);
      expect(screen.getByRole("heading", { level: 2, name: section.heading }).nextElementSibling?.textContent).toBe(section.body);
    }
  });

  it.each([
    ["the-fool", "바보 타로 카드"],
    ["the-hermit", "은둔자 타로 카드"],
    ["the-star", "별 타로 카드"],
  ])("%s: the card picture has a real alt (%s) and is announced once", async (slug, alt) => {
    await renderSlug(slug);
    // the first figure is the card picture, ahead of the sections
    const pictures = within(screen.getAllByRole("figure")[0]!).getAllByRole("img");
    expect(pictures.map((picture) => [picture.tagName, picture.getAttribute("alt")])).toEqual([["IMG", alt]]);
  });

  it("shows 한눈에 보기 under the 요약, and a section's blocks after its body paragraph", async () => {
    const article = findArticle("five-elements");
    if (!article?.keyPoints) throw new Error("five-elements has no keyPoints");
    await renderSlug(article.slug);
    const points = screen.getByRole("list", { name: "한눈에 보기" });
    expect(within(points).getAllByRole("listitem").map((li) => li.textContent)).toEqual(article.keyPoints);
    const summary = screen.getByText(article.summary ?? "");
    expect(summary.compareDocumentPosition(points) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sectionTags("살리고 누르는 관계")).toEqual(["H2", "P", "FIGURE", "UL"]);
    expect(screen.getByRole("heading", { level: 2, name: "살리고 누르는 관계" }).nextElementSibling?.textContent).toBe(
      article.sections.find((section) => section.heading === "살리고 누르는 관계")?.body,
    );
    expect(screen.getByRole("table", { name: "오행과 글자, 계절, 색" })).toBeTruthy();
  });
});

describe("guide card pictures", () => {
  // What a visitor who chose the Starlog deck and the 남색 금선 back has saved.
  const choose = () => localStorage.setItem(DECK_KEY, JSON.stringify({ front: "starlog", back: "navy-gold" }));
  /** Every card face on the page (the backs live under /cards/backs/ and follow the visitor's choice). */
  const faceSrcs = (root: HTMLElement) =>
    [...root.querySelectorAll<HTMLImageElement>('img[src^="/cards/"]')].map((img) => img.getAttribute("src") ?? "").filter((src) => !src.startsWith("/cards/backs/"));

  it.each(TABS)("$category tab: the article thumbnails are the 1909 scans, whatever deck was chosen", ({ Page, category }) => {
    choose();
    const { container } = render(<Page />);
    const faces = faceSrcs(container);
    if (category === "tarot") expect(faces.length).toBeGreaterThan(5);
    for (const src of faces) expect(src, src).toMatch(/^\/cards\/[a-z0-9-]+-sm\.webp$/);
    expect(container.innerHTML).not.toContain("/cards/starlog/");
  });

  it("the card of a card article is the 1909 scan, small and large, whatever deck was chosen", async () => {
    choose();
    const { container } = render(await GuideArticlePage({ params: Promise.resolve({ slug: "the-fool" }) } as PageProps<"/guide/[slug]">));
    const picture = within(screen.getAllByRole("figure")[0]!).getByRole("img", { name: "바보 타로 카드" });
    expect(picture.getAttribute("src")).toBe("/cards/major-00-fool-sm.webp");
    expect(picture.getAttribute("srcset")).toBe("/cards/major-00-fool-sm.webp 240w, /cards/major-00-fool.webp 600w");
    expect(container.innerHTML).not.toContain("/cards/starlog/");
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
      footer: ["/about", "/how", "/evidence", "/help", "/faq", "/guide/tarot", "/pricing", "/terms", "/privacy", "/refund"],
    });
  });

  it.each(TABS)("$category tab: on the real hosts, links to the app are absolute on the app host and its own links stay paths, the guide's home its /", ({ Page, category }) => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    render(<Page />);
    expect(navLinks()).toEqual({
      brand: `${APP}/`,
      pills: [`${APP}/`, "/", `${APP}/faq`, `${APP}/story`, `${APP}/me`],
      bar: [`${APP}/`, `${APP}/story`, "/", `${APP}/me`],
      footer: [`${APP}/about`, `${APP}/how`, `${APP}/evidence`, `${APP}/help`, `${APP}/faq`, "/", `${APP}/pricing`, `${APP}/terms`, `${APP}/privacy`, `${APP}/refund`],
    });
    // The tabs and the article cards are the guide's own pages: paths, so they stay on the root domain.
    const tabs = within(screen.getByRole("navigation", { name: "가이드 분류" })).getAllByRole("link");
    expect(tabs.map((a) => a.getAttribute("href"))).toEqual(["/", "/guide/saju"]);
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
    expect(navLinks()).toMatchObject({ brand: `${APP}/`, pills: [`${APP}/`, "/", `${APP}/faq`, `${APP}/story`, `${APP}/me`] });
    // The way back and the related reads are guide pages: paths (the tarot tab is the root domain's /).
    expect(screen.getByRole("link", { name: /가이드 목록으로/ }).getAttribute("href")).toBe(slug === "the-hermit" ? "/" : "/guide/saju");
    const related = within(screen.getByRole("navigation", { name: "같이 읽어 볼 글" })).getAllByRole("link");
    expect(related.every((a) => a.getAttribute("href")?.startsWith("/guide/"))).toBe(true);
  });
});
