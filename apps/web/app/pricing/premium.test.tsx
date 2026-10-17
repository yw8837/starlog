// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import PricingPage from "./page";

const OCT = Date.parse("2026-10-20T12:00:00+09:00");
const NOV15 = Date.parse("2026-11-15T00:00:00+09:00");

function stub(visible: boolean | "fail") {
  const fetchMock = vi.fn(async (url: string) => {
    if (url !== "/api/premium/status") return new Response(null, { status: 404 });
    if (visible === "fail") throw new TypeError("offline");
    return Response.json({
      products: [
        { id: "tarot-deep", open: visible, visible, opensAt: null },
        { id: "match", open: visible, visible, opensAt: null },
        { id: "newyear-2027", open: false, visible, opensAt: NOV15 },
      ],
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const premium = () => document.querySelector("#premium") as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OCT);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
});

describe("/pricing's premium tier (plan-reconciled §4.2)", () => {
  for (const state of [false, "fail"] as const) {
    it(`keeps today's 준비 중인 풀이 while premium is ${state === false ? "off" : "unknown"}: no new button or link`, async () => {
      const fetchMock = stub(state);
      render(<PricingPage />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(within(premium()).getByRole("heading", { level: 2 }).textContent).toBe("준비 중인 풀이");
      expect(premium().querySelectorAll("h3")).toHaveLength(3);
      for (const heading of premium().querySelectorAll("h3")) expect(heading.textContent).toContain("준비 중");
      expect(premium().querySelector("a")).toBeNull();
      expect(document.querySelector('a[href^="/premium/"]')).toBeNull();
    });
  }

  it("where premium is visible: 깊게 보는 풀이 with each product's scope lines, state and product page", async () => {
    stub(true);
    const { container } = render(<PricingPage />);
    await waitFor(() => expect(within(premium()).getByRole("heading", { level: 2 }).textContent).toBe("깊게 보는 풀이"));
    const cards = [...premium().querySelectorAll("section")];
    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual([
      expect.stringContaining("켈틱 크로스 10장"),
      expect.stringContaining("프리미엄 궁합"),
      expect.stringContaining("2027 신년운세"),
    ]);
    expect(cards[0]!.textContent).toContain("7,900원");
    expect(cards[0]!.textContent).toContain("판매 중");
    expect(cards[0]!.textContent).toContain("이어서 물어보기 3번");
    expect(cards[2]!.textContent).toContain("14,900원");
    expect(cards[2]!.textContent).toContain("11월 15일 0시에 열려요");
    expect(within(premium()).getAllByRole("link", { name: /자세히 보기/ }).map((a) => a.getAttribute("href"))).toEqual(["/premium/deep-tarot", "/premium/match", "/premium/newyear-2027"]);
    expect(premium().textContent).not.toMatch(/베타|오픈 기념|가장 깊게|타로×사주/);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.queryByText("준비 중인 풀이")).toBeNull();
  });
});
