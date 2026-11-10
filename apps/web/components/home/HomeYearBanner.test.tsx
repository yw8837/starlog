// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { assertVoice } from "@/lib/voice/banned";
import { HomeYearBanner, OpeningNotice } from "./HomeYearBanner";

const NOV = Date.parse("2026-11-10T12:00:00+09:00");
const LAST = Date.parse("2026-11-30T23:59:59+09:00");
const DEC = Date.parse("2026-12-01T00:00:00+09:00");

function stub(visible: boolean, open: boolean = visible, setOpen = false) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ products: [
    { id: "tarot-deep", open, visible, opensAt: null },
    { id: "match", open, visible, opensAt: null },
    { id: "newyear-2027", open, visible, opensAt: null },
  ], set: { open: setOpen, opensAt: DEC } })));
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
    // One line under the hook (spec 2026-11-11 3.1, Q3 default), 사주주's line (H6).
    expect(link.textContent).toContain("사주주가 2027년 한 해와 열두 달을 미리 봐 드려요");
    expect(link.className).toMatch(/compact/);
    assertVoice(link.textContent ?? "");
  });

  it("adds the 2027 신년운세 + 프리미엄 궁합 set where the server sells it (from 12월 1일), to its checkout, with the real saving only", async () => {
    vi.setSystemTime(DEC);
    stub(true, true, true);
    render(<HomeYearBanner />);
    const set = await screen.findByRole("link", { name: /2027 신년운세 \+ 프리미엄 궁합/ });
    expect(set.getAttribute("href")).toBe(`/pay/checkout?${new URLSearchParams({ product: "set-2027", returnTo: "/premium/newyear-2027/new" })}`);
    expect(set.textContent).toContain("18,900원");
    expect(set.textContent).toContain("따로 사면 22,800원, 3,900원 아껴요");
    expect(set.textContent).not.toMatch(/지금만|마감|할인|첫 풀이|남은/);
    // The plain 신년 row stays beside it.
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/premium/newyear-2027", set.getAttribute("href")]);
  });

  it("offers no set before the server sells it", async () => {
    vi.setSystemTime(NOV);
    stub(true, true, false);
    render(<HomeYearBanner />);
    await screen.findByRole("link", { name: /2027 신년운세/ });
    expect(screen.queryByRole("link", { name: /프리미엄 궁합/ })).toBeNull();
  });

  it("shows nothing where premium is off", async () => {
    vi.setSystemTime(NOV);
    stub(false);
    const { container } = render(<HomeYearBanner />);
    await act(async () => {});
    expect(container.innerHTML).toBe("");
  });

  // Review MED-3: visible but not on sale (sales mode off, or past closesAt 2027-12-01): the server's `open` is false.
  for (const [label, at] of [["sales mode off", NOV], ["after closesAt", Date.parse("2027-12-01T00:00:00+09:00")]] as const) {
    it(`shows nothing where the product is visible but not on sale (${label})`, async () => {
      vi.setSystemTime(at);
      stub(true, false);
      const { container } = render(<HomeYearBanner />);
      await act(async () => {});
      expect(container.innerHTML).toBe("");
    });
  }
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
