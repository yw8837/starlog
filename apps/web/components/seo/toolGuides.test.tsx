// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE, won } from "@/lib/config";
import { findArticle } from "@/lib/guide";
import { NowGuide, SajuGuide, TarotGuide, TodayGuide } from "./toolGuides";

afterEach(cleanup);

/** Paths on the app host the guides may link to. */
const APP_PATHS = new Set(["/now", "/today", "/tarot/new", "/saju/new", "/pricing", "/evidence", "/birth-card"]);

/** Visible characters without spaces, as the SEO plan measured the pages (2026-10-08). */
const charCount = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/g, "").length;

/** The free tests the guides link to besides the tools (2027년 나의 키워드, from 오늘의 한 장). */
APP_PATHS.add("/2027-keyword");

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

describe("prices and 오픈 기념 무료 come from the config", () => {
  afterEach(() => vi.useRealTimers());
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(iso));
  };

  it("tarot: the tarot price and 오픈 기념 무료 with its rule, and no signup gift (removed, owner 2026-10-14 evening)", () => {
    at("2026-11-30T23:59:59+09:00");
    const { container } = render(<TarotGuide />);
    expect(screen.getByText(new RegExp(`타로 전체 풀이는 ${won(SITE.price.tarotStandardKrw)}이에요`))).toBeTruthy();
    expect(screen.getByText("11월 30일까지 로그인한 계정마다 타로 전체 풀이 한 번을 무료로 열 수 있어요(오픈 기념 무료, 같은 기기에서는 한 번). 내 기록에 보관돼요(이어서 물어보기 제외).")).toBeTruthy();
    expect(container.textContent).not.toMatch(/가입 선물|첫 이용/);
  });

  it("saju: the saju price, and 오픈 기념 무료 is not for saju", () => {
    at("2026-11-30T23:59:59+09:00");
    const { container } = render(<SajuGuide />);
    expect(screen.getByText(new RegExp(`사주 전체 풀이는 ${won(SITE.price.sajuStandardKrw)}이에요`))).toBeTruthy();
    expect(screen.getByText("오픈 기념 무료(11월 30일까지, 로그인한 계정마다 타로 전체 풀이 한 번)는 사주에는 쓸 수 없어요.")).toBeTruthy();
    expect(container.textContent).not.toContain("가입 선물");
  });

  it("both drop 오픈 기념 무료 by themselves from 2026-12-01 00:00 KST, and never put it in the server HTML", () => {
    at("2026-11-30T23:59:59+09:00");
    for (const Guide of [TarotGuide, SajuGuide]) expect(renderToString(<Guide />)).not.toContain("오픈 기념 무료");
    at("2026-12-01T00:00:00+09:00");
    for (const Guide of [TarotGuide, SajuGuide]) {
      const { container } = render(<Guide />);
      expect(container.textContent).not.toContain("오픈 기념 무료");
      cleanup();
    }
  });
});
