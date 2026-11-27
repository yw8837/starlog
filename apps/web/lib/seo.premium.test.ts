import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as robotsRoute } from "@/app/robots.txt/route";
import { GET as sitemapRoute } from "@/app/sitemap.xml/route";
import { absoluteUrl } from "./hosts";
import { robotsTxt } from "./robots";
import { SITE } from "./config";
import { SITEMAP_PATHS, sitemapEntries, sitemapXml } from "./seo";

/** Premium in search (plan-reconciled §4.7): the product pages are listed only while everyone may see them. */

const PRODUCT_PAGES = ["/premium/deep-tarot", "/premium/match", "/premium/newyear-2027"];
const sitemap = async () => (await sitemapRoute(new Request("https://starlog.yeolmaeapps.kr/sitemap.xml"))).text();

afterEach(() => vi.unstubAllEnvs());

describe("premium in the sitemap and robots.txt", () => {
  it("lists no premium page while STARLOG_PREMIUM is off or owner-only: today's sitemap", async () => {
    for (const mode of ["", "off", "owner"]) {
      vi.stubEnv("STARLOG_PREMIUM", mode);
      expect(await sitemap()).not.toContain("/premium/");
    }
    expect(SITEMAP_PATHS.some((path) => path.startsWith("/premium/"))).toBe(false);
  });

  it("lists the three product pages on the app host once it is on, never the samples or the flow screens", async () => {
    vi.stubEnv("STARLOG_PREMIUM", "on");
    const xml = await sitemap();
    for (const path of PRODUCT_PAGES) expect(xml).toContain(`<loc>${absoluteUrl(path)}</loc>`);
    expect(xml).not.toMatch(/\/premium\/[^<]*\/(sample|new|preview|draw|result)</);
    expect(sitemapXml("guide", { premium: true })).not.toContain("/premium/");
  });

  // Spec 2026-11-26 worry catalog §4, §5.6: the two premium worries follow their products' rule.
  it("lists the premium worries (결혼 얘기 중인 우리, 오늘도 퇴사 생각) only once premium is on, the other ten always", async () => {
    for (const mode of ["", "off", "owner"]) {
      vi.stubEnv("STARLOG_PREMIUM", mode);
      const xml = await sitemap();
      expect(xml).toContain(`<loc>${absoluteUrl("/worries")}</loc>`);
      expect(xml).toContain(`<loc>${absoluteUrl("/w/some")}</loc>`);
      expect(xml).not.toMatch(/\/w\/(marry|stay-or-go)</);
    }
    vi.stubEnv("STARLOG_PREMIUM", "on");
    const xml = await sitemap();
    for (const path of ["/w/marry", "/w/stay-or-go"]) expect(xml).toContain(`<loc>${absoluteUrl(path)}</loc>`);
    expect(sitemapXml("guide", { premium: true })).not.toContain("/w/");
  });

  // Spec 2026-11-26 worry catalog §8 (code review 2026-11-26 A3): off, neither the list nor any worry's page is listed.
  it("lists no /worries and no /w/ page while SITE.features.worries is off, premium on or not", async () => {
    const features = SITE.features as { worries: boolean };
    features.worries = false;
    try {
      for (const mode of ["", "on"]) {
        vi.stubEnv("STARLOG_PREMIUM", mode);
        const xml = await sitemap();
        expect(xml, mode).toContain(`<loc>${absoluteUrl("/pricing")}</loc>`);
        expect(xml, mode).not.toContain("/worries");
        expect(xml, mode).not.toContain("/w/");
      }
      expect(sitemapEntries({ premium: true }).some(({ path }) => path === "/worries" || path.startsWith("/w/"))).toBe(false);
    } finally {
      features.worries = true;
    }
  });

  it("never disallows a premium page in robots.txt (the samples and flow screens carry noindex, which a crawler must be able to read)", async () => {
    vi.stubEnv("STARLOG_PREMIUM", "on");
    const robots = await (await robotsRoute(new Request("https://starlog.yeolmaeapps.kr/robots.txt"))).text();
    expect(robots).toBe(robotsTxt({ site: "https://starlog.yeolmaeapps.kr" }));
    expect(robots).not.toContain("/premium");
  });
});
