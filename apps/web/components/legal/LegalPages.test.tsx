// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
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
    it(`${name}: one h1, effective 2026-10-15, and no address but the configured business one`, () => {
      const { container } = render(<Page />);
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(container.querySelector('time[datetime="2026-10-15"]')).not.toBeNull();
      // Allowed: "IP 주소" (a logged item in the privacy policy) and SITE.business.address with its label.
      const rest = (container.textContent ?? "")
        .replaceAll("IP 주소", "")
        .replaceAll("사업장 주소", "")
        .replaceAll(SITE.business.address, "");
      expect(rest).not.toContain("주소");
      expect(container.textContent).toContain("665-38-01736");
    });
  }

  it("refund: cites the withdrawal limit, the unopened-payment refund, and the governing law and guideline", () => {
    const { container } = render(<RefundPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("제17조 제2항 제5호");
    expect(text).toContain("결제하기 전에");
    expect(text).toContain("결제일로부터 7일 안에 전액 환불");
    expect(text).toContain("영업일 기준 3~7일");
    expect(text).toContain("콘텐츠이용자보호지침");
    expect(text).toContain("본인 명의 계좌로 환불");
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

  it("privacy: discloses 별자리 인연 (stored items, public ranking, share images, D1, retention, age) while it is live", () => {
    expect(SITE.features.bonds).toBe(true);
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? "";
    for (const phrase of [
      "별자리 인연",
      "닉네임",
      "한 줄",
      "인연 점수",
      "생년월일은 점수를 계산하는 데만 쓰고 저장하지 않습니다",
      "랭킹",
      "공유 이미지",
      "새로 채우거나 바꾸면 이전 별은 삭제",
      "만 14세 이상인지 확인합니다",
      "sl_uid",
      "sl_fid",
    ]) {
      expect(text).toContain(phrase);
    }
    const cloudflare = container.querySelector('[aria-label="Cloudflare, Inc."]')?.textContent ?? "";
    expect(cloudflare).toContain("Cloudflare D1");
    expect(cloudflare).toMatch(/별자리 인연 정보의 저장/);
    // sections stay numbered in order once 별자리 인연 is section 4
    const titles = [...container.querySelectorAll("h2")].map((h) => h.textContent ?? "");
    expect(titles.map((t) => Number(t.split(".")[0])).filter(Boolean)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(text).toContain("쿠키(아래 6항)");
  });

  it("terms: lists 별자리 인연 with its nickname and message rules and the owner's right to remove stars", () => {
    const { container } = render(<TermsPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("별자리 인연: 친구 초대");
    expect(text).toContain("닉네임은 2~10자로");
    expect(text).toContain("한 줄(40자 이내)");
    expect(text).toContain("자기 별자리의 별을 언제든 지울 수 있습니다");
    expect(text).toContain("모든 번호의 확률이 같습니다");
    expect(text).not.toContain("로또");
  });

  it("terms: calls readings entertainment, not professional advice, and sets the age at 14", () => {
    const { container } = render(<TermsPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("오락과 자기 성찰");
    expect(text).toContain("만 14세 이상");
  });
});
