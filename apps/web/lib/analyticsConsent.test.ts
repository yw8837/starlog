// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Consent = typeof import("./analyticsConsent");
let consent: Consent;

const KEY = "starlog.analytics.consent";
const DISABLE = "ga-disable-G-8X11ZGFZKY";
const flags = window as unknown as Record<string, unknown>;

beforeEach(async () => {
  // A fresh module each time: the in-memory fallback lives for one page load.
  vi.resetModules();
  consent = await import("./analyticsConsent");
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete flags[DISABLE];
});

describe("analytics consent store: one choice per browser, in localStorage", () => {
  it("has no choice at first, then keeps {choice, at} under starlog.analytics.consent", () => {
    expect(consent.CONSENT_KEY).toBe(KEY);
    expect(consent.readChoice()).toBeNull();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-30T09:15:00+09:00"));
    consent.chooseAnalytics("granted");
    vi.useRealTimers();
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "null")).toEqual({ choice: "granted", at: "2026-10-30T00:15:00.000Z" });
    expect(consent.readChoice()).toBe("granted");
    consent.chooseAnalytics("denied");
    expect(consent.readChoice()).toBe("denied");
  });

  it("reads a value it cannot use (another shape, another word, not JSON) as no choice", () => {
    for (const raw of ['{"choice":"yes"}', '"granted"', "granted", "{", "null"]) {
      window.localStorage.setItem(KEY, raw);
      expect(consent.readChoice(), raw).toBeNull();
    }
  });

  it("when storage throws, keeps the choice in memory for this page load instead of asking on every page", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(consent.readChoice()).toBeNull();
    expect(() => consent.chooseAnalytics("granted")).not.toThrow();
    expect(consent.readChoice()).toBe("granted");
  });

  it("when only writing fails, the choice made now wins over the older one still stored", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ choice: "granted", at: "2026-10-30T00:00:00.000Z" }));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    consent.chooseAnalytics("denied");
    expect(consent.readChoice()).toBe("denied");
    // The older choice is gone from storage too: the next page load asks again rather than reading it.
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("tells its subscribers about a choice made here and one made in another tab", () => {
    const listener = vi.fn();
    const unsubscribe = consent.subscribeChoice(listener);
    consent.chooseAnalytics("granted");
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new StorageEvent("storage", { key: "starlog.chapters" }));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    consent.chooseAnalytics("denied");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("denying stops gtag (ga-disable flag) and deletes _ga and _ga_8X11ZGFZKY on this host and on .yeolmaeapps.kr", () => {
    const writes: string[] = [];
    vi.spyOn(Document.prototype, "cookie", "set").mockImplementation((value: string) => {
      writes.push(value);
    });
    consent.chooseAnalytics("denied");
    expect(flags[DISABLE]).toBe(true);
    expect(writes.sort()).toEqual(
      [
        "_ga=; Max-Age=0; path=/",
        "_ga=; Max-Age=0; path=/; domain=.yeolmaeapps.kr",
        "_ga_8X11ZGFZKY=; Max-Age=0; path=/",
        "_ga_8X11ZGFZKY=; Max-Age=0; path=/; domain=.yeolmaeapps.kr",
      ].sort(),
    );
  });

  it("allowing touches no cookie and leaves the flag to the loader", () => {
    const set = vi.spyOn(Document.prototype, "cookie", "set");
    consent.chooseAnalytics("granted");
    expect(set).not.toHaveBeenCalled();
    expect(flags[DISABLE]).toBeUndefined();
  });
});
