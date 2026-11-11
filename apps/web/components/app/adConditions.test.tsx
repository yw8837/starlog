// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NowOracle, nowAdOn } from "@/app/now/NowOracle";
import { GradeView, gradeAdOn } from "@/app/saju/grade/GradeView";
import { resetBridgeForTests } from "@/lib/app/bridge";
import { SAJU_PROFILE_KEY } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";

/** W2.6: where each free result turns the Starlog app's banner on (AppAdSignal), screen by screen. */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const APP_UA = "Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 StarlogApp/1.0.0";

/** The shell, recording each `ad` request's show flag (no answer needed). */
function adShell() {
  const shows: boolean[] = [];
  const native = {
    onmessage: null,
    postMessage: (raw: string) => {
      const message = JSON.parse(raw) as { type: string; payload?: { show: boolean } };
      if (message.type === "ad") shows.push(message.payload!.show);
    },
  };
  Object.defineProperty(window, "StarlogNative", { configurable: true, value: native });
  return shows;
}

beforeEach(() => {
  resetBridgeForTests();
  vi.stubGlobal("navigator", { ...navigator, userAgent: APP_UA });
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as { StarlogNative?: unknown }).StarlogNative;
  resetBridgeForTests();
  window.localStorage.clear();
});

describe("지금의 한 장 (NowOracle)", () => {
  it("is on once the picked card has turned, never on the care screen", () => {
    expect(nowAdOn(true, true, false)).toBe(true);
    expect(nowAdOn(true, false, false)).toBe(false);
    expect(nowAdOn(false, false, false)).toBe(false);
    expect(nowAdOn(true, true, true)).toBe(false);
  });

  const pickOne = () => {
    fireEvent.click(screen.getAllByRole("button", { name: /^카드 \d+$/ })[3]!);
    for (let i = 0; i < 3; i++) act(() => vi.runAllTimers());
  };

  it("signals off on the table and on after the card turns", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const shows = adShell();
    render(<NowOracle instant />);
    expect(shows).toEqual([false]);
    pickOne();
    expect(shows.at(-1)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "한 번 더 뽑기" }));
    expect(shows.at(-1)).toBe(false);
  });

  it("stays off when the worry has crisis words (the helplines screen)", () => {
    vi.useFakeTimers();
    const shows = adShell();
    render(<NowOracle instant />);
    fireEvent.change(screen.getByLabelText("고민 한 줄"), { target: { value: "죽고 싶어" } });
    pickOne();
    expect(shows).not.toContain(true);
  });
});

describe("사주 등급 카드 (GradeView)", () => {
  it("is on for a card from a birth the visitor entered, off for the example", () => {
    expect(gradeAdOn("own")).toBe(true);
    expect(gradeAdOn("friend")).toBe(true);
    expect(gradeAdOn("example")).toBe(false);
  });

  it("stays off on the example card and turns on for the visitor's own", async () => {
    const shows = adShell();
    const { unmount } = render(<GradeView />);
    await waitFor(() => expect(screen.getByRole("figure").textContent).toContain("예시"));
    expect(shows).not.toContain(true);
    unmount();
    window.localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify({ ...DEFAULT_SAJU_FORM, year: 1995, month: 6, day: 1 }));
    render(<GradeView />);
    await waitFor(() => expect(screen.getByRole("figure").textContent).not.toContain("예시"));
    expect(shows.at(-1)).toBe(true);
  });
});
