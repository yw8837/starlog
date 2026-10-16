// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { Footer } from "./Footer";

function stub(visible: boolean | "fail") {
  const fetchMock = vi.fn(async () => {
    if (visible === "fail") throw new TypeError("offline");
    return Response.json({ products: [{ id: "tarot-deep", open: visible, visible, opensAt: null }, { id: "match", open: visible, visible, opensAt: null }] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const labels = () => screen.getAllByRole("link").map((link) => link.textContent);

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", ""));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetPremiumStatusForTests();
});

describe("the footer's 프리미엄 풀이 link (plan-reconciled §4.5)", () => {
  for (const state of [false, "fail"] as const) {
    it(`is absent while premium is ${state === false ? "off" : "unknown"}: today's ten links`, async () => {
      const fetchMock = stub(state);
      render(<Footer />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(labels()).toHaveLength(10);
      expect(labels()).not.toContain("프리미엄 풀이");
    });
  }

  it("follows 가격 안내 where premium is visible, to the pricing page's premium tier", async () => {
    stub(true);
    render(<Footer />);
    const link = await screen.findByRole("link", { name: "프리미엄 풀이" });
    expect(link.getAttribute("href")).toBe("/pricing#premium");
    expect(labels().indexOf("프리미엄 풀이")).toBe(labels().indexOf("가격 안내") + 1);
    expect(labels()).toHaveLength(11);
  });

  it("names the app host from a guide page when the hosts are split", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "1");
    stub(true);
    render(<Footer host="guide" />);
    expect((await screen.findByRole("link", { name: "프리미엄 풀이" })).getAttribute("href")).toBe(`${SITE.url}/pricing#premium`);
  });
});
