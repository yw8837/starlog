// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { HomeYearBanner, OpeningNotice } from "./HomeYearBanner";

const NOV = Date.parse("2026-11-10T12:00:00+09:00");
const LAST = Date.parse("2026-11-30T23:59:59+09:00");
const DEC = Date.parse("2026-12-01T00:00:00+09:00");

function stub(visible: boolean) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ products: [
    { id: "tarot-deep", open: visible, visible, opensAt: null },
    { id: "match", open: visible, visible, opensAt: null },
    { id: "newyear-2027", open: visible, visible, opensAt: null },
  ] })));
}

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
});

describe("the home's 2027 banner (sales 2026-11-10 item 5)", () => {
  it("leads to the 2027 신년운세 product at its price where it is on sale", async () => {
    vi.setSystemTime(NOV);
    stub(true);
    render(<HomeYearBanner />);
    const link = await screen.findByRole("link", { name: /2027 신년운세/ });
    expect(link.getAttribute("href")).toBe("/premium/newyear-2027");
    expect(link.textContent).toContain("14,900원");
    expect(link.textContent).not.toMatch(/지금만|마감|할인|첫 풀이/);
  });

  it("shows nothing where premium is off", async () => {
    vi.setSystemTime(NOV);
    stub(false);
    const { container } = render(<HomeYearBanner />);
    await act(async () => {});
    expect(container.innerHTML).toBe("");
  });
});

describe("the 오픈 기념 무료 notice, by the date", () => {
  for (const [label, at] of [["11월 10일", NOV], ["the last second, 11월 30일 23:59:59 KST", LAST]] as const) {
    it(`says it runs until 11월 30일 for a logged-in account on ${label}`, async () => {
      vi.setSystemTime(at);
      render(<OpeningNotice />);
      await act(async () => {});
      expect(screen.getByText("오픈 기념 타로 전체 풀이 무료는 11월 30일까지예요. 로그인하면 계정마다 한 번 받을 수 있어요.")).toBeTruthy();
    });
  }

  it("is gone from 12월 1일 00:00 KST, with no deploy", async () => {
    vi.setSystemTime(DEC);
    const { container } = render(<OpeningNotice />);
    await act(async () => {});
    expect(container.innerHTML).toBe("");
  });
});
