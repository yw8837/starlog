// @vitest-environment jsdom
import { DEFAULT_REVERSAL_RATE, createDeck, getCard } from "@starlog/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE, won } from "@/lib/config";
import { drawNow } from "@/lib/decision";
import { NowOracle } from "./NowOracle";

const fanCards = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("data-fan-index"));

/** Runs the pick → reveal → turn timers (each is scheduled by the effect the previous one triggers). */
function settle() {
  for (let i = 0; i < 3; i++) act(() => vi.runAllTimers());
}

/** Picks the fan card in `slot` and returns the draw the page should show for it. */
function pickSlot(slot: number, seed: string) {
  const card = fanCards()[slot]!;
  const deckIndex = Number(card.dataset.fanIndex);
  fireEvent.click(card);
  settle();
  return drawNow(createDeck(seed, DEFAULT_REVERSAL_RATE), deckIndex, 0.5);
}

beforeEach(() => {
  vi.useFakeTimers();
  const seeds = ["now-seed-first", "now-seed-second"];
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => seeds.shift() as ReturnType<Crypto["randomUUID"]>);
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("지금의 한 장", () => {
  it("shows the name, the three ritual steps, an optional question and a 21-card fan for one pick", () => {
    render(<NowOracle instant />);
    expect(screen.getByRole("heading", { level: 1, name: "지금의 한 장" })).toBeTruthy();
    expect(screen.getByText("타로가 건네는 한 문장")).toBeTruthy();
    const steps = within(screen.getByRole("list", { name: "뽑는 순서" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual(["고민을 떠올려요 (적어도 좋아요)", "눈을 감고 숨을 한 번 쉬어요", "마음이 가는 카드를 한 장 골라요"]);
    const input = screen.getByLabelText("고민 한 줄") as HTMLInputElement;
    expect(input.placeholder).toBe("예: 오늘 먼저 연락해도 될까?");
    expect(input.maxLength).toBe(40);
    expect(fanCards()).toHaveLength(21);
    expect(screen.getByRole("group", { name: "카드 21장 중 1장 고르기" })).toBeTruthy();
    // Nothing is revealed before a card is picked.
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("turns the picked card over to its line, why and tip, with the upsell as the one primary", () => {
    render(<NowOracle instant />);
    fireEvent.change(screen.getByLabelText("고민 한 줄"), { target: { value: "오늘 먼저 연락해도 될까?" } });
    const expected = pickSlot(6, "now-seed-first");

    const answer = screen.getByRole("heading", { level: 2 });
    expect(answer.textContent).toBe(expected.answer);
    expect(document.activeElement).toBe(answer);

    const card = getCard(expected.cardId);
    const reversed = expected.orientation === "reversed";
    expect(screen.getByRole("img", { name: `${card.names.ko}${reversed ? " 역방향" : ""}` })).toBeTruthy();
    expect(screen.getByText(expected.why)).toBeTruthy();
    expect(screen.getByText(expected.tip)).toBeTruthy();
    expect(screen.getByText("오늘 먼저 연락해도 될까?")).toBeTruthy();
    expect(screen.getByRole("region", { name: "지금의 한 장 결과" }).dataset.lean).toBe(expected.lean);

    const upsell = screen.getByRole("link", { name: /기본 타로 3장으로 자세히 보기/ });
    expect(upsell.getAttribute("href")).toBe("/tarot/new");
    expect(screen.getByText(new RegExp(`기본 타로 3장 \\(${won(SITE.price.tarotStandardKrw)}\\)`))).toBeTruthy();
    expect(screen.getByRole("button", { name: "한 번 더 뽑기" })).toBeTruthy();
    // The fan and the question field are gone while the answer is shown.
    expect(fanCards()).toHaveLength(0);
    expect(screen.queryByLabelText("고민 한 줄")).toBeNull();
  });

  it("names the unwritten worry when no question was typed", () => {
    render(<NowOracle instant />);
    pickSlot(0, "now-seed-first");
    expect(screen.getByText("마음속 고민에 건네는 한 문장")).toBeTruthy();
    expect(screen.queryByText("내 고민")).toBeNull();
  });

  it("draws again from a new deck, keeping the question and skipping the ritual", () => {
    render(<NowOracle instant />);
    fireEvent.change(screen.getByLabelText("고민 한 줄"), { target: { value: "이직 준비를 시작할까?" } });
    pickSlot(3, "now-seed-first");

    fireEvent.click(screen.getByRole("button", { name: "한 번 더 뽑기" }));
    expect(screen.queryByRole("list", { name: "뽑는 순서" })).toBeNull();
    expect((screen.getByLabelText("고민 한 줄") as HTMLInputElement).value).toBe("이직 준비를 시작할까?");
    expect(fanCards()).toHaveLength(21);
    expect(fanCards().every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);

    const second = pickSlot(3, "now-seed-second");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(second.answer);
  });
});
