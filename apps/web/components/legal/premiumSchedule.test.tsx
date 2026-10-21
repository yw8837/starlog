// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import RefundPage from "@/app/refund/page";
import TermsPage from "@/app/terms/page";
import { MATCH_AI_ITEMS } from "@/components/legal/PremiumLegal";
import { PREMIUM_CHANGE_NOTICE_UNTIL, PREMIUM_LEGAL_EFFECTIVE_DATE } from "@/lib/legal";
import { productById, sellable } from "@/lib/pay/catalog";
import { premiumOpen } from "@/lib/premium/flags";
import { PREMIUM, PREMIUM_IDS } from "@/lib/premium/products";

/**
 * Owner 2026-10-20: "전부 오픈해, 2027 신년운세도 바로 되게". 켈틱 크로스 10장, 프리미엄 궁합 and 2027 신년운세 are on sale
 * now, with no opening date (2027 신년운세 still closes at 2027-12-01 00:00 KST), and the premium clauses are in the text
 * from 2026-10-20 00:00 KST, 시행일 2026-10-20. The mechanism stays as it was (owner 2026-10-17): before that moment a
 * policy keeps its old text and 시행일 under a notice with the clauses as 개정 예정; from it, the code puts them in the text.
 */

const BEFORE = Date.parse("2026-10-19T23:59:00+09:00");
const AT = Date.parse("2026-10-20T00:00:00+09:00");
const NOW = Date.parse("2026-10-20T15:00:00+09:00");
const PAGES = [TermsPage, PrivacyPage, RefundPage];
const NOTICE = "2026년 10월 20일부터 바뀌는 내용";
const UPCOMING = "개정 예정 · 2026년 10월 20일부터 시행";
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

describe("everything open now, the premium clauses in force from 2026-10-20 00:00 KST (owner 2026-10-20)", () => {
  it("dates no product's opening (2027 신년운세 still closes at 2027-12-01 00:00 KST) and puts the clauses in force on 2026-10-20", () => {
    for (const id of PREMIUM_IDS) expect(PREMIUM[id].opensAt, id).toBeUndefined();
    expect(PREMIUM["newyear-2027"].closesAt).toBe(Date.parse("2027-12-01T00:00:00+09:00"));
    expect(Date.parse(`${PREMIUM_LEGAL_EFFECTIVE_DATE}T00:00:00+09:00`)).toBe(AT);
  });

  it("before 10/20 00:00 (the mechanism as it was): the old text and 시행일 2026-10-15, a notice on top, the clauses as 개정 예정", () => {
    vi.setSystemTime(BEFORE);
    for (const Page of PAGES) {
      const { container } = render(<Page />);
      expect(screen.getByRole("heading", { name: NOTICE })).toBeTruthy();
      expect(within(screen.getByRole("group", { name: UPCOMING })).getAllByText(/프리미엄 풀이/).length).toBeGreaterThan(0);
      expect(container.textContent).toContain("2026년 10월 15일");
      cleanup();
    }
    const { container } = render(<PrivacyPage />);
    expect(container.textContent?.split(MATCH_ROW)).toHaveLength(2);
    expect(within(screen.getByRole("group", { name: UPCOMING })).getByText(new RegExp(MATCH_ROW))).toBeTruthy();
  });

  it("from 10/20 00:00 (now): the clauses in the text, 시행일 2026-10-20, no notice and no 개정 예정", () => {
    for (const at of [AT, NOW]) {
      vi.setSystemTime(at);
      for (const Page of PAGES) {
        const { container } = render(<Page />);
        expect(screen.queryByRole("heading", { name: NOTICE })).toBeNull();
        expect(screen.queryByRole("group", { name: UPCOMING })).toBeNull();
        expect(container.textContent).toMatch(/프리미엄 풀이/);
        expect(container.textContent).toContain("2026년 10월 20일");
        // The privacy revisions of 2026-10-28 and 2026-10-30 (lib/legal.ts PRIVACY_REVISION_DATE, GA_REVISION_DATE) have their own
        // notices; the premium clauses have none left.
        expect(container.textContent?.replace("개정 예정 · 2026년 10월 28일부터 시행", "").replace("개정 예정 · 2026년 10월 30일부터 시행", "")).not.toMatch(
          /개정 예정|2026년 10월 24일|2026년 11월 15일/,
        );
        cleanup();
      }
      render(<TermsPage />);
      expect(screen.getByRole("region", { name: "제7조의3 (프리미엄 풀이)" })).toBeTruthy();
      cleanup();
      const { container } = render(<PrivacyPage />);
      expect(container.textContent).toContain(MATCH_ROW);
      cleanup();
    }
  });

  describe("the notice of what changed on 10/20, for 7 days (review 2026-10-20 A1: sales opened before a 7-day notice could run)", () => {
    const CHANGED = "2026년 10월 20일 바뀐 내용";
    const UNTIL = Date.parse("2026-10-27T00:00:00+09:00");
    const notice = () => screen.queryByRole("heading", { name: CHANGED })?.closest("aside") ?? null;

    it("is the first thing in each policy from 10/20 00:00 until 10/27 00:00 KST, in the first (server) render, and sums up the premium additions", () => {
      expect(PREMIUM_CHANGE_NOTICE_UNTIL).toBe("2026-10-27");
      for (const at of [AT, NOW, UNTIL - 1]) {
        vi.setSystemTime(at);
        for (const Page of PAGES) {
          const { container } = render(<Page />);
          const box = notice();
          expect(box, new Date(at).toISOString()).not.toBeNull();
          const text = box!.textContent ?? "";
          for (const id of PREMIUM_IDS) expect(text).toContain(PREMIUM[id].name);
          expect(text).toContain("이어서 물어보기 3번");
          expect(text).toContain("두 사람의 사주로만");
          expect(text).toContain(MATCH_AI_ITEMS);
          expect(text).not.toMatch(/개정 예정|베타|정확/);
          // on top: before the first section and before any other boxed note
          for (const later of container.querySelectorAll("article section, article > div")) {
            if (later.contains(box)) continue;
            expect(box!.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING, later.id || later.className).toBeTruthy();
          }
          cleanup();
        }
      }
    });

    it("is not there before 10/20 00:00 (the old notice is) nor from 10/27 00:00 KST", () => {
      for (const at of [BEFORE, AT - 1, UNTIL, UNTIL + 24 * 3_600_000]) {
        vi.setSystemTime(at);
        for (const Page of PAGES) {
          render(<Page />);
          expect(notice(), new Date(at).toISOString()).toBeNull();
          cleanup();
        }
      }
    });
  });

  it("sells all three now (STARLOG_PREMIUM on, payments open), 2027 신년운세 until 2027-11-30", () => {
    for (const id of PREMIUM_IDS) {
      expect(premiumOpen(id, false, NOW, on), id).toBe(true);
      expect(sellable(productById(id)!, NOW), id).toBe(true);
    }
    expect(sellable(productById("newyear-2027")!, Date.parse("2027-12-01T00:00:00+09:00") - 1)).toBe(true);
    expect(sellable(productById("newyear-2027")!, Date.parse("2027-12-01T00:00:00+09:00"))).toBe(false);
  });
});
