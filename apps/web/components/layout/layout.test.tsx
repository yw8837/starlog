// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import { Footer } from "./Footer";
import { TabBar } from "./TabBar";

// The footer reads the business config; a sentinel address proves it prints the configured one.
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, SITE: { ...actual.SITE, business: { ...actual.SITE.business, address: "ADDRESS-SENTINEL" } } };
});

afterEach(cleanup);

describe("TabBar", () => {
  it("is the named main navigation with four tabs", () => {
    render(<TabBar active="story" />);
    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    const links = [...nav.querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toEqual(["홈", "내 기록", "가이드", "내 정보"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/", "/story", "/guide/tarot", "/me"]);
  });

  it("marks only the active tab as the current page", () => {
    render(<TabBar active="story" />);
    expect(screen.getByRole("link", { name: "내 기록" }).getAttribute("aria-current")).toBe("page");
    for (const name of ["홈", "가이드", "내 정보"]) expect(screen.getByRole("link", { name }).hasAttribute("aria-current")).toBe(false);
  });
});

describe("Footer", () => {
  it("is the page's contentinfo with the business notice", () => {
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain("상호 열매스튜디오");
    expect(footer.textContent).toContain("대표 최용우");
    expect(footer.textContent).toContain("사업자등록번호 665-38-01736");
  });

  it("prints the business address from the config (전자상거래법 사업자 정보)", () => {
    expect(SITE.business.address).toBe("ADDRESS-SENTINEL");
    const { container } = render(<Footer />);
    expect(container.textContent).toContain("사업장 주소 ADDRESS-SENTINEL");
  });
});
