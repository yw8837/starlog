// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuideArticlePage from "@/app/guide/[slug]/page";
import { SITE } from "@/lib/config";
import { findArticle, lastReviewed, type GuideArticle } from "@/lib/guide";
import { GUIDE_EDITOR, GUIDE_REVIEWS } from "@/lib/guideReview";
import { guideArticleJsonLd } from "@/lib/jsonld";
import { koreanDate } from "@/lib/legal";

/**
 * 편집 책임 and 검토 (owner decision 2026-10-23): the owner, 최용우, 대표 of 열매스튜디오, is responsible for every guide
 * article as its editor; "검토 최용우" and a day appear only on an article he has read himself, as lib/guideReview.ts
 * records it. Here 은둔자 carries a made-up record, so the page and the JSON-LD are seen with and without one.
 */

const REVIEWED = "the-hermit";
const REVIEW_DAY = "2026-10-24";

vi.mock("@/lib/guideReview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/guideReview")>();
  return { ...actual, guideReview: (slug: string) => (slug === "the-hermit" ? { by: actual.GUIDE_EDITOR.name, on: "2026-10-24" } : actual.guideReview(slug)) };
});

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", ""));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const renderSlug = async (slug: string) => render(await GuideArticlePage({ params: Promise.resolve({ slug }) } as PageProps<"/guide/[slug]">));
const byline = (container: HTMLElement) => [...container.querySelectorAll("article header p")].find((p) => p.textContent?.startsWith("글 AI 도구로 초안")) as HTMLElement | undefined;
const trustBox = (container: HTMLElement) => container.querySelector<HTMLElement>('section[aria-labelledby="trust-title"]') as HTMLElement;
const article = (slug: string) => findArticle(slug) as GuideArticle;
const dates = (slug: string) => `처음 쓴 날 ${koreanDate(article(slug).published as string)} · 마지막 수정 ${koreanDate(lastReviewed(article(slug)) as string)}`;

describe("the editor and the reviewer the guide names", () => {
  it("is the business owner by name and title, from SITE.business", () => {
    expect(SITE.business.ceo).toBe("최용우");
    expect(GUIDE_EDITOR).toEqual({ name: "최용우", title: "열매스튜디오 대표" });
  });

  it("records a review only for a real article, by the editor, on a real day between its first publication and today", () => {
    // Today in Korea (UTC+9), the day the owner would report.
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    for (const [slug, review] of Object.entries(GUIDE_REVIEWS)) {
      const reviewed = findArticle(slug);
      expect(reviewed, slug).toBeDefined();
      expect(review.by, slug).toBe(GUIDE_EDITOR.name);
      expect(review.on, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(review.on >= (reviewed?.published ?? ""), slug).toBe(true);
      expect(review.on <= today, slug).toBe(true);
    }
  });
});

describe("the byline and the trust box", () => {
  it("name the AI draft and the editor on every article, and no review where there is no record", async () => {
    const { container } = await renderSlug("the-star");
    expect(byline(container)?.textContent).toBe(`글 AI 도구로 초안 · 편집 책임 최용우(열매스튜디오 대표) · ${dates("the-star")} · 편집 원칙`);
    const box = trustBox(container).textContent ?? "";
    expect(box).toContain("편집 책임최용우(열매스튜디오 대표)");
    expect(box).toContain("만든 방법AI 도구로 초안을 쓰고");
    expect(box).not.toContain("검토");
  });

  it("add 검토 최용우 and the day on an article he has read", async () => {
    const { container } = await renderSlug(REVIEWED);
    const line = byline(container) as HTMLElement;
    expect(line.textContent).toBe(`글 AI 도구로 초안 · 편집 책임 최용우(열매스튜디오 대표) · ${dates(REVIEWED)} · 검토 최용우(2026년 10월 24일) · 편집 원칙`);
    expect([...line.querySelectorAll("time")].map((time) => time.getAttribute("datetime")).at(-1)).toBe(REVIEW_DAY);
    const box = trustBox(container);
    expect(box.textContent).toContain("검토최용우 · 2026년 10월 24일");
    expect([...box.querySelectorAll("time")].map((time) => time.getAttribute("datetime")).at(-1)).toBe(REVIEW_DAY);
  });
});

describe("the Article JSON-LD", () => {
  const person = { "@type": "Person", name: "최용우", jobTitle: "열매스튜디오 대표", url: `${SITE.guideUrl}/guide/about#editor` };

  it("names the editor as the author, a Person working for the business, and the business as the publisher", () => {
    const node = guideArticleJsonLd(article("the-star"));
    expect(node.author).toMatchObject({ ...person, worksFor: { "@type": "Organization", name: SITE.business.name } });
    expect(node.publisher).toMatchObject({ "@type": "Organization", name: SITE.business.name, url: `${SITE.url}/` });
  });

  it("marks the page reviewed (reviewedBy, lastReviewed) only where a review is on record", () => {
    const plain = guideArticleJsonLd(article("the-star"));
    expect(plain.mainEntityOfPage).not.toHaveProperty("reviewedBy");
    expect(plain.mainEntityOfPage).not.toHaveProperty("lastReviewed");
    const reviewed = guideArticleJsonLd(article(REVIEWED));
    expect(reviewed.mainEntityOfPage).toMatchObject({ "@type": "WebPage", reviewedBy: person, lastReviewed: REVIEW_DAY });
    // The dates the article itself carries stay its own: written and last changed, not reviewed.
    expect(reviewed).toMatchObject({ datePublished: article(REVIEWED).published, dateModified: lastReviewed(article(REVIEWED)) });
  });
});
