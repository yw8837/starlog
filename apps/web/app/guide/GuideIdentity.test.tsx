// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContactPage, { generateMetadata as contactMetadata } from "@/app/contact/page";
import GuideArticlePage from "@/app/guide/[slug]/page";
import { generateMetadata as privacyMetadata } from "@/app/privacy/page";
import { generateMetadata as termsMetadata } from "@/app/terms/page";
import { Footer } from "@/components/layout/Footer";
import { SITE, businessFields } from "@/lib/config";
import { ALL_GUIDE_ARTICLES } from "@/lib/guide";
import { publishInstant } from "@/lib/guideMeta";
import { GUIDE_HOST_PAGES } from "@/lib/hosts";
import { sitemapXml } from "@/lib/seo";

/**
 * The root domain as a site of its own (AdSense "가치가 별로 없는 콘텐츠", 2026-11-06 audit, cause 4):
 * - /contact is a page of its own there (it used to end at the app's 404);
 * - /privacy, /terms and /contact name the host that serves them as canonical, so the root domain's copy is not a
 *   duplicate of the app's (both documents cover the guide: the cookies and ads of its pages, the guide articles);
 * - /about on the root domain moves to the guide's own 가이드 소개 (the app's /about introduces the app);
 * - an article carries two app links at most besides its sources (its own 본문 link, its product, the 보기 button),
 *   and the guide's footer names the app once.
 */

const host = vi.hoisted(() => ({ value: "starlog.yeolmaeapps.kr" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: host.value }) }));
vi.mock("next/script", async () => {
  const { createElement } = await import("react");
  return { default: ({ src }: { src: string }) => createElement("script", { "data-ads-src": src }) };
});

const APEX = new URL(SITE.guideUrl).host;
const APP = new URL(SITE.url).host;

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", ""));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  host.value = APP;
});

describe("/contact", () => {
  it("is one of the pages the root domain serves itself, with the policies", () => {
    expect([...GUIDE_HOST_PAGES]).toEqual(["/privacy", "/terms", "/contact"]);
  });

  it("names who runs the site, every business field, and where to write", () => {
    render(<ContactPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("문의");
    const text = document.body.textContent ?? "";
    for (const [label, value] of businessFields(SITE.business)) expect(text, label).toContain(value);
    const email = SITE.business.email.trim();
    if (email) expect(screen.getAllByRole("link").some((a) => a.getAttribute("href") === `mailto:${email}`)).toBe(true);
  });
});

describe("the canonical of the pages both hosts serve names the host serving it", () => {
  const PAGES = { "/privacy": privacyMetadata, "/terms": termsMetadata, "/contact": contactMetadata } as const;

  for (const [path, metadata] of Object.entries(PAGES)) {
    it(`${path}: the root domain's own address there, the app's on the app host`, async () => {
      host.value = APEX;
      expect((await metadata()).alternates?.canonical).toBe(`${SITE.guideUrl}${path}`);
      host.value = APP;
      expect((await metadata()).alternates?.canonical).toBe(path);
    });
  }

  it("lists them in both sitemaps, each on its own host", () => {
    const guide = sitemapXml("guide");
    const app = sitemapXml("app");
    for (const path of GUIDE_HOST_PAGES) {
      expect(guide, path).toContain(`<loc>${SITE.guideUrl}${path}</loc>`);
      expect(app, path).toContain(`<loc>${SITE.url}${path}</loc>`);
    }
    expect(guide).not.toContain(`<loc>${SITE.guideUrl}/about</loc>`);
  });
});

describe("the guide's links to the app", () => {
  const appLinks = (root: ParentNode) =>
    [...root.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? "").filter((href) => href.startsWith(`${SITE.url}`));

  it("the footer on the root domain names the app once, and keeps the guide's own pages and the policies on the root domain", () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    const { container } = render(<Footer host="guide" />);
    expect(appLinks(container)).toEqual([`${SITE.url}/about`]);
    const hrefs = [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    for (const path of ["/", "/guide/saju", "/guide/about", "/contact", "/terms", "/privacy"]) expect(hrefs, path).toContain(path);
  });

  it.each(ALL_GUIDE_ARTICLES.map((article) => [article.slug, article.publishAt] as const))("%s: two app links at most besides its sources", async (slug, publishAt) => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    // An article dated ahead renders from its day: the clock moves there for this render only.
    if (publishAt) {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(publishInstant(publishAt));
    }
    const { container } = render(await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">));
    const article = container.querySelector("article") as HTMLElement;
    // Calls to the app: not the trail (현재 위치, whose first crumb is the app's home) and not 근거와 방법 (/evidence), where the sources are.
    const ctas = [...article.querySelectorAll("a[href]")]
      .filter((a) => !a.closest('nav[aria-label="현재 위치"]'))
      .map((a) => a.getAttribute("href") ?? "")
      .filter((href) => href.startsWith(SITE.url) && !href.startsWith(`${SITE.url}/evidence`));
    expect(ctas.length, ctas.join(" ")).toBeLessThanOrEqual(2);
    expect(ctas.length, slug).toBeGreaterThanOrEqual(1);
  });
});
