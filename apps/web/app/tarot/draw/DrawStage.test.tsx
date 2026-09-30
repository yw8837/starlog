// @vitest-environment jsdom
import { DEFAULT_REVERSAL_RATE, createDeck, getCard } from "@starlog/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowFallback } from "@/lib/flowState";
import { DrawStage } from "./DrawStage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const FALLBACK: FlowFallback = {
  question: "이번 달, 그 사람에게 먼저 연락해도 될까",
  template: "relationship-contact",
  input: { conditions: [], note: "" },
};

const fanCards = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("data-fan-index"));
const pickedCards = () => fanCards().filter((b) => b.getAttribute("aria-pressed") === "true");
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

/** The card a daily draw shows once turned over, from a deck made with `seed`. */
function dailyCardLabel(seed: string, deckIndex: number) {
  const deck = createDeck(seed, DEFAULT_REVERSAL_RATE);
  const name = getCard(deck.order[deckIndex]!).names.ko;
  return `오늘의 한 장 · ${name} · ${deck.orientations[deckIndex] === "reversed" ? "역방향" : "정방향"}`;
}

beforeEach(() => {
  const seeds = ["seed-first", "seed-second", "seed-third"];
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => seeds.shift() as ReturnType<Crypto["randomUUID"]>);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.matchMedia = undefined as unknown as typeof window.matchMedia;
});

describe("DrawStage 다시 섞기", () => {
  it("clears the picks and deals a new deck in a new order", async () => {
    render(<DrawStage instant daily fallback={FALLBACK} />);
    expect(fanCards()).toHaveLength(21);

    const first = fanCards()[0]!;
    fireEvent.click(first);
    expect(pickedCards()).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("모두 골랐어요");

    click("다시 섞기");
    expect(pickedCards()).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("마음이 가는 카드를 한 장 골라 주세요");
    // The fan is dealt afresh for the new deck.
    expect(first.isConnected).toBe(false);
    expect(fanCards()).toHaveLength(21);

    // The card at the same place in the fan now comes from the second deck.
    const deckIndex = Number(fanCards()[0]!.dataset.fanIndex);
    fireEvent.click(fanCards()[0]!);
    await act(async () => {
      click("카드 뒤집기");
    });
    expect(await screen.findByRole("img", { name: dailyCardLabel("seed-second", deckIndex) })).toBeTruthy();
    expect(createDeck("seed-second", DEFAULT_REVERSAL_RATE).order).not.toEqual(createDeck("seed-first", DEFAULT_REVERSAL_RATE).order);
  });

  it("replays the cat's shuffle, then brings focus back to 다시 섞기", () => {
    render(<DrawStage instant={false} daily fallback={FALLBACK} />);
    expect(screen.getByText("카드를 섞고 있어요")).toBeTruthy();
    click("바로 펼치기");

    fireEvent.click(fanCards()[4]!);
    expect(pickedCards()).toHaveLength(1);

    click("다시 섞기");
    expect(screen.getByText("카드를 섞고 있어요")).toBeTruthy();
    expect(fanCards()).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "바로 펼치기" }));

    click("바로 펼치기");
    expect(pickedCards()).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "다시 섞기" }));
  });

  it("reshuffles in place, without the shuffle scene, under reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<DrawStage instant={false} daily fallback={FALLBACK} />);
    // The first shuffle is skipped outright.
    expect(screen.queryByText("카드를 섞고 있어요")).toBeNull();
    const first = fanCards()[2]!;
    fireEvent.click(first);

    click("다시 섞기");
    expect(screen.queryByText("카드를 섞고 있어요")).toBeNull();
    expect(pickedCards()).toHaveLength(0);
    expect(first.isConnected).toBe(false);
  });
});
