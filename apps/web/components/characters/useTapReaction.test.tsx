// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TAP_REACTION_MS, useTapReaction } from "./useTapReaction";

describe("useTapReaction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lasts 1400ms", () => {
    expect(TAP_REACTION_MS).toBe(1400);
  });

  it("starts inactive", () => {
    const { result } = renderHook(() => useTapReaction());
    expect(result.current.active).toBe(false);
  });

  it("turns active on trigger, then back off after 1400ms", () => {
    const { result } = renderHook(() => useTapReaction());

    act(() => result.current.trigger());
    expect(result.current.active).toBe(true);

    act(() => vi.advanceTimersByTime(1399));
    expect(result.current.active).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.active).toBe(false);
  });

  it("restarts the 1400ms window when tapped again while active", () => {
    const { result } = renderHook(() => useTapReaction());

    act(() => result.current.trigger());
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.trigger());

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.active).toBe(true);

    act(() => vi.advanceTimersByTime(400));
    expect(result.current.active).toBe(false);
  });

  it("marks the attached button while the reaction runs, so CSS can replay the motion", () => {
    const button = document.createElement("button");
    const { result } = renderHook(() => useTapReaction());
    result.current.ref.current = button;

    act(() => result.current.trigger());
    expect(button.dataset.tap).toBe("on");

    act(() => vi.advanceTimersByTime(1400));
    expect(button.dataset.tap).toBeUndefined();
  });

  it("counts taps so every tap can start its own bubble", () => {
    const { result } = renderHook(() => useTapReaction());
    expect(result.current.tapId).toBe(0);

    act(() => result.current.trigger());
    expect(result.current.tapId).toBe(1);

    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.trigger());
    expect(result.current.tapId).toBe(2);
  });

  it("clears its timer on unmount", () => {
    const { result, unmount } = renderHook(() => useTapReaction());
    act(() => result.current.trigger());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
