// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CardTable, TABLE_MODE_KEY } from "./CardTable";

// jsdom has no PointerEvent (pointerType, clientX) and no hit testing.
beforeAll(() => {
  if (!("PointerEvent" in window)) {
    class PointerEventPolyfill extends MouseEvent {
      pointerType: string;
      pointerId: number;
      isPrimary: boolean;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "mouse";
        this.pointerId = init.pointerId ?? 1;
        this.isPrimary = init.isPrimary ?? true;
      }
    }
    Object.assign(window, { PointerEvent: PointerEventPolyfill });
  }
});

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.matchMedia = undefined as unknown as typeof window.matchMedia;
  Reflect.deleteProperty(document, "elementFromPoint");
});

/** The draw screens around the table: slots for the picks (or none, like 지금의 한 장) and the undo. */
function Harness({
  max = 3,
  slots = true,
  onReshuffled,
  onShufflingChange,
  onPick,
}: {
  max?: number;
  slots?: boolean;
  onReshuffled?: () => void;
  onShufflingChange?: (shuffling: boolean) => void;
  onPick?: (index: number) => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  return (
    <>
      <ol>
        {Array.from({ length: max }, (_, i) => (
          <li key={i} data-testid={`slot-${i}`}>
            <span data-testid={`slot-card-${i}`} />
          </li>
        ))}
      </ol>
      <CardTable
        picked={picked}
        max={max}
        onPick={(index) => {
          onPick?.(index);
          setPicked((prev) => (prev.includes(index) || prev.length >= max ? prev : [...prev, index]));
        }}
        slotFor={slots ? (order) => document.querySelector(`[data-testid="slot-card-${order}"]`) : undefined}
        onReshuffled={onReshuffled}
        onShufflingChange={onShufflingChange}
      />
      <button type="button" onClick={() => setPicked((prev) => prev.slice(0, -1))}>
        방금 고른 카드 빼기
      </button>
    </>
  );
}

const cards = () => screen.getAllByRole("button", { name: /^카드 \d+$/ });
const card = (index: number) => document.querySelector<HTMLButtonElement>(`[data-card="${index}"]`)!;
const stage = () => screen.getByRole("group", { name: /장 고르기$/ });
const modeButton = (name: "흩뿌리기" | "돌리기") => within(screen.getByRole("group", { name: "카드 펼치는 방식" })).getByRole("button", { name });
const reshuffleButton = () => screen.getByRole("button", { name: "다시 섞기" });
/** Every card's transform, by deck index (hidden cards included, as they were last laid out). */
const transforms = () => Array.from({ length: 78 }, (_, i) => card(i).style.transform);
const angle = (index: number) => Number(/rotate\((-?[\d.]+)deg\)/.exec(card(index).style.transform)?.[1]);

/** A finger (or mouse) press at one point (160, 120 unless given) whose hit test finds `under`, moved by `dx` before it lifts. */
function press(
  under: number,
  { dx = 0, pointerType = "touch", x = 160, y = 120, hold = 0 }: { dx?: number; pointerType?: string; x?: number; y?: number; hold?: number } = {},
) {
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => card(under) });
  const at = { clientX: x, clientY: y, pointerType, pointerId: 7, isPrimary: true };
  fireEvent.pointerDown(card(under), at);
  if (hold) act(() => vi.advanceTimersByTime(hold));
  if (dx) {
    for (let i = 1; i <= 6; i++) fireEvent.pointerMove(card(under), { ...at, clientX: at.clientX + (dx * i) / 6 });
  }
  fireEvent.pointerUp(card(under), { ...at, clientX: at.clientX + dx });
  // The click the browser sends after a tap.
  fireEvent.click(card(under), { detail: 1 });
}

/** On the ring, the tab stop is a card in view: within 20° of the top (the stage shows about ±37° of it, edge cards cut). */
const stopInView = () => Math.abs(angle(Number(cards().find((b) => b.tabIndex === 0)!.dataset.card))) < 20;

/** Every card left lies in the loose pile in the middle of the table (280px tall here). */
const inPile = () =>
  cards().every((b) => {
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(b.style.transform);
    return m !== null && Math.abs(Number(m[1])) <= 20 && Math.abs(Number(m[2]) - 140) <= 14;
  });

function reducedMotion() {
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query })) as unknown as typeof window.matchMedia;
}

