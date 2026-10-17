// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CARDS, TEMPLATES } from "@starlog/core";
import { MATCH_FLOW_KEY } from "@/lib/premium/matchFlow";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { MatchDraw } from "./MatchDraw";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const FLOW = { me: DEFAULT_SAJU_FORM, partner: { ...DEFAULT_SAJU_FORM, year: 1992 }, relation: "friend", ack: true };
const DEALT = { cards: TEMPLATES.match.positions.map((position, i) => ({ position, cardId: CARDS[i]!.id, orientation: "upright" })), drawToken: "signed.match.draw" };
const fanCards = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("data-fan-index"));
const stored = () => JSON.parse(sessionStorage.getItem(MATCH_FLOW_KEY) ?? "{}");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  router.push.mockReset();
  router.replace.mockReset();
});

describe("우리 사이 궁합's five cards (Task 20)", () => {
  it("deals the five-card spread under 프리미엄 궁합 · <relation>, keeps it in the tab and opens the preview", async () => {
    sessionStorage.setItem(MATCH_FLOW_KEY, JSON.stringify(FLOW));
    const fetchMock = vi.fn(async () => Response.json(DEALT));
    vi.stubGlobal("fetch", fetchMock);
    render(<MatchDraw instant />);
    expect(await screen.findByRole("heading", { level: 1, name: "프리미엄 궁합 · 친구" })).toBeTruthy();
    expect(screen.getByText("마음이 가는 카드를 5장 골라 주세요")).toBeTruthy();
    for (let i = 0; i < 5; i++) fireEvent.click(fanCards()[i]!);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "결과 보기" }));
    });
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).templateId).toBe("match");
    expect(stored().draw).toEqual({ drawToken: DEALT.drawToken, cards: DEALT.cards });
    // The reading quotes the deck the user sees (owner 2026-10-17): with nothing chosen, the Starlog deck.
    await waitFor(() => expect([...document.querySelectorAll("img")].some((el) => el.getAttribute("src")?.includes(DEALT.cards[0]!.cardId))).toBe(true));
    const faces = [...document.querySelectorAll("img")].map((el) => el.getAttribute("src") ?? "").filter((src) => DEALT.cards.some((c) => src.includes(c.cardId)));
    expect(faces.length).toBeGreaterThan(0);
    expect(faces.every((src) => src.startsWith("/cards/starlog/"))).toBe(true);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/premium/match/preview?instant=1"));
  });

  it("sends a flow without both births, the relation or the consent back to the form", async () => {
    sessionStorage.setItem(MATCH_FLOW_KEY, JSON.stringify({ ...FLOW, ack: undefined }));
    render(<MatchDraw instant />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/premium/match/new"));
  });
});
