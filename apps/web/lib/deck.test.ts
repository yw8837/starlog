// @vitest-environment jsdom
import { cardImage } from "@starlog/core";
import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CARD_BACKS, DECK_KEY, DEFAULT_DECK_PREFS, FRONT_DECKS, backImage, faceImage, setDeckPrefs, useDeckPrefs } from "./deck";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const SAVED = { front: "rws1909", back: "moon-guardian" } as const;

describe("deck preference", () => {
  it("is the Starlog deck with the 별자리 지도 back until the visitor chooses", () => {
    expect(DEFAULT_DECK_PREFS).toEqual({ front: "starlog", back: "constellation" });
    expect(renderHook(() => useDeckPrefs()).result.current).toEqual(DEFAULT_DECK_PREFS);
    expect(FRONT_DECKS).toEqual(["starlog", "rws1909"]);
    expect(CARD_BACKS).toEqual(["constellation", "navy-gold", "ribbon-garden", "moon-guardian"]);
  });

  it("is the defaults on the server and during hydration, whatever this device saved, and the saved choice in the browser", () => {
    localStorage.setItem(DECK_KEY, JSON.stringify(SAVED));
    const Probe = () => {
      const { front, back } = useDeckPrefs();
      return createElement("span", null, `${front}/${back}`);
    };
    expect(renderToString(createElement(Probe))).toContain("starlog/constellation");
    expect(renderHook(() => useDeckPrefs()).result.current).toEqual(SAVED);
  });

  it("is kept under starlog.deck, a change to one half leaving the other as it was", () => {
    const { result } = renderHook(() => useDeckPrefs());
    act(() => setDeckPrefs({ back: "navy-gold" }));
    expect(result.current).toEqual({ front: "starlog", back: "navy-gold" });
    expect(JSON.parse(localStorage.getItem("starlog.deck") ?? "null")).toEqual({ front: "starlog", back: "navy-gold" });
    act(() => setDeckPrefs({ front: "rws1909" }));
    expect(result.current).toEqual({ front: "rws1909", back: "navy-gold" });
    expect(JSON.parse(localStorage.getItem("starlog.deck") ?? "null")).toEqual({ front: "rws1909", back: "navy-gold" });
  });

  it("reaches every mounted card at once", () => {
    const first = renderHook(() => useDeckPrefs());
    const second = renderHook(() => useDeckPrefs());
    act(() => setDeckPrefs({ front: "rws1909", back: "ribbon-garden" }));
    expect(first.result.current).toEqual({ front: "rws1909", back: "ribbon-garden" });
    expect(second.result.current).toBe(first.result.current);
  });

  it("follows a change made in another tab", () => {
    const { result } = renderHook(() => useDeckPrefs());
    localStorage.setItem(DECK_KEY, JSON.stringify(SAVED));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: DECK_KEY }));
    });
    expect(result.current).toEqual(SAVED);
  });

  it.each([
    ["text that is not JSON", "not json", DEFAULT_DECK_PREFS],
    ["null", "null", DEFAULT_DECK_PREFS],
    ["a list", "[]", DEFAULT_DECK_PREFS],
    ["a number", "3", DEFAULT_DECK_PREFS],
    ["a bare name", '"rws1909"', DEFAULT_DECK_PREFS],
    ["names that are not options", '{"front":"gold","back":"plain"}', DEFAULT_DECK_PREFS],
    ["names in the wrong letter case", '{"front":"RWS1909","back":"Navy-Gold"}', DEFAULT_DECK_PREFS],
    ["values that are not text", '{"front":1909,"back":null}', DEFAULT_DECK_PREFS],
    ["a good front with a bad back", '{"front":"rws1909","back":"plain"}', { front: "rws1909", back: "constellation" }],
    ["a bad front with a good back", '{"front":"gold","back":"navy-gold"}', { front: "starlog", back: "navy-gold" }],
    ["a good front only", '{"front":"rws1909"}', { front: "rws1909", back: "constellation" }],
  ])("falls back to the default for what it cannot read: %s", (_what, stored, expected) => {
    localStorage.setItem(DECK_KEY, stored);
    expect(renderHook(() => useDeckPrefs()).result.current).toEqual(expected);
  });

  it("keeps the choice for this visit when the browser will not store it, and reads the defaults when it will not be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const { result } = renderHook(() => useDeckPrefs());
    expect(result.current).toEqual(DEFAULT_DECK_PREFS);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => act(() => setDeckPrefs({ back: "ribbon-garden" }))).not.toThrow();
    expect(result.current).toEqual({ front: "starlog", back: "ribbon-garden" });
    // Storage works again: the next save leaves the memory copy behind.
    vi.restoreAllMocks();
    act(() => setDeckPrefs(DEFAULT_DECK_PREFS));
    expect(result.current).toEqual(DEFAULT_DECK_PREFS);
  });
});

describe("deck image paths", () => {
  it("names a face in the chosen deck, large or small", () => {
    expect(faceImage("major-00-fool", "lg", "starlog")).toBe("/cards/starlog/major-00-fool.webp");
    expect(faceImage("wands-01", "sm", "starlog")).toBe("/cards/starlog/wands-01-sm.webp");
    expect(faceImage("major-00-fool", "lg", "rws1909")).toBe("/cards/major-00-fool.webp");
    expect(faceImage("wands-01", "sm", "rws1909")).toBe("/cards/wands-01-sm.webp");
  });

  it("keeps the 1909 face where the card list has always had it", () => {
    for (const size of ["lg", "sm"] as const) expect(faceImage("pentacles-14", size, "rws1909")).toBe(cardImage("pentacles-14", size));
  });

  it("names a back, large or small", () => {
    expect(backImage("constellation", "lg")).toBe("/cards/backs/constellation.webp");
    expect(backImage("constellation", "sm")).toBe("/cards/backs/constellation-sm.webp");
    for (const back of CARD_BACKS) {
      expect(backImage(back, "lg")).toBe(`/cards/backs/${back}.webp`);
      expect(backImage(back, "sm")).toBe(`/cards/backs/${back}-sm.webp`);
    }
  });
});