describe("CardTable 흩뿌리기 (the default)", () => {
  it("lays all 78 cards face down on the table, each a named button, scattered at their own spots", () => {
    render(<Harness />);
    expect(cards()).toHaveLength(78);
    expect(stage().getAttribute("aria-label")).toBe("카드 78장 중 3장 고르기");
    expect(modeButton("흩뿌리기").getAttribute("aria-pressed")).toBe("true");
    expect(modeButton("돌리기").getAttribute("aria-pressed")).toBe("false");
    // Random spots and turns: hardly two cards lie the same way.
    expect(new Set(transforms()).size).toBeGreaterThan(70);
    // One tab stop for the whole table.
    expect(cards().filter((b) => b.tabIndex === 0)).toHaveLength(1);
  });

  it("a tap picks the card on top under the finger once; it flies to its slot and leaves the table", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    press(40);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(40);
    expect(cards()).toHaveLength(77);
    expect(screen.queryByRole("button", { name: "카드 41" })).toBeNull();

    // The slot's card waits while the flying card travels (850 ms), then shows.
    const slot = screen.getByTestId("slot-card-0");
    expect(slot.style.visibility).toBe("hidden");
    expect(document.body.querySelectorAll("[data-flying]")).toHaveLength(1);
    act(() => vi.advanceTimersByTime(950));
    expect(slot.style.visibility).toBe("");
    expect(document.body.querySelectorAll("[data-flying]")).toHaveLength(0);
  });

  it("a quick second tap on the same spot (a double tap) keeps one pick; a farther or later tap picks", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    // The first card's box around the finger (jsdom lays nothing out).
    card(40).getBoundingClientRect = () => ({ left: 130, right: 190, top: 70, bottom: 170, width: 60, height: 100, x: 130, y: 70, toJSON: () => ({}) });
    press(40);
    // 120 ms later the finger lands there again: the card below is on top now, but this is the same tap twice.
    act(() => vi.advanceTimersByTime(120));
    press(41);
    expect(onPick.mock.calls.map(([i]) => i)).toEqual([40]);
    // As soon, but elsewhere on the table: a second pick.
    press(42, { x: 300, y: 240 });
    expect(onPick.mock.calls.map(([i]) => i)).toEqual([40, 42]);
    // Later, on the first spot again: a pick.
    act(() => vi.advanceTimersByTime(400));
    press(41);
    expect(onPick.mock.calls.map(([i]) => i)).toEqual([40, 42, 41]);
  });

  it("a slow double tap (the second finger down within 300 ms, up later) still keeps one pick", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    card(40).getBoundingClientRect = () => ({ left: 130, right: 190, top: 70, bottom: 170, width: 60, height: 100, x: 130, y: 70, toJSON: () => ({}) });
    press(40);
    // Down again 180 ms after the first lift, up 150 ms later (330 ms after it).
    act(() => vi.advanceTimersByTime(180));
    press(41, { hold: 150 });
    expect(onPick.mock.calls.map(([i]) => i)).toEqual([40]);
  });

  it("a press that slides does not pick", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    press(12, { dx: 40 });
    expect(onPick).not.toHaveBeenCalled();
    expect(cards()).toHaveLength(78);
  });

  it("the undo puts the card back on the table", () => {
    render(<Harness />);
    press(5);
    expect(cards()).toHaveLength(77);
    fireEvent.click(screen.getByRole("button", { name: "방금 고른 카드 빼기" }));
    expect(cards()).toHaveLength(78);
    expect(screen.getByRole("button", { name: "카드 6" })).toBeTruthy();
  });

  it("once the spread is full, the cards and 다시 섞기 rest", () => {
    const onPick = vi.fn();
    render(<Harness max={2} onPick={onPick} />);
    press(1);
    press(2);
    expect(cards().every((b) => b.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(reshuffleButton().getAttribute("aria-disabled")).toBe("true");
    press(3);
    // Past the click that follows a pointer press (600 ms), so this keyboard pick meets the full-spread guard itself.
    act(() => vi.advanceTimersByTime(700));
    fireEvent.click(card(4), { detail: 0 });
    expect(onPick).toHaveBeenCalledTimes(2);
  });
});

