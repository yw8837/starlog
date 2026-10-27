// @vitest-environment jsdom
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_POLICY, SEOUL } from "@starlog/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuideAboutPage, { metadata } from "@/app/guide/about/page";
import { Footer } from "@/components/layout/Footer";
import { SITE } from "@/lib/config";
import { guideReferences } from "@/lib/evidence";
import { GUIDE_ABOUT_PATH, GUIDE_ARTICLES, articlesIn, lastReviewed } from "@/lib/guide";
import { koreanDate } from "@/lib/legal";
import { policyLines } from "@/lib/sajuCriteria";
import { sitemapEntriesFor } from "@/lib/seo";

/**
 * 가이드 소개와 편집 원칙 (/guide/about), the page AdSense reviewers and readers look for: Who makes the guide, How an
 * article is written and checked (AI drafts checked against the sources, said as it is), Why it exists, how often it
 * is checked again, how to report an error, and that tarot and saju are for fun and reflection, not advice.
 */

vi.mock("next/script", async () => {
  const { createElement } = await import("react");
  return { default: ({ src }: { src: string }) => createElement("script", { "data-ads-src": src }) };
});

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", ""));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const main = () => screen.getByRole("main");
const text = () => main().textContent ?? "";
const section = (id: string) => main().querySelector<HTMLElement>(`section[aria-labelledby="${id}-title"]`) as HTMLElement;

