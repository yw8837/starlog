// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuideArticlePage from "@/app/guide/[slug]/page";
import GuideAboutPage from "@/app/guide/about/page";
import GuideSajuPage from "@/app/guide/saju/page";
import GuideTarotPage from "@/app/guide/tarot/page";
import { SITE } from "@/lib/config";
import { GUIDE_ABOUT_PATH, GUIDE_ARTICLES, GUIDE_STARTERS, articlesIn, findArticle, lastReviewed, recentlyReviewed } from "@/lib/guide";
import { koreanDate } from "@/lib/legal";

/**
 * The guide's home (the root domain's "/", the tarot tab) and its saju tab: what the site is and for whom, a reading
 * path for a first visit per category, the newest checked articles, the app's free tools, and every article within
 * two clicks. No ads on these list pages (guide.test.tsx), nothing unfinished.
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

const TABS = [
  { category: "tarot", Page: GuideTarotPage, other: "saju" },
  { category: "saju", Page: GuideSajuPage, other: "tarot" },
] as const;

const section = (id: string) => screen.getByRole("main").querySelector<HTMLElement>(`section[aria-labelledby="${id}"]`) as HTMLElement;
const hrefsIn = (root: HTMLElement) => within(root).getAllByRole("link").map((a) => a.getAttribute("href") ?? "");

const TOOLS = [
  ["지금의 한 장", "/now"],
  ["오늘의 한 장", "/today"],
  ["나를 닮은 타로 카드", "/birth-card"],
  ["2027년 나의 키워드", "/2027-keyword"],
] as const;

describe("the starter paths and recently checked list (data)", () => {
  it("names 3-5 real articles per category, each in its own category, none twice", () => {
    for (const category of ["tarot", "saju"] as const) {
      const slugs = GUIDE_STARTERS[category];
      expect(slugs.length).toBeGreaterThanOrEqual(3);
      expect(slugs.length).toBeLessThanOrEqual(5);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const slug of slugs) expect(findArticle(slug)?.category, slug).toBe(category);
    }
  });

  it("lists the newest 마지막 검토 first, ties in the guide's order", () => {
    const recent = recentlyReviewed(5);
    expect(recent).toHaveLength(5);
    const order = GUIDE_ARTICLES.map((article) => article.slug);
    for (let i = 1; i < recent.length; i++) {
      const [a, b] = [recent[i - 1]!, recent[i]!];
      const [da, db] = [lastReviewed(a) ?? "", lastReviewed(b) ?? ""];
      expect(da >= db).toBe(true);
      if (da === db) expect(order.indexOf(a.slug)).toBeLessThan(order.indexOf(b.slug));
    }
    const newest = GUIDE_ARTICLES.map((article) => lastReviewed(article) ?? "").sort().at(-1);
    expect(lastReviewed(recent[0]!)).toBe(newest);
  });
});

describe("the hub", () => {
  for (const tab of TABS) {
    it(`${tab.category}: says what the guide is, for whom, what it rests on, how many articles and when last checked, and links the editorial page`, () => {
      render(<tab.Page />);
      const intro = section("hub-intro-title");
      const text = intro.textContent ?? "";
      // The home speaks for the whole guide; the saju tab has an intro of its own, saju first (AdSense audit 2026-10-27).
      if (tab.category === "tarot") {
        expect(within(intro).getByRole("heading", { level: 2 }).textContent).toBe("스타로그 가이드는");
        expect(text).toContain("처음 접하는 분");
        expect(text).toContain("1909년 원판");
      } else {
        expect(within(intro).getByRole("heading", { level: 2 }).textContent).toBe("사주 가이드는");
        expect(text).toContain("명식");
        expect(text).not.toContain("1909년 원판");
      }
      expect(text).toContain("만세력");
      expect(text).toContain(`타로 ${articlesIn("tarot").length}편`);
      expect(text).toContain(`사주 ${articlesIn("saju").length}편`);
      const newest = GUIDE_ARTICLES.map((article) => lastReviewed(article) ?? "").sort().at(-1) as string;
      expect(text).toContain(`마지막 수정 ${koreanDate(newest)}`);
      expect(text).not.toContain("검토");
      expect(hrefsIn(intro)).toContain(GUIDE_ABOUT_PATH);
      // The intro comes right under the hero, before the tab's list.
      const list = screen.getByRole("heading", { level: 2, name: tab.category === "tarot" ? "타로 가이드" : "사주 가이드" });
      expect(intro.compareDocumentPosition(list)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it(`${tab.category}: a reading path for a first visit (the home both, tarot first; the saju tab its own), each step an article`, () => {
      render(<tab.Page />);
      const starters = section("hub-start-title");
      const paths = tab.category === "tarot" ? [tab.category, tab.other] : [tab.category];
      expect(within(starters).getByRole("heading", { level: 2 }).textContent).toBe(tab.category === "tarot" ? "처음이라면 이 순서로 읽어 보세요" : "명식을 처음 읽는다면 이 순서로 읽어 보세요");
      const groups = within(starters).queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);
      expect(groups).toEqual(paths.length > 1 ? paths.map((category) => `${category === "tarot" ? "타로" : "사주"} 처음이라면`) : []);
      const lists = starters.querySelectorAll("ol");
      expect(lists).toHaveLength(paths.length);
      for (const [i, category] of paths.entries()) {
        const links = within(lists[i] as HTMLElement).getAllByRole("link");
        expect(links.map((a) => a.getAttribute("href"))).toEqual(GUIDE_STARTERS[category].map((slug) => `/guide/${slug}`));
        for (const [j, slug] of GUIDE_STARTERS[category].entries()) expect(links[j]?.textContent).toContain(findArticle(slug)?.title);
      }
    });

    it(`${tab.category}: the five most recently changed articles with their dates`, () => {
      render(<tab.Page />);
      const recent = section("hub-recent-title");
      // Changed, not reviewed: 검토 is only what the owner has read himself (lib/guideReview.ts).
      expect(within(recent).getByRole("heading", { level: 2 }).textContent).toBe("최근 고친 글");
      expect(recent.textContent).not.toContain("검토");
      const expected = recentlyReviewed(5);
      expect(hrefsIn(recent)).toEqual(expected.map((article) => `/guide/${article.slug}`));
      expect([...recent.querySelectorAll("time")].map((time) => time.getAttribute("datetime"))).toEqual(expected.map(lastReviewed));
    });

    it(`${tab.category}: the app's four free tools, each with a one-line description`, () => {
      render(<tab.Page />);
      const tools = section("hub-tools-title");
      expect(within(tools).getByRole("heading", { level: 2 }).textContent).toBe("무료로 해 보기");
      const links = within(tools).getAllByRole("link");
      expect(links.map((a) => a.getAttribute("href"))).toEqual(TOOLS.map(([, path]) => path));
      for (const [i, [name]] of TOOLS.entries()) {
        expect(links[i]?.textContent, name).toContain(name);
        // The name and a sentence after it.
        expect((links[i]?.textContent ?? "").replace(name, "").trim(), name).toMatch(/요\.$/);
      }
    });

    it(`${tab.category}: on the real hosts the tools open on the app host, and the guide's own links stay paths`, () => {
      vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
      render(<tab.Page />);
      expect(hrefsIn(section("hub-tools-title"))).toEqual(TOOLS.map(([, path]) => `${SITE.url}${path}`));
      for (const id of ["hub-intro-title", "hub-start-title", "hub-recent-title"]) {
        for (const href of hrefsIn(section(id))) expect(href, `${id} ${href}`).toMatch(/^\/guide\//);
      }
    });

    it(`${tab.category}: every guide link on the page opens a real guide page, and nothing reads as unfinished`, () => {
      const { container } = render(<tab.Page />);
      const pages = new Set(["/guide/tarot", "/guide/saju", GUIDE_ABOUT_PATH, ...GUIDE_ARTICLES.map((article) => `/guide/${article.slug}`)]);
      const guideLinks = [...container.querySelectorAll("main a")].map((a) => a.getAttribute("href") ?? "").filter((href) => href.startsWith("/guide"));
      expect(guideLinks.length).toBeGreaterThan(10);
      for (const href of guideLinks) expect(pages.has(href.split("#")[0] as string), href).toBe(true);
      expect(container.textContent).not.toMatch(/준비 중|개발 중|공사 중/);
    });
  }
});

describe("the two hubs", () => {
  it("do not repeat each other's intro or reading path, and count 타로 36편 · 사주 30편 since the app manuals left", () => {
    const read = (Page: () => ReactElement) => {
      render(<Page />);
      const out = { intro: section("hub-intro-title").querySelector("p")?.textContent ?? "", start: section("hub-start-title").textContent ?? "", meta: section("hub-intro-title").textContent ?? "" };
      cleanup();
      return out;
    };
    const tarot = read(GuideTarotPage);
    const saju = read(GuideSajuPage);
    expect(saju.intro).not.toBe(tarot.intro);
    expect(saju.start).not.toBe(tarot.start);
    for (const hub of [tarot, saju]) expect(hub.meta).toContain("타로 36편 · 사주 30편");
  });
});

describe("every guide page within two clicks of the root domain's home", () => {
  it("reaches every article, both tabs and the editorial page from the home in at most two clicks", async () => {
    const guideHrefs = (container: HTMLElement) =>
      new Set([...container.querySelectorAll("a")].map((a) => (a.getAttribute("href") ?? "").split("#")[0] as string).filter((href) => href.startsWith("/guide")));
    const pageFor = async (path: string): Promise<ReactElement | null> => {
      if (path === "/guide/tarot") return <GuideTarotPage />;
      if (path === "/guide/saju") return <GuideSajuPage />;
      if (path === GUIDE_ABOUT_PATH) return <GuideAboutPage />;
      const slug = path.replace("/guide/", "");
      return findArticle(slug) ? await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">) : null;
    };

    const home = render(<GuideTarotPage />);
    const one = guideHrefs(home.container);
    cleanup();
    const two = new Set(one);
    for (const path of one) {
      const page = await pageFor(path);
      if (!page) continue;
      const { container } = render(page);
      for (const href of guideHrefs(container)) two.add(href);
      cleanup();
    }
    const missing = [...GUIDE_ARTICLES.map((article) => `/guide/${article.slug}`), "/guide/saju", GUIDE_ABOUT_PATH].filter((path) => !two.has(path));
    expect(missing).toEqual([]);
  }, 120_000);
});
