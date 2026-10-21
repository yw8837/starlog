// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import NotFound from "./not-found";

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", ""));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const footerHrefs = () => within(screen.getByRole("navigation", { name: "사이트 안내" })).getAllByRole("link").map((a) => a.getAttribute("href"));

describe("the 404 page", () => {
  it("is one page on both hosts, so the real hosts get footer links that name the host serving each page: none takes a redirect on the root domain", () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    render(<NotFound />);
    expect(footerHrefs()).toEqual([
      `${SITE.url}/about`,
      `${SITE.url}/how`,
      `${SITE.url}/evidence`,
      `${SITE.url}/help`,
      `${SITE.url}/faq`,
      `${SITE.guideUrl}/`,
      `${SITE.url}/pricing`,
      `${SITE.url}/terms`,
      `${SITE.url}/privacy`,
      `${SITE.url}/refund`,
      // 방문 통계 설정: both hosts serve /privacy, and the choice is kept per host, so it stays a path.
      "/privacy#analytics",
    ]);
    // "/" is a page on each host (the guide's home on the root domain, the app's on its own), never a redirect.
    expect(screen.getByRole("link", { name: "홈으로" }).getAttribute("href")).toBe("/");
  });

  it("with one origin keeps every link a path", () => {
    render(<NotFound />);
    expect(footerHrefs()).toEqual(["/about", "/how", "/evidence", "/help", "/faq", "/guide/tarot", "/pricing", "/terms", "/privacy", "/refund", "/privacy#analytics"]);
  });
});
