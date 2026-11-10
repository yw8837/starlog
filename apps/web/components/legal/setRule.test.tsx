// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RefundPage from "@/app/refund/page";
import TermsPage from "@/app/terms/page";
import { SET_RULE_DATE, koreanDate, setRuleInForce, setRuleNoticeShown } from "@/lib/legal";

/**
 * The 2027 신년운세 + 프리미엄 궁합 set (owner 2026-11-10): on sale from 2026-12-01 00:00 KST; within 7 days refunded whole
 * while neither reading was opened, the unopened one's part once one was (4,000원 or 11,000원), nothing once both were.
 * The terms and the refund policy say so, dated, on top from the deploy until 30 days after 12/1 (바뀌는 내용 before it,
 * 바뀐 내용 from it), and from 12/1 in their text. It concerns the set only.
 */

const DEPLOY = Date.parse("2026-11-12T12:00:00+09:00");
const AT = Date.parse("2026-12-01T00:00:00+09:00");
const NOTICE_END = Date.parse("2026-12-31T00:00:00+09:00");
const RULE = /결제일로부터 7일 안에 두 풀이를 모두 열지 않았으면 18,900원 전액을, 하나만 열었으면 열지 않은 풀이 몫을 환불받을 수 있/;
const PAGES = [TermsPage, RefundPage];
const notice = () => [...document.querySelectorAll("aside")].find((aside) => aside.textContent?.includes("신년운세 + 궁합 세트")) ?? null;

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the set's refund rule in the policies", () => {
  it("dates it 2026-12-01 and shows its notice from now until 30 days after", () => {
    expect(SET_RULE_DATE).toBe("2026-12-01");
    expect(setRuleInForce(AT - 1)).toBe(false);
    expect(setRuleInForce(AT)).toBe(true);
    expect(setRuleNoticeShown(DEPLOY)).toBe(true);
    expect(setRuleNoticeShown(NOTICE_END - 1)).toBe(true);
    expect(setRuleNoticeShown(NOTICE_END)).toBe(false);
  });

  it("before 12/1: a dated 바뀌는 내용 on top of both policies, saying it concerns the new set only; nothing in the text yet", () => {
    vi.setSystemTime(DEPLOY);
    for (const Page of PAGES) {
      const { container } = render(<Page />);
      const box = notice();
      expect(box).not.toBeNull();
      expect(box!.querySelector("h2")?.textContent).toBe(`${koreanDate(SET_RULE_DATE)}부터 바뀌는 내용 · 신년운세 + 궁합 세트`);
      expect(box!.textContent).toMatch(RULE);
      expect(box!.textContent).toMatch(/2027 신년운세를 열었으면 4,000원, 프리미엄 궁합을 열었으면 11,000원/);
      expect(box!.textContent).toMatch(/두 풀이를 모두 열면 환불되지 않/);
      expect(box!.textContent).not.toMatch(/하나라도 열면 환불되지 않/);
      expect(box!.textContent).toMatch(/새로 판매하는 세트에만 적용/);
      expect(box!.textContent).toContain("18,900원");
      expect(box!.textContent).not.toMatch(/지금만|마감|할인|베타|정확/);
      const body = [...container.querySelectorAll("section")].map((section) => section.textContent).join(" ");
      expect(body).not.toMatch(RULE);
      cleanup();
    }
  });

  it("from 12/1: 바뀐 내용 on top for 30 days, and the rule in the premium part of both policies", () => {
    for (const at of [AT, NOTICE_END - 1]) {
      vi.setSystemTime(at);
      for (const Page of PAGES) {
        const { container } = render(<Page />);
        expect(notice()?.querySelector("h2")?.textContent).toBe(`${koreanDate(SET_RULE_DATE)} 바뀐 내용 · 신년운세 + 궁합 세트`);
        expect(container.querySelector("#premium")?.textContent).toMatch(RULE);
        expect(container.querySelector("#premium")?.textContent).toMatch(/세트 가격에서 연 풀이를 따로 살 때의 가격을 뺀 금액/);
        cleanup();
      }
    }
    vi.setSystemTime(NOTICE_END);
    for (const Page of PAGES) {
      const { container } = render(<Page />);
      expect(notice()).toBeNull();
      expect(container.querySelector("#premium")?.textContent).toMatch(RULE);
      expect(screen.getAllByText(RULE).length).toBeGreaterThan(0);
      cleanup();
    }
  });
});
