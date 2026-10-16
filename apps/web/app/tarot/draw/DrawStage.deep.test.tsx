// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARDS, TEMPLATES } from "@starlog/core";
import { resetAccountForTests } from "@/lib/account/client";
import { FLOW_KEY } from "@/lib/flowState";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { DrawStage } from "./DrawStage";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const DEEP_FLOW = { who: "me", topicId: "money", when: "week", conditions: {}, note: "", spread: "deep" };
const CARD_IDS = CARDS.slice(0, 10).map((card) => card.id);
const dealt = (templateId: "deep-tarot" | "self-flow") => ({
  cards: TEMPLATES[templateId].positions.map((position, i) => ({ position, cardId: CARD_IDS[i]!, orientation: "upright" })),
  drawToken: "signed.draw.token",
});

const fanCards = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("data-fan-index"));
const stored = () => JSON.parse(sessionStorage.getItem(FLOW_KEY) ?? "{}");

function stub(visible: boolean) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/premium/status") return Response.json({ products: [{ id: "tarot-deep", open: visible, visible, opensAt: null }] });
    if (url === "/api/me") return Response.json({ payments: true, login: true, owner: false, user: null });
    const { templateId } = JSON.parse(String(init?.body)) as { templateId: "deep-tarot" | "self-flow" };
    return Response.json(dealt(templateId));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => sessionStorage.setItem(FLOW_KEY, JSON.stringify(DEEP_FLOW)));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
  resetPremiumStatusForTests();
  router.push.mockReset();
  router.replace.mockReset();
  sessionStorage.clear();
});

async function pickAllAndReveal(n: number) {
  for (let i = 0; i < n; i++) fireEvent.click(fanCards()[i]!);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "결과 보기" }));
  });
}

describe("the draw for 켈틱 크로스 10장", () => {
  it("deals ten cards for the question and opens the ten-card result screen", async () => {
    const fetchMock = stub(true);
    render(<DrawStage instant />);
    expect(await screen.findByText("마음이 가는 카드를 10장 골라 주세요")).toBeTruthy();
    await pickAllAndReveal(10);
    const deal = fetchMock.mock.calls.find(([url]) => url === "/api/tarot/draw")!;
    expect(JSON.parse(String(deal[1]!.body)).templateId).toBe("deep-tarot");
    expect(stored().draw.templateId).toBe("deep-tarot");
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/premium/deep-tarot/result?instant=1"));
  });

  it("while premium is off, drops the leftover spread and deals the 3-card spread for the standard result", async () => {
    const fetchMock = stub(false);
    render(<DrawStage instant />);
    expect(await screen.findByText("마음이 가는 카드를 3장 골라 주세요")).toBeTruthy();
    expect(stored().spread).toBeUndefined();
    await pickAllAndReveal(3);
    const deal = fetchMock.mock.calls.find(([url]) => url === "/api/tarot/draw")!;
    expect(JSON.parse(String(deal[1]!.body)).templateId).toBe("self-flow");
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/tarot/result?instant=1"));
  });
});
