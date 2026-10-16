// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import RefundPage from "@/app/refund/page";
import TermsPage from "@/app/terms/page";
import { PREMIUM_LEGAL_EFFECTIVE_DATE } from "@/lib/legal";
import { productById, sellable } from "@/lib/pay/catalog";
import { premiumOpen } from "@/lib/premium/flags";
import { opensOnText } from "@/lib/premium/offer";
import { PREMIUM } from "@/lib/premium/products";

/**
 * Owner 2026-10-17: the premium clauses are announced with this deploy and in force 7 days later, 2026-10-24 00:00 KST,
 * when 켈틱 크로스 10장 and 프리미엄 궁합 go on sale too. Before that moment each policy keeps today's text and 시행일, with
 * a notice on top and the clauses shown as 개정 예정; from it, the code puts them in the text, no deploy needed.
 */

const BEFORE = Date.parse("2026-10-23T23:59:00+09:00");
const AT = Date.parse("2026-10-24T00:00:00+09:00");
const PAGES = [TermsPage, PrivacyPage, RefundPage];
const NOTICE = "2026년 10월 24일부터 바뀌는 내용";
const UPCOMING = "개정 예정 · 2026년 10월 24일부터 시행";
const MATCH_ROW = "프리미엄 궁합: 상대방의 부르는 말과 관계";
const on = { NODE_ENV: "test", STARLOG_PREMIUM: "on", STARLOG_PAYMENTS: "on" } as unknown as NodeJS.ProcessEnv;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("the premium clauses, announced now and in force from 2026-10-24 00:00 KST (owner 2026-10-17)", () => {
  it("keeps one moment for the clauses and for the two products' sale", () => {
    expect(Date.parse(`${PREMIUM_LEGAL_EFFECTIVE_DATE}T00:00:00+09:00`)).toBe(AT);
    expect([PREMIUM["tarot-deep"].opensAt, PREMIUM.match.opensAt]).toEqual([AT, AT]);
    expect(PREMIUM["newyear-2027"].opensAt).toBe(Date.parse("2026-11-15T00:00:00+09:00"));
  });

  it("at 10/23 23:59: today's text and 시행일 2026-10-15, a notice on top, the clauses as 개정 예정", () => {
    vi.setSystemTime(BEFORE);
    for (const Page of PAGES) {
      const { container } = render(<Page />);
      expect(screen.getByRole("heading", { name: NOTICE })).toBeTruthy();
      expect(within(screen.getByRole("group", { name: UPCOMING })).getAllByText(/프리미엄 풀이/).length).toBeGreaterThan(0);
      expect(container.textContent).toContain("2026년 10월 15일");
      expect(container.textContent).not.toContain("2026년 10월 24일부터 시행합니다");
      cleanup();
    }
    render(<TermsPage />);
    expect(within(screen.getByRole("group", { name: UPCOMING })).getByRole("region", { name: "제7조의3 (프리미엄 풀이)" })).toBeTruthy();
    cleanup();
    // The AI transfer table names the 궁합's items only inside the 개정 예정.
    const { container } = render(<PrivacyPage />);
    expect(container.textContent?.split(MATCH_ROW)).toHaveLength(2);
    expect(within(screen.getByRole("group", { name: UPCOMING })).getByText(new RegExp(MATCH_ROW))).toBeTruthy();
  });

  it("from 10/24 00:00: the clauses in the text, 시행일 2026-10-24, no notice", () => {
    vi.setSystemTime(AT);
    for (const Page of PAGES) {
      const { container } = render(<Page />);
      expect(screen.queryByRole("heading", { name: NOTICE })).toBeNull();
      expect(screen.queryByRole("group", { name: UPCOMING })).toBeNull();
      expect(container.textContent).toMatch(/프리미엄 풀이/);
      expect(container.textContent).toContain("2026년 10월 24일");
      cleanup();
    }
    render(<TermsPage />);
    expect(screen.getByRole("region", { name: "제7조의3 (프리미엄 풀이)" })).toBeTruthy();
    cleanup();
    const { container } = render(<PrivacyPage />);
    expect(container.textContent).toContain(MATCH_ROW);
  });

  it("opens 켈틱 크로스 10장 and 프리미엄 궁합 for sale at that moment (STARLOG_PREMIUM on, payments open); the owner pass opens before", () => {
    for (const id of ["tarot-deep", "match"] as const) {
      expect(premiumOpen(id, false, BEFORE, on)).toBe(false);
      expect(premiumOpen(id, false, AT, on)).toBe(true);
      expect(premiumOpen(id, true, BEFORE, on)).toBe(true);
      expect(sellable(productById(id)!, BEFORE)).toBe(false);
      expect(sellable(productById(id)!, AT)).toBe(true);
    }
    // Where premium is visible before then, its rows say when.
    expect(opensOnText(PREMIUM.match.opensAt!)).toBe("10월 24일 열려요");
  });
});
