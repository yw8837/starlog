// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuideArticlePage from "@/app/guide/[slug]/page";
import { SITE } from "@/lib/config";
import { GUIDE_ARTICLES } from "@/lib/guide";
import { INFO_PAGES } from "@/lib/infoPages";

// The deploy build sets NEXT_PUBLIC_SPLIT_HOSTS=1; these tests run on one origin unless a test says so.
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", ""));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

/** jsdom tests have no file: import.meta.url; vitest runs from the repo root or from apps/web. */
const readJson = <T,>(path: string): T => {
  const file = [path, `../../${path}`].map((p) => resolve(process.cwd(), p)).find((p) => existsSync(p)) ?? path;
  return JSON.parse(readFileSync(file, "utf8")) as T;
};

const pkt = readJson<{ cards: Record<string, { loc: string; quoteKo: string }> }>("content/kb/sources/pkt.json");
const facts = readJson<Array<{ id: string; valueKo: string }>>("content/evidence.json");
const modernCount = /(\d+)곳/.exec(facts.find((fact) => fact.id === "tarot-modern-sources")?.valueKo ?? "")?.[1];

const renderSlug = async (slug: string) => render(await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">));
const cardArticles = GUIDE_ARTICLES.filter((article) => article.cardId);
const sajuArticles = GUIDE_ARTICLES.filter((article) => article.category === "saju");
const evidence = INFO_PAGES.evidence.path;

describe("Waite's words on a card article", () => {
  it("covers the 22 single-card articles", () => {
    expect(cardArticles).toHaveLength(22);
    expect(modernCount).toBeTruthy();
  });

  it.each(cardArticles.map((article) => [article.slug, article.cardId as string]))(
    "%s: quotes its own card from PKT under 웨이트 원전에서는, cites the picture's place, and links its sources",
    async (slug, cardId) => {
      const card = pkt.cards[cardId]!;
      const { container } = await renderSlug(slug);
      const quotes = container.querySelectorAll("blockquote");
      expect(quotes).toHaveLength(1);
      expect(quotes[0]?.textContent).toBe(card.quoteKo);
      const figure = quotes[0]?.closest("figure");
      expect(figure?.textContent).toContain("웨이트 원전에서는");
      const pictureLoc = card.loc.split("; ")[0];
      expect(figure?.querySelector("figcaption")?.textContent).toBe(`Waite, The Pictorial Key to the Tarot, ${pictureLoc}`);
      // The quote sits under the card picture, before the article body.
      expect(container.querySelector("figure")?.compareDocumentPosition(figure as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

      const line = `그림: 1909년 원판 · 원전: 웨이트 『The Pictorial Key to the Tarot』 ${card.loc} · 현대 해석 ${modernCount}곳 대조`;
      expect(screen.getByRole("link", { name: line }).getAttribute("href")).toBe(`${evidence}#tarot`);
    },
  );
});

describe("the calendar line on a saju article", () => {
  it.each(sajuArticles.map((article) => [article.slug]))("%s: names its calendar basis and links the evidence page", async (slug) => {
    const { container } = await renderSlug(slug);
    expect(screen.getByRole("link", { name: "달력: 한국천문연구원 음력 · NASA JPL 절입 시각 검증" }).getAttribute("href")).toBe(`${evidence}#saju`);
    expect(container.querySelector("blockquote")).toBeNull();
  });
});

describe("other guide articles", () => {
  it("carry no source line: the tarot basics and spreads are about no single card", async () => {
    const others = GUIDE_ARTICLES.filter((article) => article.category === "tarot" && !article.cardId);
    expect(others.length).toBeGreaterThan(0);
    for (const article of others) {
      const { container } = await renderSlug(article.slug);
      // The article itself; the site footer links the evidence page on every page.
      const body = container.querySelector("article") as HTMLElement;
      expect(body.querySelector("blockquote"), article.slug).toBeNull();
      expect(body.querySelector(`a[href^="${evidence}"]`), article.slug).toBeNull();
      cleanup();
    }
  });
});

describe("the source line on the real hosts", () => {
  it("goes to the evidence page on the app host: the guide lives on the root domain", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    const { container } = await renderSlug("the-hermit");
    expect(container.querySelector(`a[href="${SITE.url}${evidence}#tarot"]`)).not.toBeNull();
    cleanup();
    const saju = await renderSlug("five-elements");
    expect(saju.container.querySelector(`a[href="${SITE.url}${evidence}#saju"]`)).not.toBeNull();
  });
});
