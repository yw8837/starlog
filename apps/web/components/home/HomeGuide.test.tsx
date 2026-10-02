// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import { GUIDE_CATEGORIES, articlesIn, guideIndexPath } from "@/lib/guide";
import { HomeGuide } from "./HomeEntries";

// The deploy build sets NEXT_PUBLIC_SPLIT_HOSTS=1; these tests run on one origin unless a test says so.
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", ""));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

/** Row 5 of the home: "전체 보기", then per tab its link and its first four articles. */
const GUIDE_PATHS = [
  guideIndexPath("tarot"),
  ...GUIDE_CATEGORIES.flatMap((category) => [guideIndexPath(category), ...articlesIn(category).slice(0, 4).map((article) => `/guide/${article.slug}`)]),
];

describe("HomeGuide", () => {
  const hrefs = () => screen.getAllByRole("link").map((link) => link.getAttribute("href"));

  it("links the guide's tabs and articles by path on one origin (dev, preview, e2e)", () => {
    render(<HomeGuide />);
    expect(hrefs()).toEqual(GUIDE_PATHS);
  });

  it("sends every link to the root domain when the hosts are split: the guide is not served on the app host", () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    render(<HomeGuide />);
    expect(hrefs()).toEqual(GUIDE_PATHS.map((path) => `${SITE.guideUrl}${path}`));
    expect(GUIDE_PATHS.length).toBeGreaterThan(9);
  });
});
