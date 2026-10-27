// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AboutPage from "@/app/about/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { SITE } from "@/lib/config";
import { GUIDE_HOST_PAGES, guideHostServes } from "@/lib/hosts";

/**
 * /about, /privacy and /terms are served on the root domain too (GUIDE_HOST_PAGES), from the same HTML as on the app host,
 * and every other app path is a redirect from there (lib/hostRoutes.ts). So with the hosts split, every link on them names its
 * host: absolute, a fragment, or a path the root domain serves itself (AdSense audit 2026-10-27: 11 relative app links
 * took that redirect hop).
 */
const PAGES = { "/about": AboutPage, "/privacy": PrivacyPage, "/terms": TermsPage } as const;

const hrefs = (root: ParentNode) => [...root.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? "");

/** No hop on either host: absolute, mailto/tel, a fragment, the root (the guide's home on the root domain), or a page the root domain serves. */
const noHop = (href: string) => /^(https?:|mailto:|tel:|#)/.test(href) || href === "/" || guideHostServes(href.split(/[?#]/)[0] ?? "");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-10-27T12:00:00+09:00"));
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("the app pages the root domain serves itself", () => {
  it("are exactly these three", () => {
    expect(Object.keys(PAGES)).toEqual([...GUIDE_HOST_PAGES]);
  });

  for (const [path, Page] of Object.entries(PAGES)) {
    it(`${path}: with the hosts split, no link is a relative app path the root domain would redirect`, () => {
      vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
      const { container } = render(<Page />);
      const links = hrefs(container);
      expect(links.length).toBeGreaterThan(5);
      expect(links.filter((href) => !noHop(href))).toEqual([]);
      // The app's pages are named on the app host.
      expect(links.some((href) => href.startsWith(`${SITE.url}/`))).toBe(true);
    });

    it(`${path}: on one origin (dev, preview, e2e) the links stay paths`, () => {
      const { container } = render(<Page />);
      expect(hrefs(container).filter((href) => href.startsWith(SITE.url) || href.startsWith(SITE.guideUrl))).toEqual([]);
    });
  }

  it("/about's two buttons open the readings at their plain addresses, on the app host (no ?new=1: from /about a flow starts clean)", () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    const { container } = render(<AboutPage />);
    // The two Buttons at the end (the text's own 사주 보기 link to /saju/new is not one of them).
    const buttons = [...container.querySelectorAll<HTMLAnchorElement>('a[class*="btn"]')];
    expect(buttons.map((a) => a.getAttribute("href"))).toEqual([`${SITE.url}/tarot/new`, `${SITE.url}/saju/start`]);
  });

  it("/about points at the guide's editorial page near the top, on the root domain", () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    const { container } = render(<AboutPage />);
    const article = container.querySelector("article") as HTMLElement;
    const first = article.querySelector("a[href]");
    expect(first?.getAttribute("href")).toBe(`${SITE.guideUrl}/guide/about`);
    expect(first?.textContent).toBe("가이드 소개와 편집 원칙");
  });
});
