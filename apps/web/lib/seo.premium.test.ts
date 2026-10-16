import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as robotsRoute } from "@/app/robots.txt/route";
import { GET as sitemapRoute } from "@/app/sitemap.xml/route";
import { absoluteUrl } from "./hosts";
import { robotsTxt } from "./robots";
import { SITEMAP_PATHS, sitemapXml } from "./seo";

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

  it("never disallows a premium page in robots.txt (the samples and flow screens carry noindex, which a crawler must be able to read)", async () => {
    vi.stubEnv("STARLOG_PREMIUM", "on");
    const robots = await (await robotsRoute(new Request("https://starlog.yeolmaeapps.kr/robots.txt"))).text();
    expect(robots).toBe(robotsTxt({ site: "https://starlog.yeolmaeapps.kr" }));
    expect(robots).not.toContain("/premium");
  });
});
