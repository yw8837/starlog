// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CardFan, fanIndexes } from "./CardFan";

// jsdom has no PointerEvent (pointerType) and no hit testing.
beforeAll(() => {
  if (!("PointerEvent" in window)) {
    class PointerEventPolyfill extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    Object.assign(window, { PointerEvent: PointerEventPolyfill });
  }
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, "elementFromPoint");
});

// Slots 4, 6, 7 and 12 of the 21-card fan: one behind, the picked one, its neighbour, one far away.
const [, , , , BEHIND, , SIXTH, SEVENTH, , , , , FAR] = fanIndexes(78, 21);
const fanButton = (deckIndex: number) => document.querySelector<HTMLElement>(`[data-fan-index="${deckIndex}"]`)!;

/** A finger tap that the page's hit test puts on `under`, while the browser aims its click at `clickOn`. */
function touchTap(under: number, clickOn: number) {
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => fanButton(under) });
  const fan = fanButton(under).parentElement!;
  fireEvent.pointerDown(fan, { pointerType: "touch", clientX: 85, clientY: 520 });
  fireEvent.pointerUp(fan, { pointerType: "touch", clientX: 85, clientY: 520 });
  fireEvent.click(fanButton(clickOn));
}

describe("CardFan on touch", () => {
  it("ignores the click Chrome retargets to a neighbour when the finger re-taps a picked card", () => {
    const onPick = vi.fn();
    render(<CardFan picked={[SIXTH!]} max={3} onPick={onPick} />);
    touchTap(SIXTH!, SEVENTH!);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("ignores the retargeted click of a quick second tap, even when the first tap's wait runs out in between", () => {
    vi.useFakeTimers();
    try {
      const onPick = vi.fn();
      const { rerender } = render(<CardFan picked={[]} max={3} onPick={onPick} />);
      touchTap(SIXTH!, SIXTH!);
      expect(onPick).toHaveBeenCalledWith(SIXTH);
      rerender(<CardFan picked={[SIXTH!]} max={3} onPick={onPick} />);

      // 480 ms later the finger taps the lifted card again; its click arrives after the first tap's 500 ms.
      vi.advanceTimersByTime(480);
      Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => fanButton(SIXTH!) });
      const fan = fanButton(SIXTH!).parentElement!;
      fireEvent.pointerDown(fan, { pointerType: "touch", clientX: 85, clientY: 520 });
      fireEvent.pointerUp(fan, { pointerType: "touch", clientX: 85, clientY: 520 });
      vi.advanceTimersByTime(30);
      fireEvent.click(fanButton(SEVENTH!));
      expect(onPick).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats a tap near the card just picked, while it still rises, as a re-tap on it; later or farther taps pick", () => {
    vi.useFakeTimers();
    try {
      const onPick = vi.fn();
      const { rerender } = render(<CardFan picked={[]} max={3} onPick={onPick} />);
      touchTap(SIXTH!, SIXTH!);
      rerender(<CardFan picked={[SIXTH!]} max={3} onPick={onPick} />);
      // The picked card's box while it rises (it moves up 30 px).
      fanButton(SIXTH!).getBoundingClientRect = () => ({ left: 69, right: 195, top: 454, bottom: 599, width: 126, height: 145, x: 69, y: 454, toJSON: () => ({}) });

      // 70 ms later the finger lands where the card was; the hit test already finds the card behind it.
      vi.advanceTimersByTime(70);
      Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => fanButton(BEHIND!) });
      const fan = fanButton(SIXTH!).parentElement!;
      fireEvent.pointerDown(fan, { pointerType: "touch", clientX: 85, clientY: 590 });
      fireEvent.pointerUp(fan, { pointerType: "touch", clientX: 85, clientY: 590 });
      expect(onPick).toHaveBeenCalledTimes(1);

      // A mouse double-click there does nothing either; a keyboard Enter (detail 0) still picks.
      vi.advanceTimersByTime(600);
      fireEvent.click(fanButton(SIXTH!), { detail: 1, clientX: 85, clientY: 590 });
      expect(onPick).toHaveBeenCalledTimes(1);

      // Once the card has risen, a tap far from it picks the card under the finger.
      vi.advanceTimersByTime(400);
      Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => fanButton(FAR!) });
      fireEvent.pointerDown(fan, { pointerType: "touch", clientX: 300, clientY: 640 });
      fireEvent.pointerUp(fan, { pointerType: "touch", clientX: 300, clientY: 640 });
      expect(onPick).toHaveBeenLastCalledWith(FAR);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not hold back a quick mouse pick of a card away from the one just picked, nor the keyboard", () => {
    const onPick = vi.fn();
    const { rerender } = render(<CardFan picked={[]} max={3} onPick={onPick} />);
    fireEvent.click(fanButton(SIXTH!), { detail: 1, clientX: 85, clientY: 560 });
    rerender(<CardFan picked={[SIXTH!]} max={3} onPick={onPick} />);
    fanButton(SIXTH!).getBoundingClientRect = () => ({ left: 69, right: 195, top: 454, bottom: 599, width: 126, height: 145, x: 69, y: 454, toJSON: () => ({}) });
    fireEvent.click(fanButton(FAR!), { detail: 1, clientX: 320, clientY: 640 });
    fireEvent.click(fanButton(BEHIND!), { detail: 0 });
    expect(onPick.mock.calls.map(([index]) => index)).toEqual([SIXTH, FAR, BEHIND]);
  });

  it("picks the card under the finger once, even with the click that follows", () => {
    const onPick = vi.fn();
    render(<CardFan picked={[]} max={3} onPick={onPick} />);
    touchTap(SEVENTH!, SEVENTH!);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(SEVENTH);
  });

  it("still picks with a mouse click and with the keyboard", () => {
    const onPick = vi.fn();
    render(<CardFan picked={[]} max={3} onPick={onPick} />);
    const card = fanButton(SEVENTH!);
    fireEvent.pointerDown(card, { pointerType: "mouse" });
    fireEvent.pointerUp(card, { pointerType: "mouse" });
    fireEvent.click(card);
    expect(onPick).toHaveBeenLastCalledWith(SEVENTH);
    fireEvent.click(screen.getByRole("button", { name: "카드 1" }));
    expect(onPick).toHaveBeenCalledTimes(2);
  });
});
