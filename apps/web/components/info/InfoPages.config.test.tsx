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
      reading: { followUps: 5, approxChars: { tarot: 1234, saju: 5678 } },
      beta: { ...actual.SITE.beta, fullPerDay: 2, teaserPerDay: 4 },
    },
  };
});

const { default: HelpPage } = await import("@/app/help/page");
const { default: FaqPage } = await import("@/app/faq/page");
const { default: HowPage } = await import("@/app/how/page");

describe("service pages take every number from SITE", () => {
  afterEach(() => {
    cleanup();
  });

  it("/help", () => {
    const text = render(<HelpPage />).container.textContent ?? "";
    expect(text).toContain("타로 전체 풀이는 한 번에 3,100원, 사주 프롤로그는 4,100원이에요.");
    expect(text).toContain("전체 풀이 하루 두 번");
    expect(text).toContain("첫 풀이는 하루 4번까지");
    expect(text).toContain("이어서 물어보기 5번");
    expect(text).toContain("약 1,234자");
    expect(text).toContain("약 5,678자");
    expect(text).not.toMatch(/2,900원|2,000자|3,000자|하루 한 번 무료로 열어요/);
  });

  it("/faq, page and JSON-LD alike", () => {
    const { container } = render(<FaqPage />);
    const text = container.textContent ?? "";
    const jsonLd = container.querySelector('script[type="application/ld+json"]')?.textContent ?? "";
    for (const body of [text, jsonLd]) {
      expect(body).toContain("하루 두 번");
      expect(body).toContain("하루 4번까지");
      expect(body).toContain("약 1,234자");
      expect(body).toContain("약 5,678자");
      expect(body).not.toMatch(/2,000자|3,000자/);
    }
  });

  it("/how", () => {
    const text = render(<HowPage />).container.textContent ?? "";
    expect(text).toContain("이어서 물어보기 5번");
  });
});
