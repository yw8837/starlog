// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeckDraw } from "@/components/tarot/DeckDraw";
import { FLOW_KEY } from "@/lib/flowState";
import { DrawStage } from "./DrawStage";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

/** 이어 읽기 on the draw (spec 2026-11-26 beyond trend §3): /now's card face up first, the other two picked. */

const KEEP = { cardId: "major-17-star", orientation: "reversed" } as const;
const MONEY_FLOW = { who: "me", topicId: "money", when: "week", conditions: {}, note: "", keep: KEEP };
const DEALT = {
  cards: [
    { position: "지금의 나", ...KEEP },
    { position: "필요한 것", cardId: "major-09-hermit", orientation: "upright" },
    { position: "이 시기의 흐름", cardId: "major-19-sun", orientation: "upright" },
  ],
  drawToken: "signed.draw.token",
};

const tableCards = () => screen.getAllByRole("button", { name: /^카드 \d+$/ });
const status = () => screen.getByRole("status").textContent;

beforeEach(() => {
  const seeds = ["seed-first", "seed-second", "seed-third"];
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => seeds.shift() as ReturnType<Crypto["randomUUID"]>);
  sessionStorage.setItem(FLOW_KEY, JSON.stringify(MONEY_FLOW));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  router.push.mockReset();
  router.replace.mockReset();
  sessionStorage.clear();
});

describe("the draw with a kept card", () => {
  it("lays the kept card face up first, asks for two from the other 77, and sends them with keep", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(DEALT), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DrawStage instant />);
    // Face up before anything is picked; the table holds every card but it.
    expect(screen.getByRole("img", { name: "지금의 나 · 별 · 역방향" })).toBeTruthy();
    expect(tableCards()).toHaveLength(77);
    expect(screen.getByRole("group", { name: "카드 77장 중 2장 고르기" })).toBeTruthy();
    expect(status()).toBe("마음이 가는 카드를 2장 골라 주세요");

    const chosen = [5, 76].map((i) => tableCards()[i]!);
    const picks = chosen.map((b) => Number(b.dataset.card));
    expect(picks.every((index) => index >= 0 && index < 77)).toBe(true);
    for (const card of chosen) fireEvent.click(card);
    expect(status()).toBe("모두 골랐어요");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "결과 보기" }));
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ templateId: "self-flow", picks, keep: KEEP });
    expect(await screen.findByRole("img", { name: "필요한 것 · 은둔자 · 정방향" })).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem(FLOW_KEY)!).draw).toEqual({ templateId: "self-flow", ...DEALT });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/tarot/result?instant=1"));
  });

  it("never keeps a card on a spread that is not a standard three (켈틱 크로스 10장)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ cards: [], drawToken: "t" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DeckDraw instant templateId="deep-tarot" heading="질문" step={{ label: "카드 뽑기", backHref: "/" }} onDealt={() => {}} onRevealed={() => {}} keep={KEEP} />);
    expect(tableCards()).toHaveLength(78);
    expect(screen.queryByRole("img", { name: /별 · 역방향/ })).toBeNull();
    for (let i = 0; i < 10; i++) fireEvent.click(tableCards()[0]!);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "결과 보기" }));
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("keep");
  });
});
