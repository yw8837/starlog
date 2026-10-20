// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeepPage, { metadata as deepMeta } from "./deep-tarot/page";
import DeepSample, { metadata as deepSampleMeta } from "./deep-tarot/sample/page";
import MatchPage, { metadata as matchMeta } from "./match/page";
import MatchSample from "./match/sample/page";
import YearPage, { metadata as yearMeta } from "./newyear-2027/page";
import YearSample from "./newyear-2027/sample/page";
import { DECK_KEY } from "@/lib/deck";
import { MATCH_SECOND_SAMPLE, PREMIUM_SAMPLES } from "@/lib/premium/samples";

const gate = vi.hoisted(() => ({ visible: false, open: false, asked: [] as string[] }));
vi.mock("@/lib/premium/pageGate", () => ({
  premiumStateHere: async (id: string) => {
    gate.asked.push(id);
    return { visible: gate.visible, open: gate.open };
  },
}));
const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
}));
const redirect = vi.hoisted(() => vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT ${to}`);
}));
vi.mock("next/navigation", () => ({ notFound, redirect, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/premium" }));

const OCT = Date.parse("2026-10-20T12:00:00+09:00");
const NOV = Date.parse("2026-11-20T12:00:00+09:00");
const BANS = /셀틱|celtic|베타|오픈 기념|claude|anthropic|gpt|opus|sonnet|정확|적중|맞혀|전통 비법|비법/i;

const PAGES = [
  { id: "tarot-deep", slug: "deep-tarot", Page: DeepPage, Sample: DeepSample, meta: deepMeta, entry: "켈틱 크로스 10장", price: "7,900원", start: "/tarot/new?new=1&spread=deep", guide: "/guide/celtic-cross-spread" },
  { id: "match", slug: "match", Page: MatchPage, Sample: MatchSample, meta: matchMeta, entry: "프리미엄 궁합", price: "7,900원", start: "/premium/match/new", guide: "/guide/saju-compatibility" },
  { id: "newyear-2027", slug: "newyear-2027", Page: YearPage, Sample: YearSample, meta: yearMeta, entry: "2027 신년운세", price: "14,900원", start: "/premium/newyear-2027/new", guide: "/guide/new-year-fortune" },
] as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOV);
  vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  notFound.mockClear();
  redirect.mockClear();
  gate.asked = [];
  gate.visible = false;
  gate.open = false;
});

const show = async (page: () => Promise<ReactElement>) => render(await page());
const jsonLd = (container: HTMLElement) => JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!) as Record<string, any>;

describe("the premium product pages (stage 3, plan-reconciled §4.6)", () => {
  it("says where the 궁합 partner's details go as it works (review 2026-10-17 #1)", async () => {
    gate.visible = true;
    const { container } = await show(MatchPage);
    expect(container.textContent).toContain("그 사람의 생년월일과 태어난 시는 스타로그 서버에 남기지 않아요");
    expect(container.textContent).toContain("30일이 지난 뒤 앱을 처음 열 때 지워요");
    expect(container.textContent).not.toContain("계정에는 관계와 부르는 말만");
  });

  it("send a shared record's link (?from=share) home instead of a 404 while premium is not visible here (review 2026-10-17 L5)", async () => {
    for (const { Page } of PAGES) {
      await expect(Page({ params: Promise.resolve({}), searchParams: Promise.resolve({ from: "share" }) })).rejects.toThrow("NEXT_REDIRECT /");
    }
    gate.visible = true;
    for (const { Page } of PAGES) render(await Page({ params: Promise.resolve({}), searchParams: Promise.resolve({ from: "share" }) }));
    expect(redirect).toHaveBeenCalledTimes(3);
  });

  it("are 404 with their samples while premium is not visible here (STARLOG_PREMIUM off)", async () => {
    for (const { Page, Sample, id } of PAGES) {
      await expect(Page()).rejects.toThrow("404");
      await expect(Sample()).rejects.toThrow("404");
      expect(gate.asked.slice(-2)).toEqual([id, id]);
    }
  });

  for (const { id, slug, Page, meta, entry, price, start, guide } of PAGES) {
    it(`${entry}: name, price, how it reads, a sample excerpt and its full sample, the guide, three questions and the refund summary`, async () => {
      gate.visible = true;
      gate.open = true;
      const { container } = await show(Page);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(entry);
      expect(container.textContent).toContain(price);
      const how = screen.getByRole("region", { name: "이렇게 읽어요" });
      expect(within(how).getAllByRole("listitem").length).toBeGreaterThanOrEqual(3 + 3);
      expect(how.textContent).toContain("이어서 물어보기 3번");
      // every product shows its approved sample (the 궁합's real ones from 2026-10-20)
      expect(screen.getByRole("region", { name: "샘플로 미리 보기" }).textContent).toContain("가상의 입력으로 만든 샘플이에요");
      expect(screen.getByRole("link", { name: /샘플 전체 보기/ }).getAttribute("href")).toBe(`/premium/${slug}/sample`);
      expect(container.querySelector(`a[href="${guide}"]`)).not.toBeNull();
      expect(container.querySelectorAll("details")).toHaveLength(3);
      expect(screen.getByRole("region", { name: "결제와 환불" }).querySelector('a[href="/refund"]')).not.toBeNull();
      // One gold primary: 시작하기 at the top; the repeat further down is a secondary.
      const starts = screen.getAllByRole("link", { name: /시작하기/ });
      expect(starts.map((a) => a.getAttribute("href"))).toEqual([start, start]);
      expect(container.querySelectorAll('a[class*="primary"]')).toHaveLength(1);
      expect(container.textContent).not.toMatch(BANS);
      const ld = jsonLd(container);
      expect(ld).toMatchObject({ "@type": "Product", offers: { "@type": "Offer", priceCurrency: "KRW", price: Number(price.replace(/\D/g, "")), availability: "https://schema.org/InStock" } });
      expect(meta.alternates?.canonical).toBe(`/premium/${slug}`);
      expect(String(meta.description).length).toBeLessThanOrEqual(155);
      expect(String(meta.description)).toContain(price);
      expect(id).toBeTruthy();
    });
  }

  it("프리미엄 궁합 reads the two people's saju only (owner 2026-10-17): its description, method, steps and questions name no card or 타로, and say the year ahead", async () => {
    gate.visible = true;
    gate.open = true;
    const { container } = await show(MatchPage);
    const how = screen.getByRole("region", { name: "이렇게 읽어요" }).textContent ?? "";
    expect(how).toContain("앞으로 1년");
    expect(how).toContain("서로에게 맞는 말과 행동");
    expect(how).toContain("'사주로 본 두 사람'과 '앞으로 1년과 서로 대하는 법'");
    // the product's own page (the site footer says 카드와 사주 for the whole site)
    expect(container.querySelector("article")!.textContent?.match(/.{0,30}(카드|(?<!스)타로).{0,30}/g) ?? []).toEqual([]);
    expect(String(matchMeta.description)).not.toMatch(/카드|타로/);
    expect(String(matchMeta.description)).toContain("앞으로 1년");
    // plain words: "두 사람의 결과" read as a result (review 2026-10-20 LOW)
    expect(String(matchMeta.description)).toContain("두 사람의 관계와 앞으로 1년");
    expect(String(matchMeta.description)).not.toContain("결과");
  });

  it("2027 신년운세 on sale now (owner 2026-10-20): 시작하기, no opening date, in stock, sold until 2027-11-30", async () => {
    vi.setSystemTime(OCT);
    gate.visible = true;
    gate.open = true;
    const { container } = await show(YearPage);
    expect(screen.getAllByRole("link", { name: /시작하기/ }).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/열려요|오픈 예정|2026년 11월 15일/);
    expect(container.textContent).toContain("2027년 11월 30일까지 열 수 있어요");
    expect(jsonLd(container).offers.availability).toBe("https://schema.org/InStock");
  });

  it("an undated product this device cannot start says 준비 중이에요, no button", async () => {
    gate.visible = true;
    gate.open = false;
    await show(MatchPage);
    expect(screen.getAllByText("준비 중이에요").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /시작하기/ })).toBeNull();
  });
});

describe("the premium sample pages", () => {
  it("are never indexed, say the sample is made from a made-up input, and show the whole reading", async () => {
    gate.visible = true;
    expect(deepSampleMeta.robots).toMatchObject({ index: false, follow: true });
    for (const { Sample, entry } of PAGES) {
      const { container } = await show(Sample);
      expect(container.textContent).toContain("가상의 입력으로 만든 샘플이에요");
      expect(container.textContent).toContain(entry);
      expect(container.querySelectorAll("h2").length).toBeGreaterThan(5);
      expect(container.textContent).not.toMatch(BANS);
      cleanup();
    }
  });

  it("show the 궁합's second sample after the first: the other person's time unknown (owner 2026-10-17), with no card", async () => {
    gate.visible = true;
    const { container } = render(await MatchSample());
    const text = container.textContent ?? "";
    expect(MATCH_SECOND_SAMPLE.placeholder).toBeUndefined();
    expect(container.querySelectorAll("img[src*='/cards/']")).toHaveLength(0);
    expect(screen.getAllByRole("heading", { name: "앞으로 1년과 서로 대하는 법" })).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "상대가 태어난 시를 몰라도" })).toBeTruthy();
    expect(text.indexOf("두 사람 모두 태어난 시를 알아요")).toBeLessThan(text.indexOf("상대가 태어난 시를 몰라요"));
    expect(text.split("가상의 입력으로 만든 샘플이에요")).toHaveLength(3);
  });

  it("show each sample's cards in the deck it records (the one its text describes), whatever this visitor chose", async () => {
    gate.visible = true;
    // the 궁합's read no cards (saju only, owner 2026-10-17)
    const pages = [{ Sample: DeepSample, samples: [PREMIUM_SAMPLES["tarot-deep"]] }];
    try {
      for (const { Sample, samples } of pages) {
        for (const sample of samples) {
          // The visitor chose the other deck: the sample still shows its own.
          localStorage.setItem(DECK_KEY, JSON.stringify({ front: sample.deck === "starlog" ? "rws1909" : "starlog", back: "constellation" }));
          const { container } = await show(Sample);
          const faces = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src") ?? "").filter((src) => sample.cards.some((c) => src.includes(c.cardId)));
          expect(faces.length).toBeGreaterThan(0);
          for (const src of faces) expect([sample.deck, src.startsWith("/cards/starlog/")]).toEqual([sample.deck, sample.deck === "starlog"]);
          cleanup();
        }
      }
    } finally {
      localStorage.removeItem(DECK_KEY);
    }
  });
});
