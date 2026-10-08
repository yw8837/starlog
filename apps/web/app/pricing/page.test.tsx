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
          { id: "tarot-deep", slug: "deep-tarot", name: "심층 타로", sub: "카드 10장", krw: 6100, opens: "", opensAt: "", closesAt: "" },
          {
            id: "newyear-2027", slug: "newyear-2027", name: "2027 신년운세", sub: "한 해", krw: 12100,
            opens: "11월 중순 오픈 예정", opensAt: "2026-11-15T00:00:00+09:00", closesAt: "2027-12-01T00:00:00+09:00",
          },
        ],
      },
      reading: { followUps: 5, approxChars: { tarot: { min: 1234, max: 1234 }, saju: { min: 5678, max: 6789 } } },
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
    expect(text).toContain("약 5,678~6,789자");
    expect(text).toContain("별조각 10개를 드려요. 전체 풀이를 두 번 무료로");
    expect(text).toContain("첫 풀이는 하루 4번까지");
    expect(text).toContain("전체 풀이 한 번에 5개가 쓰여요");
    expect(text).not.toMatch(/2,900원|8,500원|16,900원|27,000원/);
    expect(text).not.toContain("충전");
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

  it("shows each reading on sale with a picture, and says when it is provided and how it is refunded", () => {
    const { container } = render(<PricingPage />);
    const cards = [...container.querySelectorAll("#readings section")];
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.querySelector('[role="img"]')?.getAttribute("aria-label")).toBeTruthy();
      expect(card.textContent).toContain("서비스 제공 기간: 결제 즉시 · 결제하면 바로 풀이가 열리는 디지털 콘텐츠예요.");
      expect(card.textContent).toContain("열기 전에는 결제일로부터 7일 안에 전액 환불받을 수 있어요.");
      expect(card.querySelector('a[href="/refund"]')?.textContent).toBe("환불 정책");
    }
  });

  it("says readings are paid one by one and names Toss Payments", () => {
    const { container } = render(<PricingPage />);
    expect(container.textContent).toContain("풀이는 건별로 결제하고, 결제하면 바로 열려요");
    expect(container.textContent).toContain("토스페이먼츠");
  });

  it("has one h1 and a description built from SITE", () => {
    const { container } = render(<PricingPage />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(metadata.description).toContain("3,100원");
  });

  it("says one payment opens one chosen reading and that the four 운's teasers are free (saju-topics owner cut §0)", () => {
    const { container } = render(<PricingPage />);
    expect(container.textContent).toContain("사주팔자·연애운·재회운·재물운·직장운 가운데 고른 풀이 하나");
    expect(container.textContent).toContain("연애운, 재회운, 재물운, 직장운의 맛보기도 무료이고, 새로 여는 맛보기는 하루 4번까지");
  });
});
