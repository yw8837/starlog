// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { MeView } from "./MeView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function stub(visible: boolean | "fail") {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/premium/status") {
      if (visible === "fail") throw new TypeError("offline");
      return Response.json({ products: [{ id: "tarot-deep", open: visible, visible, opensAt: null }] });
    }
    return Response.json({ payments: true, login: true, owner: false, user: null });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
  resetPremiumStatusForTests();
  sessionStorage.clear();
});

describe("내 정보's 프리미엄 풀이 보기 row (plan-reconciled §4.4)", () => {
  for (const state of [false, "fail"] as const) {
    it(`is absent while premium is ${state === false ? "off" : "unknown"}: today's menu`, async () => {
      const fetchMock = stub(state);
      render(<MeView status={null} />);
      const menu = await screen.findByRole("navigation", { name: "계정 메뉴" });
      await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/premium/status")).toBe(true));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(menu.textContent).not.toContain("프리미엄");
      expect([...menu.querySelectorAll("li")].map((li) => li.textContent).slice(0, 3)).toEqual([expect.stringMatching(/^내 기록/), "초대코드로 참여", "이용약관"]);
    });
  }

  it("leads to the pricing page's premium tier where premium is visible, after 초대코드로 참여", async () => {
    stub(true);
    render(<MeView status={null} />);
    const menu = await screen.findByRole("navigation", { name: "계정 메뉴" });
    const row = await within(menu).findByRole("link", { name: "프리미엄 풀이 보기" });
    expect(row.getAttribute("href")).toBe("/pricing#premium");
    const rows = [...menu.querySelectorAll("li")].map((li) => li.textContent);
    expect(rows.indexOf("프리미엄 풀이 보기")).toBe(rows.indexOf("초대코드로 참여") + 1);
  });
});
