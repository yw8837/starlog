// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuideArticlePage from "@/app/guide/[slug]/page";
import { GuideBlocks } from "@/app/guide/GuideBlocks";
import { SITE } from "@/lib/config";
import { GUIDE_ABOUT_PATH, GUIDE_ARTICLES, findArticle, type GuideArticle, type GuideBlock } from "@/lib/guide";
import { guideLinkTarget, inlineParts } from "@/lib/guideLinks";

/**
 * Links in an article's text ([텍스트](주소)): rendered as real links to the guide, the app host or a listed source,
 * refused (plain text) for anything else; every link the articles carry is a valid one, every tool address or tool
 * name the text mentions is a link, and every "… 글" the saju articles point to opens that article.
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

const APP = SITE.url;
const SOURCE = "https://en.wikisource.org/wiki/The_Pictorial_Key_to_the_Tarot";

/** Every text an article's renderer runs links through: section bodies, paragraphs, list items, step and callout texts. */
function linkableTexts(article: GuideArticle): string[] {
  return article.sections.flatMap((section) => [
    section.body,
    ...(section.blocks ?? []).flatMap((block: GuideBlock) => {
      switch (block.kind) {
        case "p":
          return [block.text];
        case "list":
          return [...block.items];
        case "steps":
          return block.items.map((step) => step.text);
        case "callout":
          return [block.text];
        default:
          return [];
      }
    }),
  ]);
}

const linksOf = (article: GuideArticle) => linkableTexts(article).flatMap((text) => inlineParts(text).filter((part) => typeof part !== "string"));

describe("the renderer", () => {
  const blocks: GuideBlock[] = [
    { kind: "p", text: `안쪽 [바보 카드](/guide/the-fool), 앱 [키워드](${APP}/2027-keyword), 원전 [위키문헌](${SOURCE}), 막힌 [링크](javascript:alert).` },
    { kind: "list", items: [`목록 [지금의 한 장](${APP}/now)`] },
    { kind: "steps", items: [{ title: "질문이에요?", text: `답 [나를 닮은 타로 카드](${APP}/birth-card)에서요.` }] },
    { kind: "callout", tone: "tip", title: "도움말", text: `상자 [오행](/guide/five-elements#s2)` },
  ];

  it("turns each allowed link into an anchor, and leaves a refused one as its words", () => {
    const { container } = render(<div>{GuideBlocks({ blocks, id: "t" })}</div>);
    const anchors = [...container.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(anchors).toEqual([
      ["바보 카드", "/guide/the-fool"],
      ["키워드", "/2027-keyword"],
      ["위키문헌", SOURCE],
      ["지금의 한 장", "/now"],
      ["나를 닮은 타로 카드", "/birth-card"],
      ["오행", "/guide/five-elements#s2"],
    ]);
    expect(container.textContent).toContain("막힌 링크.");
    expect(container.innerHTML).not.toContain("javascript:");
    // The markup itself never shows.
    expect(container.textContent).not.toMatch(/\]\(|\[바보/);
  });

  it("opens a source in a new tab with rel=noopener, and keeps the guide's and the app's links in the tab", () => {
    const { container } = render(<div>{GuideBlocks({ blocks, id: "t" })}</div>);
    const source = container.querySelector(`a[href="${SOURCE}"]`);
    expect(source?.getAttribute("rel")).toBe("noopener");
    expect(source?.getAttribute("target")).toBe("_blank");
    for (const href of ["/guide/the-fool", "/2027-keyword"]) {
      expect(container.querySelector(`a[href="${href}"]`)?.getAttribute("target"), href).toBeNull();
    }
  });

  it("names the app host in full when the hosts are split; guide links stay paths on the root domain", () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    const { container } = render(<div>{GuideBlocks({ blocks, id: "t" })}</div>);
    expect(container.querySelector(`a[href="${APP}/2027-keyword"]`)).not.toBeNull();
    expect(container.querySelector('a[href="/guide/the-fool"]')).not.toBeNull();
  });
});

describe("the links the articles carry", () => {
  const pages = new Set(["/guide/tarot", "/guide/saju", GUIDE_ABOUT_PATH, ...GUIDE_ARTICLES.map((article) => `/guide/${article.slug}`)]);

  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: every link is allowed, a guide link opens a real page", (_slug, article) => {
    for (const link of linksOf(article)) {
      const target = guideLinkTarget(link.url);
      expect(target, link.url).not.toBeNull();
      if (target?.kind === "guide") expect(pages.has(target.path.split("#")[0] as string), link.url).toBe(true);
    }
    // No link markup where the renderer does not read it (headings, titles, captions, table cells).
    const elsewhere = [article.title, article.summary ?? "", ...(article.keyPoints ?? []), ...article.sections.flatMap((section) => [section.heading, ...(section.blocks ?? []).flatMap((block) => (block.kind === "steps" ? block.items.map((step) => step.title) : block.kind === "table" ? [block.caption, ...block.rows.flat()] : []))])];
    for (const text of elsewhere) expect(text, text).not.toMatch(/\[[^\]]+\]\([^)]+\)/);
  });

  it.each(GUIDE_ARTICLES.map((article) => [article.slug, article] as const))("%s: no app address left as plain text", (_slug, article) => {
    for (const text of linkableTexts(article)) {
      const outsideLinks = text.replace(/\[[^\]]+\]\([^)]+\)/g, "");
      expect(outsideLinks, text).not.toContain("yeolmaeapps.kr");
    }
  });

  const TOOLS = [
    ["나를 닮은 타로 카드", "/birth-card"],
    ["2027년 나의 키워드", "/2027-keyword"],
    ["지금의 한 장", "/now"],
    ["오늘의 한 장", "/today"],
  ] as const;

  // The card articles and the saju articles (the tarot basics and spreads name the tools as features, not as a next step).
  const LINKING = GUIDE_ARTICLES.filter((article) => article.cardId || article.category === "saju");

  it.each(LINKING.map((article) => [article.slug, article] as const))("%s: a free tool its text names or addresses is linked there", (_slug, article) => {
    const texts = linkableTexts(article);
    const links = linksOf(article).map((link) => guideLinkTarget(link.url));
    for (const [name, path] of TOOLS) {
      const named = texts.some((text) => text.includes(name) || text.includes(`yeolmaeapps.kr${path}`));
      if (!named) continue;
      expect(
        links.some((target) => target?.kind === "app" && target.path.split(/[?#]/)[0] === path),
        `${name} → ${path}`,
      ).toBe(true);
    }
  });

  it.each([
    ["ten-gods", "갑목 일간 글", "/guide/day-master-gapmok"],
    ["saju-compatibility", "지지 관계 글", "/guide/branch-relations"],
    ["four-pillars", "만세력 글", "/guide/manseryeok"],
    ["day-master-gyesu", "궁합 글", "/guide/saju-compatibility"],
    ["saju-glossary", "십신 글", "/guide/ten-gods"],
    ["day-master-gyeonggeum", "궁합 글", "/guide/saju-compatibility"],
  ])("%s: '%s' opens %s", (slug, words, path) => {
    const article = findArticle(slug) as GuideArticle;
    expect(article, slug).toBeDefined();
    const link = linksOf(article).find((part) => part.text.includes(words.replace(/ 글$/, "")) && part.url === path);
    expect(link, `${slug}: ${words}`).toBeDefined();
  });

  it("renders a real article's link on the page: the 2027 keyword test from 갑목", async () => {
    render(await GuideArticlePage({ params: Promise.resolve({ slug: "day-master-gapmok" }) } as PageProps<"/guide/[slug]">));
    const links = within(screen.getByRole("article")).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/2027-keyword");
  });
});
