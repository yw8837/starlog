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
        // The privacy revisions of 2026-10-28, 2026-10-30 and 2026-10-31 (lib/legal.ts PRIVACY_REVISION_DATE, GA_REVISION_DATE,
        // SYNC_REVISION_DATE) have their own notices; the premium clauses have none left.
        const revisions = ["개정 예정 · 2026년 10월 28일부터 시행", "개정 예정 · 2026년 10월 30일부터 시행", "개정 예정 · 2026년 10월 31일부터 시행"];
        expect(revisions.reduce((text, notice) => text.replace(notice, ""), container.textContent ?? "")).not.toMatch(
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

/**
 * Owner 2026-10-23: the AI notice stays in the terms only, and results are always shareable (오픈 기념 무료 too, kept in the
 * account while logged in). The terms change from 2026-10-31 00:00 KST (SYNC_REVISION_DATE, 7 days' notice): before it the
 * old text stays with the four changes as 개정 예정 on top; from it the new text is in the body and 시행일 is 2026-10-31.
 */
describe("the terms' revision of 2026-10-31 00:00 KST (AI notice, sharing of 오픈 기념 무료 readings)", () => {
  const T_BEFORE = Date.parse("2026-10-30T23:59:00+09:00");
  const T_AT = Date.parse("2026-10-31T00:00:00+09:00");
  const T_UPCOMING = "개정 예정 · 2026년 10월 31일부터 시행";
  const OLD_AI = "이 약관과 서비스 화면으로 생성형 인공지능을 쓴다는 사실을 미리 알리고, 풀이 화면마다 AI가 만든 풀이라는 사실을 표시합니다.";
  const NEW_AI = "이 약관과 서비스 화면(풀이 과정 안내 등)으로 생성형 인공지능을 쓴다는 사실을 미리 알립니다.";
  const OLD_DEF = "이때는 이어서 물어보기와 결과 공유를 제공하지 않습니다.";
  const NEW_DEF = "이때는 이어서 물어보기를 제공하지 않습니다.";
  const OLD_FREE = "오픈 기념 무료로 연 타로 전체 풀이는 그 기기에서 보고 보관하는 데에만 쓸 수 있으며, 이어서 물어보기와 결과 공유는 제공하지 않습니다.";
  const NEW_FREE =
    "오픈 기념 무료로 연 타로 전체 풀이에는 이어서 물어보기를 제공하지 않습니다. 결과 공유는 다른 풀이와 같이 할 수 있고, 로그인한 상태로 연 풀이는 계정에도 보관됩니다.";
  const OLD_PAID = "제4조에서 정한 대로 이어서 물어보기와 결과 공유를 제공하지 않습니다.";
  const NEW_PAID = "제4조에서 정한 대로 이어서 물어보기를 제공하지 않습니다.";

  it("before 10/31 00:00: the old sentences and 시행일 2026-10-20, the four changes as 개정 예정 in a notice box on top", () => {
    vi.setSystemTime(T_BEFORE);
    const { container } = render(<TermsPage />);
    const text = container.textContent ?? "";
    for (const old of [OLD_AI, OLD_DEF, OLD_FREE, OLD_PAID]) expect(text, old).toContain(old);
    for (const fresh of [NEW_AI, NEW_FREE]) expect(text.split(fresh), fresh).toHaveLength(2); // only in the notice
    expect(text).toContain("이 약관은 2026년 10월 20일부터 시행합니다.");
    const note = screen.getByText(T_UPCOMING).closest("div")!;
    expect(note.querySelectorAll("li")).toHaveLength(4);
    expect(note.textContent).toContain(NEW_AI);
    expect(note.textContent).toContain("제2조 5호: 오픈 기념 무료로 연 타로 전체 풀이에는 이어서 물어보기만 제공하지 않습니다(결과 공유는 할 수 있습니다).");
    expect(note.textContent).toContain(`제7조 5호: 오픈 기념 무료로 연 풀이에는 ${NEW_PAID}`);
    expect(note.textContent).toContain(NEW_FREE);
    expect(note.textContent).toContain("오픈 기념 무료는 위 기간이 지나면 자동으로 끝납니다.");
    expect(container.querySelector("#ai")?.textContent).not.toContain(NEW_AI);
    expect(container.querySelector("#service")?.textContent).not.toContain(NEW_FREE);
    // the refund policy is not touched by it
    cleanup();
    const refund = render(<RefundPage />).container.textContent ?? "";
    expect(refund).toContain("2026년 10월 20일");
    expect(refund).not.toContain("2026년 10월 31일부터 시행");
  });

  it("from 10/31 00:00: the new sentences in the body, 시행일 2026-10-31, no 개정 예정 box for the terms, the old sentences gone", () => {
    for (const at of [T_AT, T_AT + 3 * 24 * 3_600_000]) {
      vi.setSystemTime(at);
      const { container } = render(<TermsPage />);
      const text = container.textContent ?? "";
      expect(screen.queryByText(T_UPCOMING)).toBeNull();
      expect(container.querySelector("#ai")?.textContent).toContain(NEW_AI);
      expect(container.querySelector("#definitions")?.textContent).toContain(NEW_DEF);
      expect(container.querySelector("#service")?.textContent).toContain(NEW_FREE);
      expect(container.querySelector("#service")?.textContent).toContain("오픈 기념 무료는 위 기간이 지나면 자동으로 끝납니다.");
      expect(container.querySelector("#paid")?.textContent).toContain(NEW_PAID);
      for (const old of [OLD_AI, OLD_DEF, OLD_FREE, OLD_PAID]) expect(text, old).not.toContain(old);
      expect(text).toContain("이 약관은 2026년 10월 31일부터 시행합니다.");
      expect(screen.getByRole("link", { name: "풀이 과정 안내" }).getAttribute("href")).toBe("/how");
      cleanup();
    }
  });
});