describe("the editorial page", () => {
  it("is a static route next to [slug], and no article takes its slug", () => {
    expect(GUIDE_ABOUT_PATH).toBe("/guide/about");
    // jsdom tests have no file: import.meta.url; vitest runs from the repo root or from apps/web.
    expect(["apps/web/app/guide/about/page.tsx", "app/guide/about/page.tsx"].some((path) => existsSync(resolve(process.cwd(), path)))).toBe(true);
    expect(GUIDE_ARTICLES.map((article) => article.slug)).not.toContain("about");
  });

  it("has one h1, and says what the guide is, for whom and why, with the live article counts", () => {
    render(<GuideAboutPage />);
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["가이드 소개와 편집 원칙"]);
    const what = section("what").textContent ?? "";
    expect(what).toContain("처음 접하는 분");
    expect(what).toContain("직접");
    expect(what).toContain("참고");
    expect(what).toContain(`타로 글 ${articlesIn("tarot").length}편`);
    expect(what).toContain(`사주 글 ${articlesIn("saju").length}편`);
    // The tarot count includes the suit and court card articles, so the scope names them too.
    expect(what).toContain("마이너 아르카나 네 벌과 코트 카드");
  });

  it("Who: the business that makes and runs it, from SITE.business", () => {
    render(<GuideAboutPage />);
    const who = section("who").textContent ?? "";
    for (const value of [SITE.business.name, SITE.business.ceo, SITE.business.regNo, SITE.business.mailOrderNo, SITE.business.address, SITE.business.email, SITE.business.phone]) {
      expect(who, value).toContain(value);
    }
  });

  it("How: AI drafts checked against the 1909 deck, Waite's public-domain book, the card KB and the app's calendar rules", () => {
    render(<GuideAboutPage />);
    const how = section("how").textContent ?? "";
    expect(how).toContain("AI 도구로 초안");
    for (const words of ["1909년", "라이더-웨이트-스미스", "The Pictorial Key to the Tarot", "퍼블릭 도메인", "카드 지식 베이스", "만세력"]) expect(how, words).toContain(words);
    // The calendar rules are the app's own words for its default policy, not a retelling.
    for (const line of policyLines(DEFAULT_POLICY, SEOUL)) expect(how, line).toContain(line);
  });

  it("names the editor responsible for every article, how an article is made, when a review appears, and the contact email", () => {
    render(<GuideAboutPage />);
    const editor = section("editor");
    // Its own anchor: the Article JSON-LD's author links here.
    expect(editor.id).toBe("editor");
    expect(within(editor).getByRole("heading", { level: 2 }).textContent).toBe("책임 편집");
    const words = editor.textContent ?? "";
    expect(words).toContain("열매스튜디오 대표 최용우가 스타로그를 기획하고 운영해요.");
    expect(words).toContain("AI 도구로 초안");
    expect(words).toContain("자동 검사");
    expect(words).toContain("모든 글의 편집 책임은 최용우에게 있어요.");
    expect(words).toContain("최용우가 직접 읽고 확인한 글에만");
    expect(within(editor).getAllByRole("link").map((a) => a.getAttribute("href"))).toContain(`mailto:${SITE.business.email}`);
    // No credentials or years of experience nobody has stated.
    expect(words).not.toMatch(/경력|\d+년(간| 동안| 넘게| 차)|전문가|자격|명리학자|타로 마스터/);
  });

  it("says what the automatic checks cover and what they do not, and claims no review it cannot show", () => {
    render(<GuideAboutPage />);
    const checks = section("checks").textContent ?? "";
    expect(checks).toContain("자동 검사");
    expect(checks).toContain("카드 지식 베이스");
    expect(checks).toContain("만세력 엔진");
    // The checks that run today (lib/guide-articles/*.test.ts, lib/guideLinks.test.ts): the KB's misdescriptions of each
    // picture, Waite named for his words, the example charts recomputed, no copied frames, links on the allowlist.
    for (const words of ["잘못 묘사하기 쉽다", "웨이트", "예시 명식", "다시 세웠을 때", "이름만 바꾼", "허용 목록"]) expect(checks, words).toContain(words);
    // Card articles have had no keyword table since 2026-10-23 (blocks.test.ts forbids one): the page claims none.
    expect(text()).not.toContain("키워드 표");
    // No unverifiable claims: no line-by-line human review, no expert sign-off (the KB is still a draft, content/kb/README.md).
    for (const claim of ["한 줄씩", "전문가 검수", "검수 완료", "전문가가 검토"]) expect(text(), claim).not.toContain(claim);
  });

  it("says articles are checked again and dated, without promising a cadence the owner has not set, and what 마지막 수정 means", () => {
    render(<GuideAboutPage />);
    const review = section("review").textContent ?? "";
    expect(review).toContain("글을 고칠 때마다 제목 아래 날짜를 바꿔요");
    // Said as it is done: a date changes when the article does, not on a schedule nobody keeps.
    expect(text()).not.toContain("주기적");
    // No fixed interval until the owner sets one.
    expect(text()).not.toMatch(/석 달|세 달|분기|매달|매주|\d+\s*(일|주|개월|달)(에|마다) 한 번/);
    expect(review).toContain("마지막 수정");
    // The date an article last changed is not a review: 검토 is only what the owner has read (lib/guideReview.ts).
    expect(text()).not.toContain("마지막 검토");
    const latest = GUIDE_ARTICLES.map(lastReviewed).filter((date): date is string => Boolean(date)).sort().at(-1) as string;
    expect(review).toContain(koreanDate(latest));
  });

  it("says tarot and saju are for fun and reflection, and not medical, legal or financial advice", () => {
    render(<GuideAboutPage />);
    const note = section("disclaimer").textContent ?? "";
    for (const words of ["재미", "돌아보", "의료", "법률", "재정", "전문가"]) expect(note, words).toContain(words);
  });

  it("gives an error report its own anchor (#contact) with the email and phone as links", () => {
    render(<GuideAboutPage />);
    const contact = section("contact");
    expect(contact.id).toBe("contact");
    const hrefs = within(contact).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`mailto:${SITE.business.email}`);
    expect(hrefs).toContain(`tel:${SITE.business.phone.replaceAll("-", "")}`);
  });

  it("lists the tarot and the saju sources, the same rows the articles show", () => {
    render(<GuideAboutPage />);
    const sources = section("sources").textContent ?? "";
    for (const row of [...guideReferences("tarot"), ...guideReferences("saju")]) expect(sources, row.title).toContain(row.title);
  });

  it("leads on to the guide's home and both tabs, and the operator's page", () => {
    render(<GuideAboutPage />);
    const more = within(screen.getByRole("navigation", { name: "더 둘러보기" })).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(more).toEqual(expect.arrayContaining(["/guide/tarot", "/guide/saju", "/about"]));
    cleanup();
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    render(<GuideAboutPage />);
    const split = within(screen.getByRole("navigation", { name: "더 둘러보기" })).getAllByRole("link").map((a) => a.getAttribute("href"));
    // On the root domain the tarot tab is its "/", and /about is served there too.
    expect(split).toEqual(expect.arrayContaining(["/", "/guide/saju", "/about"]));
  });

  it("carries no ad, no ad script and nothing unfinished", () => {
    vi.stubEnv("ADSENSE_CLIENT", "ca-pub-1234567890123456");
    vi.stubEnv("ADSENSE_SLOT_GUIDE", "1234567890");
    const { container } = render(<GuideAboutPage />);
    expect(container.querySelector("script[data-ads-src]")).toBeNull();
    expect(container.querySelector("ins.adsbygoogle")).toBeNull();
    expect(container.querySelector('aside[aria-label="광고"]')).toBeNull();
    expect(container.textContent).not.toMatch(/준비 중|개발 중|공사 중/);
  });

  it("is indexable on the root domain with its own title and description, and listed in the root domain's sitemap", () => {
    expect(metadata.title).toBe("가이드 소개와 편집 원칙");
    expect(metadata.alternates?.canonical).toBe(`${SITE.guideUrl}${GUIDE_ABOUT_PATH}`);
    expect(metadata.openGraph).toMatchObject({ type: "website", url: `${SITE.guideUrl}${GUIDE_ABOUT_PATH}` });
    const description = String(metadata.description);
    expect(description.length).toBeGreaterThanOrEqual(60);
    expect(description.length).toBeLessThanOrEqual(130);
    expect(sitemapEntriesFor("guide").map((entry) => entry.path)).toContain(GUIDE_ABOUT_PATH);
  });
});

describe("the root domain's footer", () => {
  it("links the editorial page and the contact anchor on a guide page, as paths on the root domain", () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    render(<Footer host="guide" />);
    const links = within(screen.getByRole("navigation", { name: "사이트 안내" })).getAllByRole("link");
    const byLabel = Object.fromEntries(links.map((a) => [a.textContent, a.getAttribute("href")]));
    expect(byLabel["편집 원칙"]).toBe(GUIDE_ABOUT_PATH);
    expect(byLabel["문의"]).toBe(`${GUIDE_ABOUT_PATH}#contact`);
    // The operator's page and the two policies stay on the root domain too (it serves them itself).
    expect(byLabel["스타로그란?"]).toBe("/about");
    expect(byLabel["이용약관"]).toBe("/terms");
    expect(byLabel["개인정보처리방침"]).toBe("/privacy");
  });

  it("keeps the app host's footer as it is", () => {
    render(<Footer />);
    const labels = within(screen.getByRole("navigation", { name: "사이트 안내" })).getAllByRole("link").map((a) => a.textContent);
    expect(labels).not.toContain("편집 원칙");
    expect(labels).not.toContain("문의");
  });
});
