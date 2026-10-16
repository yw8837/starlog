// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import { Footer } from "./Footer";
import { TabBar } from "./TabBar";

// The footer reads the business config; a sentinel address proves it prints the configured one.
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, SITE: { ...actual.SITE, business: { ...actual.SITE.business, address: "ADDRESS-SENTINEL" } } };
});

// The deploy build sets NEXT_PUBLIC_SPLIT_HOSTS=1; these tests run on one origin unless a test says so.
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", ""));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("TabBar", () => {
  // Two variants share the name; CSS shows the bottom bar below 1024px and the header pills above.
  const navs = () => screen.getAllByRole("navigation", { name: "주요 메뉴" });
  const pills = () => navs()[0]!;
  const bar = () => navs()[1]!;
  const texts = (nav: HTMLElement) => [...nav.querySelectorAll("a")].map((a) => a.textContent);
  const hrefs = (nav: HTMLElement) => [...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"));

  it("is a header: the wordmark home link, the desktop pills, then the phone bottom bar", () => {
    render(<TabBar active="story" />);
    const header = screen.getByRole("banner");
    expect(header.querySelector("a")?.getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "스타로그 홈" })).toBeTruthy();
    expect(navs()).toHaveLength(2);
  });

  it("desktop pills: 홈 · 가이드 · FAQ · 내 기록 · 내 정보", () => {
    render(<TabBar active="story" />);
    expect(texts(pills())).toEqual(["홈", "가이드", "FAQ", "내 기록", "내 정보"]);
    expect(hrefs(pills())).toEqual(["/", "/guide/tarot", "/faq", "/story", "/me"]);
  });

  it("phone bottom bar: four tabs within thumb reach", () => {
    render(<TabBar active="story" />);
    expect(texts(bar())).toEqual(["홈", "내 기록", "가이드", "내 정보"]);
    expect(hrefs(bar())).toEqual(["/", "/story", "/guide/tarot", "/me"]);
  });

  it("on an app page with the hosts split, only the guide tab leaves for the root domain", () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    render(<TabBar active="story" />);
    expect(hrefs(pills())).toEqual(["/", `${SITE.guideUrl}/`, "/faq", "/story", "/me"]);
    expect(hrefs(bar())).toEqual(["/", "/story", `${SITE.guideUrl}/`, "/me"]);
    expect(screen.getByRole("link", { name: "스타로그 홈" }).getAttribute("href")).toBe("/");
  });

  it("on a guide page, the app tabs and the wordmark go to the app host when the hosts are split, and the guide tab stays a path: the root domain's /", () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    render(<TabBar active="guide" host="guide" />);
    expect(hrefs(pills())).toEqual([`${SITE.url}/`, "/", `${SITE.url}/faq`, `${SITE.url}/story`, `${SITE.url}/me`]);
    expect(hrefs(bar())).toEqual([`${SITE.url}/`, `${SITE.url}/story`, "/", `${SITE.url}/me`]);
    expect(screen.getByRole("link", { name: "스타로그 홈" }).getAttribute("href")).toBe(`${SITE.url}/`);
    // The active tab is still marked.
    for (const nav of navs()) expect([...nav.querySelectorAll("a")].filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent)).toEqual(["가이드"]);
  });

  it("on a guide page with one origin (dev, preview, e2e), every link is a path as before", () => {
    render(<TabBar active="guide" host="guide" />);
    expect(hrefs(pills())).toEqual(["/", "/guide/tarot", "/faq", "/story", "/me"]);
    expect(hrefs(bar())).toEqual(["/", "/story", "/guide/tarot", "/me"]);
    expect(screen.getByRole("link", { name: "스타로그 홈" }).getAttribute("href")).toBe("/");
  });

  it("marks only the active tab as the current page, in both variants", () => {
    render(<TabBar active="story" />);
    for (const nav of navs()) {
      const current = [...nav.querySelectorAll("a")].filter((a) => a.getAttribute("aria-current") === "page");
      expect(current.map((a) => a.textContent)).toEqual(["내 기록"]);
    }
  });

  it("desktop only: the header without the bottom bar (pages that keep a back bar on phones)", () => {
    render(<TabBar active="faq" only="desktop" />);
    expect(navs()).toHaveLength(1);
    expect(screen.getByRole("link", { name: "FAQ" }).getAttribute("aria-current")).toBe("page");
  });

  it("hides each variant at the other width", () => {
    const file = ["apps/web/components/layout/TabBar.module.css", "components/layout/TabBar.module.css"]
      .map((path) => resolve(process.cwd(), path))
      .find((path) => existsSync(path));
    const css = readFileSync(file ?? "", "utf8");
    const desktop = css.slice(css.indexOf("@media (min-width: 1024px)"));
    expect(css).toMatch(/\.top \{\s*display: none;/);
    expect(desktop).toMatch(/\.bar \{\s*display: none;/);
    expect(desktop).toMatch(/\.pill \{[^}]*min-height: 44px/);
  });

  it("steps the bottom bar aside while a field is typed in, so the keyboard never pushes it over the field (M-04)", () => {
    const file = ["apps/web/components/layout/TabBar.module.css", "components/layout/TabBar.module.css"]
      .map((path) => resolve(process.cwd(), path))
      .find((path) => existsSync(path));
    const css = readFileSync(file ?? "", "utf8");
    const rule = /body:has\(([^{]*)\) \.bar \{\s*display: none;\s*\}/.exec(css);
    expect(rule).not.toBeNull();
    const fields = rule![1]!;
    expect(fields).toContain("textarea:focus");
    expect(fields).toMatch(/input:focus:not\(\[type="checkbox"\], \[type="radio"\]\)/);
    // phones only: the rule sits outside the desktop block, where the bar is hidden anyway
    expect(css.indexOf(rule![0])).toBeLessThan(css.indexOf("@media (min-width: 1024px)"));
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
