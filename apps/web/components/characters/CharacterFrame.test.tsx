// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CharacterFrame } from "./CharacterFrame";
import type { Expression } from "./types";

const LABEL = "별을 읽는 점성술사 고양이";
const LINE = "냥, 섞어볼까";

function renderFrame(reactOnTap: boolean, expression: Expression = "idle") {
  return render(
    <CharacterFrame size={160} reactOnTap={reactOnTap} label={LABEL} line={LINE} expression={expression}>
      {(shown) => <g data-testid="figure" data-expression={shown} />}
    </CharacterFrame>,
  );
}

const shownExpression = () => screen.getByTestId("figure").getAttribute("data-expression");

describe("CharacterFrame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("is a labelled button when it reacts to taps", () => {
    renderFrame(true);
    expect(screen.getByRole("button", { name: LABEL })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("is a labelled image, not a button, when it does not react to taps", () => {
    renderFrame(false);
    expect(screen.getByRole("img", { name: LABEL })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows its expression until tapped, then the happy face and the speech bubble for 1400ms", () => {
    renderFrame(true, "focus");
    expect(shownExpression()).toBe("focus");
    expect(screen.queryByText(LINE)).toBeNull();

    fireEvent.click(screen.getByRole("button"));
    expect(shownExpression()).toBe("happy");
    expect(screen.getByText(LINE)).toBeTruthy();

    act(() => vi.advanceTimersByTime(1400));
    expect(shownExpression()).toBe("focus");
    expect(screen.queryByText(LINE)).toBeNull();
  });

  it("starts a fresh bubble on a second tap within the window, so it stays up for the full reaction", () => {
    renderFrame(true);
    const button = screen.getByRole("button");

    fireEvent.click(button);
    const first = screen.getByText(LINE);

    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(button);
    const second = screen.getByText(LINE);
    // A new node restarts the bubble's pop-in and its delayed fade-out.
    expect(second).not.toBe(first);

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(LINE)).toBe(second);

    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByText(LINE)).toBeNull();
  });
});
