// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import type { StarView } from "@/lib/bonds/service";
import { StarList } from "./StarList";

const STAR: StarView = { id: "star_1", slot: 0, nickname: "별님", message: null, cardId: "wands-01", orientation: "upright", score: 80, parts: [], createdAt: 0, line: "요즘 두 사람 사이" };

function stub(visible: boolean) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/premium/status" ? Response.json({ products: [
    { id: "tarot-deep", open: visible, visible, opensAt: null },
    { id: "match", open: visible, visible, opensAt: null },
    { id: "newyear-2027", open: visible, visible, opensAt: null },
  ] }) : new Response(null, { status: 404 }))));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
});

it("links each friend's star to the 프리미엄 궁합 product, once, at its normal price (sales 2026-11-10 item 3)", async () => {
  stub(true);
  render(<StarList sign="aries" stars={[STAR]} fresh={new Set()} complete={false} otherFilling={null} onChanged={() => {}} />);
  const link = await screen.findByRole("link", { name: /별님님과 자세한 궁합 보기/ });
  expect(link.getAttribute("href")).toBe("/premium/match");
  expect(link.textContent).toContain("7,900원");
  expect(within(screen.getByRole("list")).getAllByRole("link")).toHaveLength(1);
});

it("shows no 궁합 link where premium is not on sale", async () => {
  stub(false);
  render(<StarList sign="aries" stars={[STAR]} fresh={new Set()} complete={false} otherFilling={null} onChanged={() => {}} />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.queryByRole("link")).toBeNull();
});
