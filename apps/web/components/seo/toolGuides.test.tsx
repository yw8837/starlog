// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SITE, won } from "@/lib/config";
import { findArticle } from "@/lib/guide";
import { NowGuide, SajuGuide, TarotGuide, TodayGuide } from "./toolGuides";

afterEach(cleanup);

/** Paths on the app host the guides may link to. */
const APP_PATHS = new Set(["/now", "/today", "/tarot/new", "/saju/new", "/pricing", "/evidence"]);

/** Visible characters without spaces, as the SEO plan measured the pages (2026-10-08). */
const charCount = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/g, "").length;

describe.each([
  ["지금의 한 장", NowGuide],
  ["오늘의 한 장", TodayGuide],
  ["타로", TarotGuide],
  ["사주", SajuGuide],
])("the %s guide (SEO plan B1)", (name, Guide) => {
  it("is one section under one h2, with steps, links and questions, and enough text to say what the page is", () => {
    const { container } = render(<Guide />);
    const section = container.querySelector("section")!;
    expect(section.getAttribute("aria-labelledby")).toBe(section.querySelector("h2")!.id);
    expect(section.querySelectorAll("h1")).toHaveLength(0);
    expect(section.querySelectorAll("h2")).toHaveLength(1);
    expect(section.querySelectorAll("ol > li").length).toBeGreaterThanOrEqual(3);
    expect(section.querySelectorAll("dt").length).toBeGreaterThanOrEqual(3);
    expect(charCount(section), name).toBeGreaterThanOrEqual(1000);
  });

  it("links only to this site's tools and to guide articles that exist", () => {
    const { container } = render(<Guide />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href")!);
    expect(hrefs.length).toBeGreaterThanOrEqual(4);
    for (const href of hrefs) {
      const slug = href.match(/\/guide\/([a-z0-9-]+)$/)?.[1];
      if (slug) expect(findArticle(slug), href).toBeTruthy();
      else expect(APP_PATHS.has(href), href).toBe(true);
    }
  });

  it("never names the model or its vendor, never says 베타, and never promises accuracy", () => {
    const { container } = render(<Guide />);
    expect(container.textContent).not.toMatch(/Claude|Anthropic|클로드|앤트로픽|GPT|베타|적중|잘 맞는|100%/);
  });
});

describe("prices and the gift come from the config", () => {
  it("tarot: the tarot price and the gift, which saju never takes", () => {
    render(<TarotGuide />);
    expect(screen.getByText(new RegExp(`타로 전체 풀이는 ${won(SITE.price.tarotStandardKrw)}이에요`))).toBeTruthy();
    expect(screen.getByText(/가입 선물로 드려요/)).toBeTruthy();
  });

  it("saju: the saju price, and the gift is not for saju", () => {
    render(<SajuGuide />);
    expect(screen.getByText(new RegExp(`사주 전체 풀이는 ${won(SITE.price.sajuStandardKrw)}이에요`))).toBeTruthy();
    expect(screen.getByText("가입 선물(타로 전체 풀이 1번)은 사주에는 쓸 수 없어요.")).toBeTruthy();
  });
});