describe("CardTable 돌리기", () => {
  it("lays the cards on a ring; dragging sideways turns it; a tap picks; the rest close the gap", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    fireEvent.click(modeButton("돌리기"));
    expect(modeButton("돌리기").getAttribute("aria-pressed")).toBe("true");
    // Every card sits on the ring: 78 cards, 360/78 degrees apart.
    const step = 360 / 78;
    const angles = Array.from({ length: 78 }, (_, i) => angle(i)).sort((a, b) => a - b);
    for (let k = 1; k < angles.length; k++) expect(angles[k]! - angles[k - 1]!).toBeCloseTo(step, 1);

    // A sideways drag turns the ring with the finger (and picks nothing).
    const before = angle(10);
    press(10, { dx: 60 });
    expect(onPick).not.toHaveBeenCalled();
    expect(angle(10)).not.toBeCloseTo(before, 1);

    // A tap picks; a moment later the 77 left close the gap.
    act(() => vi.advanceTimersByTime(3000));
    press(20);
    expect(onPick).toHaveBeenCalledWith(20);
    act(() => vi.advanceTimersByTime(300));
    const left = Array.from({ length: 78 }, (_, i) => i)
      .filter((i) => i !== 20)
      .map(angle)
      .sort((a, b) => a - b);
    for (let k = 1; k < left.length; k++) expect(left[k]! - left[k - 1]!).toBeCloseTo(360 / 77, 1);
  });

  it("shows how to turn it", () => {
    render(<Harness />);
    expect(screen.queryByText("← 끌어서 돌리기 →")).toBeNull();
    fireEvent.click(modeButton("돌리기"));
    expect(screen.getByText("← 끌어서 돌리기 →")).toBeTruthy();
  });
});

