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

const [, , , , , , SIXTH, SEVENTH] = fanIndexes(78, 21);
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
