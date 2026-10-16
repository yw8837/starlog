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
      expect(screen.getByRole("link", { name: /타로 보기/ }).getAttribute("href")).toBe("/tarot/new?new=1");
    });
  }

  it("where premium is visible: 2027 신년운세, 프리미엄 궁합, 켈틱 크로스 10장 after the quick cards and before the guide, no 가장 깊게", async () => {
    stub(true);
    const { container } = render(<HomePage />);
    const section = await screen.findByRole("region", { name: "더 깊게 보기" });
    expect(within(section).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/premium/newyear-2027", "/premium/match", "/premium/deep-tarot"]);
    expect(section.textContent).toContain("11월 15일 열려요");
    expect(section.textContent).not.toContain("가장 깊게");
    const quick = screen.getByRole("link", { name: /오늘의 한 장/ });
    const guide = screen.getByRole("heading", { level: 2, name: "알아 두면 좋은 이야기" });
    expect(quick.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });
});
