// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Numbers unlike the real ones: the pages must show these, proving nothing is hard-coded.
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return {
    ...actual,
    SITE: {
      ...actual.SITE,
      price: { ...actual.SITE.price, tarotStandardKrw: 3100, sajuStandardKrw: 4100 },
      reading: { followUps: 5, approxChars: { tarot: { min: 1234, max: 1234 }, saju: { min: 5678, max: 6789 } } },
      beta: { ...actual.SITE.beta, firstFreeTarot: 2, teaserPerDay: 4 },
    },
  };
});

const { default: HelpPage } = await import("@/app/help/page");
const { default: FaqPage } = await import("@/app/faq/page");
const { default: HowPage } = await import("@/app/how/page");

/** Inside 오픈 기념 무료 (its last second, KST) and the first second after it. */
const LAST = Date.parse("2026-11-30T23:59:59+09:00");
const ENDED = Date.parse("2026-12-01T00:00:00+09:00");
const OPENING = "11월 30일까지 로그인한 계정마다 타로 전체 풀이 두 번을 무료로 열 수 있어요(오픈 기념 무료, 같은 기기에서는 한 번). 내 기록에 보관돼요(이어서 물어보기 제외).";

describe("service pages take every number from SITE", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("/help", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(LAST);
    const text = render(<HelpPage />).container.textContent ?? "";
    expect(text).toContain("타로 전체 풀이는 한 번에 3,100원, 사주 전체 풀이는 4,100원이에요.");
    expect(text).toContain("타로 전체 풀이 두 번 · 11월 30일까지");
    expect(text).toContain(OPENING);
    expect(text).toContain("첫 풀이는 하루 4번까지");
    expect(text).toContain("이어서 물어보기 5번");
    expect(text).toContain("약 1,234자");
    expect(text).toContain("약 5,678~6,789자");
    expect(text).not.toMatch(/2,900원|2,000자|3,000자|하루 한 번 무료로 열어요/);
  });

  it("/help drops the 오픈 기념 무료 card by itself from 2026-12-01 00:00 KST, and keeps the daily free count", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(ENDED);
    const text = render(<HelpPage />).container.textContent ?? "";
    expect(text).not.toContain("오픈 기념 무료");
    expect(text).toContain("첫 풀이는 하루 4번까지");
  });

  it("/faq, page and JSON-LD alike: the free answer leads with what stays true; 오픈 기념 무료 only in the browser, never in the JSON-LD", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(LAST);
    const { container } = render(<FaqPage />);
    const text = container.textContent ?? "";
    const jsonLd = container.querySelector('script[type="application/ld+json"]')?.textContent ?? "";
    expect(text).toContain(OPENING);
    // The refund answer may still say a 오픈 기념 무료 reading needs no refund (true for good); the offer itself never.
    expect(jsonLd).not.toMatch(/11월 30일까지|오픈 기념 무료\(/);
    for (const body of [text, jsonLd]) {
      expect(body).toContain("일부는 무료예요. 지금의 한 장은 횟수 제한 없이, 오늘의 한 장은 하루 한 번 무료이고, 타로 전체 풀이는 3,100원, 사주 전체 풀이는 4,100원이에요.");
      expect(body).toContain("하루 4번까지");
      expect(body).toContain("약 1,234자");
      expect(body).toContain("약 5,678~6,789자");
      expect(body).not.toMatch(/2,000자|3,000자/);
    }
  });

  it("/how", () => {
    const text = render(<HowPage />).container.textContent ?? "";
    expect(text).toContain("이어서 물어보기 5번");
  });
});
