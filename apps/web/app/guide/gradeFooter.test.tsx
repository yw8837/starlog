// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuideArticlePage from "@/app/guide/[slug]/page";
import { SITE } from "@/lib/config";

/** The 오행 articles end with a line on the 사주 등급's rule page (spec 2026-11-11 B, 들어오는 곳 4), within the two app links. */

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: new URL(SITE.guideUrl).host }) }));
vi.mock("next/script", async () => {
  const { createElement } = await import("react");
  return { default: ({ src }: { src: string }) => createElement("script", { "data-ads-src": src }) };
});

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1"));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const page = async (slug: string) => render(await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">));

describe("the grade line under the 오행 articles", () => {
  it.each(["five-elements", "yongsin"])("%s ends with the line and a link to the rule page on the app host", async (slug) => {
    await page(slug);
    const link = screen.getByRole("link", { name: "사주 등급 규칙 보기" });
    expect(link.getAttribute("href")).toBe(`${SITE.url}/saju/grade/how`);
    expect(link.closest("aside")?.textContent).toContain("다섯 기운을 얼마나 고르게 채우는지");
  });

  it("other articles have none", async () => {
    await page("ten-gods");
    expect(screen.queryByRole("link", { name: "사주 등급 규칙 보기" })).toBeNull();
  });
});
