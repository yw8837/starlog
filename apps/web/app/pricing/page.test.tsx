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
      price: {
        tarotStandardKrw: 3100,
        sajuStandardKrw: 4100,
        unitsPerReading: 5,
        signupGiftFree: 10,
        premium: [
          { id: "deep", name: "심층 타로", sub: "카드 10장", krw: 6100, open: false, opens: "" },
          { id: "year", name: "2027 신년운세", sub: "한 해", krw: 12100, open: false, opens: "11월 중순 오픈 예정" },
        ],
      },
      reading: { followUps: 5, approxChars: { tarot: 1234, saju: 5678 } },
      beta: { fullPerDay: 2, teaserPerDay: 4 },
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
    expect(text).toContain("이어서 물어보기 5번");
    expect(text).toContain("이 기기에 계속 보관");
    expect(text).toContain("약 1,234자");
    expect(text).toContain("약 5,678자");
    expect(text).toContain("별조각 10개를 드려요. 전체 풀이를 두 번 무료로");
    expect(text).toContain("하루 두 번 무료로 열 수 있어요");
    expect(text).toContain("첫 풀이는 하루 4번까지");
    expect(text).toContain("풀이 한 번은 달빛 5개로 열려요");
    expect(text).toContain("9,900원"); // pack price
    expect(text).toContain("보너스 +5");
    expect(text).toContain("1,980원"); // 9,900 ÷ 25 × 5, exact
    expect(text).not.toMatch(/2,900원|8,500원|16,900원|27,000원/);
  });

  it("lists the premium readings as 준비 중 with their SITE prices, never naming the 10-card spread", () => {
    const { container } = render(<PricingPage />);
    const premium = container.querySelector("#premium");
    const text = premium?.textContent ?? "";
    expect(text).toContain("심층 타로");
    expect(text).toContain("6,100원");
    expect(text).toContain("2027 신년운세");
    expect(text).toContain("12,100원");
    expect(text).toContain("11월 중순 오픈 예정");
    expect(premium?.querySelectorAll("h3")).toHaveLength(2);
    for (const heading of premium?.querySelectorAll("h3") ?? []) expect(heading.textContent).toContain("준비 중");
    expect(container.textContent).not.toMatch(/켈틱|셀틱|Celtic/i);
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
