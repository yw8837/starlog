// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import HomePage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

const OCT = Date.parse("2026-10-20T12:00:00+09:00");
function stub(visible: boolean | "fail") {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/premium/status") {
      if (visible === "fail") throw new TypeError("offline");
      return Response.json({
        products: [
          { id: "tarot-deep", open: visible, visible, opensAt: null },
          { id: "match", open: visible, visible, opensAt: null },
          { id: "newyear-2027", open: false, visible, opensAt: Date.parse("2026-11-15T00:00:00+09:00") },
        ],
      });
    }
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OCT);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
  resetAccountForTests();
  localStorage.clear();
});

describe("the home's 더 깊게 보기 (plan-reconciled §4.1)", () => {
  for (const state of [false, "fail"] as const) {
    it(`shows nothing new while premium is ${state === false ? "off" : "unknown (status failed)"}: today's home`, async () => {
      const fetchMock = stub(state);
      const { container } = render(<HomePage />);
      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/premium/status")).toBe(true));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.queryByText("더 깊게 보기")).toBeNull();
      expect(container.querySelector('a[href^="/premium/"]')).toBeNull();
      expect(screen.getByRole("link", { name: /타로 보기/ }).getAttribute("href")).toBe("/tarot/new");
    });
  }

  it("shows no premium row even where premium is visible (owner 2026-10-20: the home stays as it was; premium is entered from the tarot bridge and the saju list)", async () => {
    const fetchMock = stub(true);
    const { container } = render(<HomePage />);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/premium/status")).toBe(true));
    // The tarot entry goes on to the bridge once the status says premium is visible here.
    await waitFor(() => expect(screen.getByRole("link", { name: /타로 보기/ }).getAttribute("href")).toBe("/tarot/start"));
    const main = screen.getByRole("main");
    expect(screen.queryByText("더 깊게 보기")).toBeNull();
    expect(main.querySelector('a[href^="/premium/"]')).toBeNull();
    expect(within(main).queryByText(/켈틱 크로스 10장|프리미엄 궁합|2027 신년운세/)).toBeNull();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });
});
