// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import RefundPage from "@/app/refund/page";
import TermsPage from "@/app/terms/page";

const PAGES = { terms: TermsPage, privacy: PrivacyPage, refund: RefundPage } as const;

describe("policy pages", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  for (const [name, Page] of Object.entries(PAGES)) {
    it(`${name}: one h1, effective 2026-10-01, and no address anywhere`, () => {
      const { container } = render(<Page />);
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(container.querySelector('time[datetime="2026-10-01"]')).not.toBeNull();
      // "IP 주소" (a logged item in the privacy policy) is the only 주소 allowed.
      expect((container.textContent ?? "").replaceAll("IP 주소", "")).not.toContain("주소");
      expect(container.textContent).toContain("665-38-01736");
    });
  }

  it("refund: cites the withdrawal limit, the 7-day 달빛 rule, and the governing law and guideline", () => {
    const { container } = render(<RefundPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("제17조 제2항 제5호");
    expect(text).toContain("결제하기 전에");
    expect(text).toContain("7일 이내");
    expect(text).toContain("영업일 기준 3~7일");
    expect(text).toContain("콘텐츠이용자보호지침");
    expect(text).toContain("수수료");
  });

  it("privacy: names every processor and the overseas transfer", () => {
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? "";
    for (const name of ["Anthropic, PBC", "Cloudflare, Inc.", "토스페이먼츠"]) expect(text).toContain(name);
    expect(text).toContain("서버에 저장하지 않습니다");
    expect(text).toContain("만 14세 미만");
  });

  it("privacy: says no ad cookies while AdSense is off, and discloses them once it is on", () => {
    vi.stubEnv("ADSENSE_CLIENT", "");
    const off = render(<PrivacyPage />).container.textContent ?? "";
    expect(off).toContain("광고나 행동 추적을 위한 쿠키는 쓰지 않습니다");
    expect(off).not.toContain("애드센스");
    cleanup();

    vi.stubEnv("ADSENSE_CLIENT", "ca-pub-1234567890123456");
    const on = render(<PrivacyPage />).container.textContent ?? "";
    expect(on).not.toContain("광고나 행동 추적을 위한 쿠키는 쓰지 않습니다");
    expect(on).toContain("Google 애드센스");
    expect(on).toContain("행태정보");
    expect(on).toContain("Google 광고 설정");
    expect(on).toContain("풀이 화면에는 광고를 싣지 않습니다");
  });

  it("terms: calls readings entertainment, not professional advice, and sets the age at 14", () => {
    const { container } = render(<TermsPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("오락과 자기 성찰");
    expect(text).toContain("만 14세 이상");
  });
});
