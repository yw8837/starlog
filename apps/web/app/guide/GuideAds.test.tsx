// @vitest-environment jsdom
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuideArticlePage from "@/app/guide/[slug]/page";
import GuideAboutPage from "@/app/guide/about/page";
import GuideLayout from "@/app/guide/layout";
import GuideSajuPage from "@/app/guide/saju/page";
import GuideTarotPage from "@/app/guide/tarot/page";
import { GUIDE_ARTICLES, guideSectionText, type GuideArticle } from "@/lib/guide";

/**
 * Where ads may appear (AdSense publisher policy: no ads on screens without publisher content or with low-value
 * content, under construction, or used for navigation; https://support.google.com/adsense/answer/9335564): only on a
 * guide article with a substantial body, one unit at most, after its title and never inside its trust box. The hubs,
 * the tab lists and the editorial page carry no ad and no ad script; with ads off nothing ad-shaped renders at all.
 */

/** The body an article needs for the unit (MIN_AD_BODY_CHARS in app/guide/[slug]/page.tsx): its sections' text joined, guideSectionText. */
const MIN_AD_BODY = 2500;
const bodyLength = (a: GuideArticle) => a.sections.map(guideSectionText).join("\n").length;

// An article with enough sections for the slot but too little text for an ad: the slot must stay out. Two more sit
// one character either side of the line (four bodies joined by three line breaks).
const { THIN, UNDER, AT } = vi.hoisted(() => {
  const made = (slug: string, last: string): GuideArticle => ({
    slug,
    title: "본문 길이를 보는 글",
    category: "saju",
    description: "섹션은 넉넉하고 본문 길이만 다른 글이에요.",
    published: "2026-10-01",
    sections: [
      { heading: "첫 절", body: "짧은 문단이에요." },
      { heading: "둘째 절", body: "짧은 문단이에요." },
      { heading: "셋째 절", body: "짧은 문단이에요." },
      { heading: "넷째 절", body: last },
    ],
  });
  // Three bodies of 9 characters and three line breaks: 30 before the last body.
  return { THIN: made("thin-article", "짧은 문단이에요."), UNDER: made("almost-article", "가".repeat(2500 - 30 - 1)), AT: made("enough-article", "가".repeat(2500 - 30)) };
});
vi.mock("@/lib/guide", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/guide")>();
  const made = new Map([THIN, UNDER, AT].map((a) => [a.slug, a]));
  return { ...actual, findArticle: (slug: string) => made.get(slug) ?? actual.findArticle(slug) };
});

vi.mock("next/script", async () => {
  const { createElement } = await import("react");
  return { default: ({ src }: { src: string }) => createElement("script", { "data-ads-src": src }) };
});

const CLIENT = "ca-pub-1234567890123456";
const SLOT = "1234567890";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "");
  vi.stubEnv("ADSENSE_CLIENT", CLIENT);
  vi.stubEnv("ADSENSE_SLOT_GUIDE", SLOT);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const article = async (slug: string) => GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">);
const adParts = (root: ParentNode) => ({
  scripts: root.querySelectorAll("script[data-ads-src]").length,
  units: root.querySelectorAll("ins.adsbygoogle").length,
  slots: root.querySelectorAll('aside[aria-label="광고"]').length,
});

describe("ads on guide articles", () => {
  it.each(GUIDE_ARTICLES.map((a) => [a.slug, a] as const))("%s: one unit at most, after the title, outside the header and the trust box", async (slug) => {
    const { container } = render(<GuideLayout>{await article(slug)}</GuideLayout>);
    const parts = adParts(container);
    expect(parts.scripts).toBe(1);
    expect(parts.units).toBeLessThanOrEqual(1);
    const ad = container.querySelector<HTMLElement>('aside[aria-label="광고"]');
    if (ad) {
      const h1 = container.querySelector("h1") as HTMLElement;
      expect(h1.compareDocumentPosition(ad)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(ad.closest("header")).toBeNull();
      expect(ad.closest('section[aria-labelledby="trust-title"]')).toBeNull();
    }
    cleanup();
  });

  it("puts the unit into a real article exactly when its body reaches 2,500 characters: a thin article carries none", async () => {
    let withAd = 0;
    for (const a of GUIDE_ARTICLES) {
      const { container } = render(await article(a.slug));
      const substantial = bodyLength(a) >= MIN_AD_BODY && a.sections.length > 2;
      expect(adParts(container).units, `${a.slug}: ${bodyLength(a)} characters`).toBe(substantial ? 1 : 0);
      if (substantial) withAd += 1;
      cleanup();
    }
    expect(withAd).toBeGreaterThan(0);
    // Renders every article in one test: a minute, for when the whole suite shares the machine.
  }, 60_000);

  it("puts no unit into an article whose body is too short, however many sections it has", async () => {
    const { container } = render(await article(THIN.slug));
    expect(THIN.sections.length).toBeGreaterThan(2);
    expect(adParts(container).units).toBe(0);
    expect(adParts(container).slots).toBe(0);
  });

  it("draws the line at 2,500 characters of body: one short of it, no unit; at it, one", async () => {
    expect([bodyLength(UNDER), bodyLength(AT)]).toEqual([MIN_AD_BODY - 1, MIN_AD_BODY]);
    const under = render(await article(UNDER.slug));
    expect(adParts(under.container)).toMatchObject({ units: 0, slots: 0 });
    cleanup();
    const at = render(await article(AT.slug));
    expect(adParts(at.container)).toMatchObject({ units: 1, slots: 1 });
  });

  it("renders nothing ad-shaped and loads no script when ads are off", async () => {
    vi.stubEnv("ADSENSE_CLIENT", "");
    const { container } = render(<GuideLayout>{await article("five-elements")}</GuideLayout>);
    expect(adParts(container)).toEqual({ scripts: 0, units: 0, slots: 0 });
  });
});

describe("no ads on the guide's list and info pages", () => {
  it.each([
    ["the guide's home (tarot tab)", () => <GuideTarotPage />],
    ["the saju tab", () => <GuideSajuPage />],
    ["the editorial page", () => <GuideAboutPage />],
  ])("%s: no ad script, no unit, no slot", (_name, Page) => {
    const { container } = render(<GuideLayout>{Page()}</GuideLayout>);
    expect(adParts(container)).toEqual({ scripts: 0, units: 0, slots: 0 });
  });

  it("only the guide article page renders an ad unit or loads the ad script, in the whole app", () => {
    const web = ["apps/web", "."].map((path) => resolve(process.cwd(), path)).find((path) => existsSync(join(path, "app/guide"))) ?? "";
    const loaders: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const file of readdirSync(join(web, dir), { recursive: true, encoding: "utf8" })) {
        if (!/\.(tsx?|mjs)$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
        const path = `${dir}/${file.replaceAll("\\", "/")}`;
        if (path === "components/ads/AdSlot.tsx" || path === "lib/ads.ts") continue;
        if (/\bAdSlot\b|adsScriptSrc|adsbygoogle/.test(readFileSync(join(web, path), "utf8"))) loaders.push(path);
      }
    }
    expect(loaders).toEqual(["app/guide/[slug]/page.tsx"]);
  });
});
