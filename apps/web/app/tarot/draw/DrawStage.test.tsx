// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLOW_KEY } from "@/lib/flowState";
import { DrawStage } from "./DrawStage";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

/** 나 · 재물운 · 이번 주: the self-flow spread (3 cards). */
const MONEY_FLOW = { who: "me", topicId: "money", when: "week", conditions: {}, note: "" };

/** What the server deals: never the cards the browser's fan happens to hold. */
const DEALT = {
  cards: [
    { position: "지금의 나", cardId: "major-09-hermit", orientation: "upright" },
    { position: "필요한 것", cardId: "major-17-star", orientation: "reversed" },
    { position: "이 시기의 흐름", cardId: "major-19-sun", orientation: "upright" },
  ],
  drawToken: "signed.draw.token",
};

const fanCards = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("data-fan-index"));
const pickedCards = () => fanCards().filter((b) => b.getAttribute("aria-pressed") === "true");
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const status = () => screen.getByRole("status").textContent;

beforeEach(() => {
  const seeds = ["seed-first", "seed-second", "seed-third"];
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => seeds.shift() as ReturnType<Crypto["randomUUID"]>);
  sessionStorage.setItem(FLOW_KEY, JSON.stringify(MONEY_FLOW));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  router.push.mockReset();
  router.replace.mockReset();
  sessionStorage.clear();
  window.matchMedia = undefined as unknown as typeof window.matchMedia;
});

describe("DrawStage deals through the server", () => {
  it("sends the picked fan positions and turns over the cards the server returned", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(DEALT), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DrawStage instant />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("이번 주, 나의 재물 흐름은 어떨까");
    for (const i of [2, 9, 15]) fireEvent.click(fanCards()[i]!);
    const picks = pickedCards().map((b) => Number(b.dataset.fanIndex));
    expect(status()).toBe("모두 골랐어요");

    await act(async () => {
      click("결과 보기");
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/tarot/draw");
    expect(JSON.parse(String(init.body))).toEqual({ templateId: "self-flow", picks });
    expect(await screen.findByRole("img", { name: "지금의 나 · 은둔자 · 정방향" })).toBeTruthy();
    expect(await screen.findByRole("img", { name: "필요한 것 · 별 · 역방향" })).toBeTruthy();
    // Kept with the signed token for the result screen; nothing in the URL.
    expect(JSON.parse(sessionStorage.getItem(FLOW_KEY)!).draw).toEqual({ templateId: "self-flow", ...DEALT });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/tarot/result?instant=1"));
  });

  it("keeps the picks and says what went wrong when the deal fails; 다시 시도 tries again", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify(DEALT), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DrawStage instant />);
    for (const i of [1, 2, 3]) fireEvent.click(fanCards()[i]!);
    await act(async () => {
      click("결과 보기");
    });
    expect(status()).toBe("연결이 잠시 끊겼어요. 다시 시도해 주세요.");
    expect(pickedCards()).toHaveLength(3);
    await act(async () => {
      click("다시 시도");
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/tarot/result?instant=1"));
  });

  it("sends a visit without a question back to the builder", () => {
    sessionStorage.clear();
    render(<DrawStage instant />);
    expect(router.replace).toHaveBeenCalledWith("/tarot/new");
    expect(screen.queryAllByRole("button").filter((b) => b.hasAttribute("data-fan-index"))).toHaveLength(0);
  });
});

describe("DrawStage 다시 섞기", () => {
  it("clears the picks and deals a new fan", () => {
    render(<DrawStage instant />);
    expect(fanCards()).toHaveLength(21);
    const first = fanCards()[0]!;
    fireEvent.click(first);
    expect(pickedCards()).toHaveLength(1);

    // 다시 섞기 comes after the fan in the tab order.
    const reshuffleButton = screen.getByRole("button", { name: "다시 섞기" });
    expect(fanCards().at(-1)!.compareDocumentPosition(reshuffleButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    click("다시 섞기");
    expect(pickedCards()).toHaveLength(0);
    expect(status()).toBe("카드를 다시 섞었어요. 3장 골라 주세요");
    // The fan is dealt afresh for the new deck.
    expect(first.isConnected).toBe(false);
    expect(fanCards()).toHaveLength(21);
  });

  it("announces every reshuffle, even with nothing picked", () => {
    render(<DrawStage instant />);
    const region = screen.getByRole("status");
    click("다시 섞기");
    const firstLine = region.firstElementChild!;
    expect(region.textContent).toBe("카드를 다시 섞었어요. 3장 골라 주세요");
    click("다시 섞기");
    // Same words, but a new node in the live region, so screen readers read it again.
    expect(region.textContent).toBe("카드를 다시 섞었어요. 3장 골라 주세요");
    expect(firstLine.isConnected).toBe(false);

    // Once a card is picked and taken back, the deck is no longer "just reshuffled".
    fireEvent.click(fanCards()[3]!);
    expect(region.textContent).toBe("마음이 가는 카드를 2장 더 골라 주세요");
    click("방금 고른 카드 빼기");
    expect(region.textContent).toBe("마음이 가는 카드를 3장 골라 주세요");
  });

  it("shuffles with cards only, then brings focus back to 다시 섞기 after a reshuffle", () => {
    render(<DrawStage instant={false} />);
    expect(screen.getByText("카드를 섞고 있어요")).toBeTruthy();
    // No character on the draw screen, only the deck.
    expect(screen.queryByRole("img", { name: /고양이/ })).toBeNull();
    click("바로 펼치기");

    fireEvent.click(fanCards()[4]!);
    expect(pickedCards()).toHaveLength(1);
    expect(screen.queryByRole("img", { name: /고양이/ })).toBeNull();

    click("다시 섞기");
    expect(screen.getByText("카드를 섞고 있어요")).toBeTruthy();
    expect(fanCards()).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "바로 펼치기" }));

    click("바로 펼치기");
    expect(pickedCards()).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "다시 섞기" }));
  });

  it("riffles for about 2.4s before the fan opens", () => {
    vi.useFakeTimers();
    render(<DrawStage instant={false} />);
    act(() => vi.advanceTimersByTime(2200));
    expect(screen.getByText("카드를 섞고 있어요")).toBeTruthy();
    expect(fanCards()).toHaveLength(0);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByText("카드를 섞고 있어요")).toBeNull();
    expect(fanCards()).toHaveLength(21);
  });

  it("still shows a short, gentle shuffle under reduced motion, first and on 다시 섞기", () => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<DrawStage instant={false} />);
    // Not skipped: the stacked deck is there for a moment, then the fan.
    expect(screen.getByText("카드를 섞고 있어요")).toBeTruthy();
    act(() => vi.advanceTimersByTime(600));
    expect(fanCards()).toHaveLength(0);
    act(() => vi.advanceTimersByTime(300));
    expect(fanCards()).toHaveLength(21);

    const first = fanCards()[2]!;
    fireEvent.click(first);
    click("다시 섞기");
    expect(screen.getByText("카드를 섞고 있어요")).toBeTruthy();
    act(() => vi.advanceTimersByTime(900));
    expect(pickedCards()).toHaveLength(0);
    expect(fanCards()).toHaveLength(21);
    expect(first.isConnected).toBe(false);
  });
});