describe("CardTable toggle", () => {
  it("switches at any time, keeps the picks, and is remembered on this device", () => {
    const { unmount } = render(<Harness />);
    press(3);
    press(9);
    fireEvent.click(modeButton("돌리기"));
    expect(cards()).toHaveLength(76);
    expect(window.localStorage.getItem(TABLE_MODE_KEY)).toBe("ring");
    fireEvent.click(modeButton("흩뿌리기"));
    expect(cards()).toHaveLength(76);
    expect(window.localStorage.getItem(TABLE_MODE_KEY)).toBe("scatter");
    fireEvent.click(modeButton("돌리기"));
    unmount();

    render(<Harness />);
    expect(modeButton("돌리기").getAttribute("aria-pressed")).toBe("true");
  });

  it("still works when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Harness />);
    expect(modeButton("흩뿌리기").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(modeButton("돌리기"));
    expect(modeButton("돌리기").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("CardTable 다시 섞기", () => {
  it("keeps the picks and reshuffles only the cards left, with a visible shuffle that holds input until it is done", () => {
    const onPick = vi.fn();
    const onReshuffled = vi.fn();
    const onShufflingChange = vi.fn();
    render(<Harness onPick={onPick} onReshuffled={onReshuffled} onShufflingChange={onShufflingChange} />);
    press(30);
    press(31);
    act(() => vi.advanceTimersByTime(1000));
    const spotsBefore = transforms();

    fireEvent.click(reshuffleButton());
    // Shuffling: the button keeps focus but rests, the toggle and the cards take no input, and the page is told
    // (so its undo can rest too).
    expect(onShufflingChange.mock.calls).toEqual([[true]]);
    expect(reshuffleButton().getAttribute("aria-disabled")).toBe("true");
    expect((modeButton("돌리기") as HTMLButtonElement).disabled).toBe(true);
    // The cards left gather into one loose pile in the middle of the table first.
    act(() => vi.advanceTimersByTime(700));
    expect(inPile()).toBe(true);
    // Still shuffling, and long past the click that follows the last pointer press (600 ms): a keyboard pick, a tap
    // and 다시 섞기 again all meet the shuffle's own guard.
    fireEvent.click(card(51), { detail: 0 });
    press(50);
    fireEvent.click(reshuffleButton());
    expect(onPick).toHaveBeenCalledTimes(2);

    act(() => vi.advanceTimersByTime(8000));
    expect(onReshuffled).toHaveBeenCalledTimes(1);
    expect(onShufflingChange.mock.calls).toEqual([[true], [false]]);
    expect(reshuffleButton().getAttribute("aria-disabled")).toBe("false");
    // The two picks stay picked; every card left lies somewhere new.
    expect(cards()).toHaveLength(76);
    expect(screen.queryByRole("button", { name: "카드 31" })).toBeNull();
    expect(screen.queryByRole("button", { name: "카드 32" })).toBeNull();
    const after = transforms();
    const moved = cards().filter((b) => after[Number(b.dataset.card)] !== spotsBefore[Number(b.dataset.card)]);
    expect(moved.length).toBeGreaterThan(70);
    // Input is back.
    press(50);
    expect(onPick).toHaveBeenLastCalledWith(50);
  });

  it("on the ring, a flick still coasting stops when 다시 섞기 starts, so the cards gather into the pile", () => {
    render(<Harness />);
    fireEvent.click(modeButton("돌리기"));
    act(() => vi.advanceTimersByTime(3000));
    press(10, { dx: 120 });
    fireEvent.click(reshuffleButton());
    act(() => vi.advanceTimersByTime(700));
    expect(inPile()).toBe(true);
    act(() => vi.advanceTimersByTime(9000));
  });

  it("on the ring, the gap a pick leaves does not close over the pile when 다시 섞기 comes right after", () => {
    render(<Harness />);
    fireEvent.click(modeButton("돌리기"));
    act(() => vi.advanceTimersByTime(3000));
    press(20);
    fireEvent.click(reshuffleButton());
    act(() => vi.advanceTimersByTime(700));
    expect(inPile()).toBe(true);
    act(() => vi.advanceTimersByTime(9000));
    // Then the 77 left lie evenly on the ring again.
    const left = Array.from({ length: 78 }, (_, i) => i)
      .filter((i) => i !== 20)
      .map(angle)
      .sort((a, b) => a - b);
    for (let k = 1; k < left.length; k++) expect(left[k]! - left[k - 1]!).toBeCloseTo(360 / 77, 1);
  });

  it("gives the ring a new order", () => {
    render(<Harness />);
    fireEvent.click(modeButton("돌리기"));
    const before = Array.from({ length: 78 }, (_, i) => angle(i));
    fireEvent.click(reshuffleButton());
    act(() => vi.advanceTimersByTime(9000));
    const after = Array.from({ length: 78 }, (_, i) => angle(i));
    expect(after.filter((a, i) => Math.abs(a - before[i]!) > 0.5).length).toBeGreaterThan(70);
    // Still a ring.
    const sorted = [...after].sort((a, b) => a - b);
    for (let k = 1; k < sorted.length; k++) expect(sorted[k]! - sorted[k - 1]!).toBeCloseTo(360 / 78, 1);
  });
});

describe("CardTable keyboard", () => {
  it("on the ring, the arrows move focus and turn it; Enter picks and focus stays on the table", () => {
    render(<Harness />);
    fireEvent.click(modeButton("돌리기"));
    const first = cards().find((b) => b.tabIndex === 0)!;
    first.focus();
    const firstAngle = angle(Number(first.dataset.card));
    expect(Math.abs(firstAngle)).toBeLessThan(360 / 78);

    fireEvent.keyDown(first, { key: "ArrowRight" });
    const next = document.activeElement as HTMLButtonElement;
    expect(next).not.toBe(first);
    expect(next.dataset.card).toBeDefined();
    expect(next.tabIndex).toBe(0);
    // The ring turned so the focused card is at the top.
    expect(Math.abs(angle(Number(next.dataset.card)))).toBeLessThan(0.5);

    fireEvent.keyDown(next, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(first);

    // Enter or Space on a button is a click with no pointer (detail 0).
    fireEvent.click(first, { detail: 0 });
    expect(cards()).toHaveLength(77);
    expect((document.activeElement as HTMLElement).dataset.card).toBeDefined();
    expect(document.activeElement).not.toBe(first);
  });

  it("on the ring, Tab lands on a card in view: after a drag and a reshuffle, and after the card on top is picked", () => {
    // Three rounds (about 0.9 s each, hence the longer timeout): where a reshuffle puts any one card is random.
    for (let round = 0; round < 3; round++) {
      window.localStorage.setItem(TABLE_MODE_KEY, "ring");
      const { unmount } = render(<Harness />);
      act(() => vi.advanceTimersByTime(3000));
      press(0, { dx: 90 + round * 13 });
      act(() => vi.advanceTimersByTime(3000));
      expect(stopInView()).toBe(true);
      fireEvent.click(reshuffleButton());
      act(() => vi.advanceTimersByTime(9000));
      expect(stopInView()).toBe(true);
      // A touch pick of the card on top: the stop moves on to the card on top now.
      const top = cards().find((b) => b.tabIndex === 0)!;
      press(Number(top.dataset.card));
      act(() => vi.advanceTimersByTime(1000));
      expect(stopInView()).toBe(true);
      unmount();
    }
  }, 20_000);

  it("on the table, the arrows move focus among the cards left", () => {
    render(<Harness />);
    const first = cards().find((b) => b.tabIndex === 0)!;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    const second = document.activeElement as HTMLElement;
    expect(second.dataset.card).toBeDefined();
    expect(second).not.toBe(first);
    fireEvent.keyDown(second, { key: "Home" });
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect((document.activeElement as HTMLElement).dataset.card).toBeDefined();
  });
});

describe("CardTable without slots (지금의 한 장)", () => {
  it("keeps the picked card on the table, raised and named as picked", () => {
    render(<Harness max={1} slots={false} />);
    press(8);
    const picked = screen.getByRole("button", { name: "1번째로 고른 카드" });
    expect(picked.getAttribute("aria-pressed")).toBe("true");
    expect(picked.style.transform).toContain("scale(");
    expect(cards()).toHaveLength(77);
    expect(document.body.querySelectorAll("[data-flying]")).toHaveLength(0);
  });
});

describe("CardTable edges", () => {
  it("on the ring, Tab follows a card that comes back to the top after a reshuffle moved it away", () => {
    reducedMotion();
    window.localStorage.setItem(TABLE_MODE_KEY, "ring");
    render(<Harness />);
    // A drag comes to rest: the card on top (X) is the tab stop.
    press(0, { dx: 60 });
    expect(stopInView()).toBe(true);
    const x = Number(cards().find((b) => b.tabIndex === 0)!.dataset.card);
    // Reshuffle until X lies far from the top.
    for (let i = 0; i < 20 && Math.abs(angle(x)) < 60; i++) fireEvent.click(reshuffleButton());
    expect(Math.abs(angle(x))).toBeGreaterThanOrEqual(60);
    expect(stopInView()).toBe(true);
    // Drag X back to the top (0.16° per pixel): Tab lands in view, on X.
    press(1, { dx: -angle(x) / 0.16 });
    expect(stopInView()).toBe(true);
    expect(cards().find((b) => b.tabIndex === 0)!.dataset.card).toBe(String(x));
  });

  it("on the ring, a drag the browser cancels (a pinch) still leaves Tab on a card in view, transitions back on", () => {
    reducedMotion();
    window.localStorage.setItem(TABLE_MODE_KEY, "ring");
    render(<Harness />);
    expect(stopInView()).toBe(true);
    const at = { clientX: 160, clientY: 120, pointerType: "touch", pointerId: 7, isPrimary: true };
    fireEvent.pointerDown(card(5), at);
    for (let i = 1; i <= 6; i++) fireEvent.pointerMove(card(5), { ...at, clientX: 160 + i * 100 });
    fireEvent.pointerCancel(card(5), at);
    expect(stage().hasAttribute("data-drag")).toBe(false);
    expect(stopInView()).toBe(true);
  });

  it("다시 섞기 in the middle of a drag leaves no drag mode behind", () => {
    render(<Harness />);
    fireEvent.click(modeButton("돌리기"));
    act(() => vi.advanceTimersByTime(3000));
    const at = { clientX: 160, clientY: 120, pointerType: "touch", pointerId: 7, isPrimary: true };
    fireEvent.pointerDown(card(10), at);
    for (let i = 1; i <= 6; i++) fireEvent.pointerMove(card(10), { ...at, clientX: 160 + i * 10 });
    expect(stage().hasAttribute("data-drag")).toBe(true);
    fireEvent.click(reshuffleButton());
    expect(stage().hasAttribute("data-drag")).toBe(false);
    act(() => vi.advanceTimersByTime(9000));
  });

  it("a table that leaves while shuffling tells the page the shuffle is over", () => {
    const onShufflingChange = vi.fn();
    const { unmount } = render(<Harness onShufflingChange={onShufflingChange} />);
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(reshuffleButton());
    act(() => vi.advanceTimersByTime(500));
    unmount();
    expect(onShufflingChange.mock.calls).toEqual([[true], [false]]);
  });

  it("다시 섞기 while the table is still opening keeps its own moves (the opening's clean-up does not cut them)", () => {
    render(<Harness />);
    // 200 ms into the opening spread (about 1.5 s long).
    act(() => vi.advanceTimersByTime(200));
    fireEvent.click(reshuffleButton());
    // 1.4 s later the cards are mid-cut (from 0.95 s), and past the moment the opening would have cleaned up (1.55 s).
    act(() => vi.advanceTimersByTime(1400));
    expect(cards().every((b) => b.style.transition.includes("420ms"))).toBe(true);
    act(() => vi.advanceTimersByTime(9000));
  });
});

describe("CardTable under reduced motion", () => {
  it("reshuffles at once and picks without a flight", () => {
    reducedMotion();
    const onReshuffled = vi.fn();
    render(<Harness onReshuffled={onReshuffled} />);
    press(4);
    expect(document.body.querySelectorAll("[data-flying]")).toHaveLength(0);
    expect(screen.getByTestId("slot-card-0").style.visibility).toBe("");

    const before = transforms();
    fireEvent.click(reshuffleButton());
    expect(onReshuffled).toHaveBeenCalledTimes(1);
    expect(reshuffleButton().getAttribute("aria-disabled")).toBe("false");
    const after = transforms();
    expect(cards().filter((b) => after[Number(b.dataset.card)] !== before[Number(b.dataset.card)]).length).toBeGreaterThan(70);
    expect(cards()).toHaveLength(77);
  });
});
