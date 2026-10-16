// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { FLOW_KEY } from "@/lib/flowState";
import { forgetRoutes } from "@/lib/lastRoute";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { QuestionBuilder } from "./QuestionBuilder";
import { SituationPicker } from "./situation/SituationPicker";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const stored = () => JSON.parse(sessionStorage.getItem(FLOW_KEY) ?? "{}");
const status = (visible: boolean) => Response.json({ products: [{ id: "tarot-deep", open: visible, visible, opensAt: null }] });
const me = (unused: Array<{ orderId: string; productId: string }> = []) =>
  Response.json({ payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused, opening: [] } });

let fetchMock: ReturnType<typeof vi.fn>;
function stub(visible: boolean, unused: Array<{ orderId: string; productId: string }> = []) {
  fetchMock = vi.fn(async (url: string) => (url === "/api/premium/status" ? status(visible) : url === "/api/me" ? me(unused) : Response.json({})));
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => forgetRoutes());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
  resetPremiumStatusForTests();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

const CHIP = "켈틱 크로스 10장";

describe("the question builder for 켈틱 크로스 10장 (the same builder, a chip above it)", () => {
  it("asks nothing new on the standard builder: no status or account call, no chip (STARLOG_PREMIUM off renders today's builder)", async () => {
    stub(false);
    window.history.replaceState(null, "", "/tarot/new?new=1");
    render(<QuestionBuilder />);
    expect(screen.getByRole("heading", { level: 1, name: "어떤 이야기를 타로로 볼까요?" })).toBeTruthy();
    expect(screen.queryByText(CHIP)).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stored().spread).toBeUndefined();
  });

  it("shows the chosen spread as a 13px chip (not a button) when premium is visible", async () => {
    stub(true);
    window.history.replaceState(null, "", "/tarot/new?new=1&spread=deep");
    render(<QuestionBuilder />);
    const chip = await screen.findByText(CHIP);
    expect(chip.closest("button, a")).toBeNull();
    expect(stored().spread).toBe("deep");
  });

  it("drops a deep spread while premium is off (a leftover or typed address): no chip, the 3-card flow", async () => {
    stub(false);
    window.history.replaceState(null, "", "/tarot/new?new=1&spread=deep");
    render(<QuestionBuilder />);
    await waitFor(() => expect(stored().spread).toBeUndefined());
    expect(screen.queryByText(CHIP)).toBeNull();
  });

  it("keeps it while premium is off for a buyer opening a paid 켈틱 크로스 10장 from 내 정보", async () => {
    stub(false, [{ orderId: "o1", productId: "tarot-deep" }]);
    window.history.replaceState(null, "", "/tarot/new?new=1&spread=deep");
    render(<QuestionBuilder />);
    expect(await screen.findByText(CHIP)).toBeTruthy();
    expect(stored().spread).toBe("deep");
  });

  it("shows the same chip on the situation step, whose way back keeps the ten-card builder", async () => {
    stub(true);
    sessionStorage.setItem(FLOW_KEY, JSON.stringify({ who: "me", topicId: "money", when: "week", conditions: {}, note: "", spread: "deep", savedAt: Date.now() }));
    window.history.replaceState(null, "", "/tarot/new/situation?keep=1");
    render(<SituationPicker />);
    expect(await screen.findByText(CHIP)).toBeTruthy();
    expect(screen.getByRole("link", { name: /질문 만들기로/ }).getAttribute("href")).toBe("/tarot/new?spread=deep");
  });
});
