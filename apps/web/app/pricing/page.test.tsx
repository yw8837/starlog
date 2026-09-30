// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Prices unlike the real ones: the page must show these, proving nothing is hard-coded.
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return {
    ...actual,
    SITE: {
      ...actual.SITE,
      price: { tarotStandardKrw: 3100, sajuStandardKrw: 4100, unitsPerReading: 5, signupGiftFree: 10 },
      reading: { followUps: 5 },
      moonPacks: [{ units: 20, bonus: 5, krw: 9900 }],
    },
  };
});

const { default: PricingPage, metadata } = await import("./page");

describe("/pricing", () => {
  afterEach(() => {
    cleanup();
  });

  it("takes every number from SITE", () => {
    const { container } = render(<PricingPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("3,100원"); // tarot
    expect(text).toContain("4,100원"); // saju
    expect(text).toContain("후속 질문 5번");
    expect(text).toContain("별조각 10개를 드려요. 전체 풀이를 2번 무료로");
    expect(text).toContain("풀이 한 번은 달빛 5개로 열려요");
    expect(text).toContain("9,900원"); // pack price
    expect(text).toContain("보너스 +5");
    expect(text).toContain("1,980원"); // 9,900 ÷ 25 × 5, exact
    expect(text).not.toMatch(/2,900원|8,500원|16,900원|27,000원/);
  });

  it("says payment opens after review and names Toss Payments", () => {
    const { container } = render(<PricingPage />);
    expect(container.textContent).toContain("결제는 심사 완료 후 열려요");
    expect(container.textContent).toContain("토스페이먼츠");
  });

  it("has one h1 and a description built from SITE", () => {
    const { container } = render(<PricingPage />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(metadata.description).toContain("3,100원");
  });
});
