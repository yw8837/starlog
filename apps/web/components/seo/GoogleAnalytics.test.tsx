// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GA_MEASUREMENT_ID, gaScriptSrc } from "@/lib/analytics";

const nav = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/script", async () => {
  const { createElement } = await import("react");
  return { default: ({ src, strategy }: { src: string; strategy: string }) => createElement("script", { "data-src": src, "data-strategy": strategy }) };
});

/** The GA revision (lib/legal.ts GA_REVISION_DATE) and the second before it, in KST. */
const IN_FORCE = Date.parse("2026-10-30T00:00:00+09:00");
const BEFORE = IN_FORCE - 1000;
const KEY = "starlog.analytics.consent";
const DISABLE = "ga-disable-G-8X11ZGFZKY";
const ORIGIN = window.location.origin;
const flags = window as unknown as Record<string, unknown>;

// Fresh modules each time: the consent store keeps the last choice in memory for a page load.
let GoogleAnalytics: typeof import("./GoogleAnalytics").GoogleAnalytics;
let chooseAnalytics: typeof import("@/lib/analyticsConsent").chooseAnalytics;

beforeEach(async () => {
  vi.resetModules();
  ({ GoogleAnalytics } = await import("./GoogleAnalytics"));
  ({ chooseAnalytics } = await import("@/lib/analyticsConsent"));
  nav.pathname = "/";
  window.history.replaceState(null, "", "/");
  document.title = "스타로그";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  delete window.dataLayer;
  delete window.gtag;
  delete flags[DISABLE];
});

const at = (time: number) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(time);
};
const stored = (choice: "granted" | "denied") => window.localStorage.setItem(KEY, JSON.stringify({ choice, at: "2026-10-30T00:00:00.000Z" }));
const calls = () => (window.dataLayer ?? []).map((args) => [...(args as IArguments)]);
const pageViews = () => calls().filter((args) => args[0] === "event" && args[1] === "page_view");
const go = (path: string, title: string) => {
  window.history.pushState(null, "", path);
  nav.pathname = new URL(path, ORIGIN).pathname;
  document.title = title;
};
const flush = () => act(async () => {});

describe("GoogleAnalytics: only for visitors who allowed it, only once the GA revision is in force (browser's clock)", () => {
  it("uses the 스타로그 property's measurement ID", () => {
    expect(GA_MEASUREMENT_ID).toBe("G-8X11ZGFZKY");
    expect(gaScriptSrc(GA_MEASUREMENT_ID)).toBe("https://www.googletagmanager.com/gtag/js?id=G-8X11ZGFZKY");
  });

  it("renders nothing and queues nothing: before 2026-10-30 even when allowed, from it with no choice or 거부, and with an empty ID", async () => {
    for (const [time, choice, id] of [
      [BEFORE, "granted", undefined],
      [IN_FORCE, null, undefined],
      [IN_FORCE, "denied", undefined],
      [IN_FORCE, "granted", ""],
    ] as const) {
      at(time);
      window.localStorage.clear();
      if (choice) stored(choice);
      const { container } = render(createElement(GoogleAnalytics, id === undefined ? {} : { id }));
      await flush();
      expect(container.innerHTML, `${time} ${choice} ${id}`).toBe("");
      expect(window.dataLayer).toBeUndefined();
      expect(window.gtag).toBeUndefined();
      cleanup();
    }
  });

  it("allowed: gtag.js after hydration, then set (redacted fields) → config (no page_view of its own, signals off) → one page_view with the same fields", async () => {
    at(IN_FORCE);
    stored("granted");
    go("/s/abc123?x=1#top", "친구가 뽑은 카드 · 바보 · 스타로그");
    const { container } = render(createElement(GoogleAnalytics));
    await flush();
    const script = container.querySelector("script");
    expect(script?.getAttribute("data-src")).toBe("https://www.googletagmanager.com/gtag/js?id=G-8X11ZGFZKY");
    expect(script?.getAttribute("data-strategy")).toBe("afterInteractive");
    const fields = { page_location: `${ORIGIN}/s/`, page_title: "공유된 풀이 · 스타로그" };
    expect(calls().map((args) => args[0])).toEqual(["js", "set", "config", "event"]);
    expect(calls().slice(1)).toEqual([
      ["set", fields],
      ["config", "G-8X11ZGFZKY", { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false }],
      ["event", "page_view", fields],
    ]);
    expect(flags[DISABLE]).toBe(false);
  });

  it("one page_view per pathname: none again on a re-render, a hash or a title change (the PDF's), a new one on navigation with the page before as referrer", async () => {
    at(IN_FORCE);
    stored("granted");
    go("/tarot/new?utm_source=threads&fbclid=1", "타로 · 스타로그");
    const { rerender } = render(createElement(GoogleAnalytics));
    await flush();
    expect(pageViews()).toHaveLength(1);
    rerender(createElement(GoogleAnalytics));
    window.history.replaceState(null, "", "/tarot/new?utm_source=threads&fbclid=1#cards");
    document.title = "스타로그-타로-2026-10-30";
    rerender(createElement(GoogleAnalytics));
    await flush();
    expect(pageViews()).toHaveLength(1);
    go("/chapter/8f2c1d", "스타로그-타로-2026-10-30");
    rerender(createElement(GoogleAnalytics));
    await flush();
    const fields = { page_location: `${ORIGIN}/chapter/`, page_title: "내 기록 · 스타로그", page_referrer: `${ORIGIN}/tarot/new?utm_source=threads` };
    expect(calls().slice(-2)).toEqual([
      ["set", fields],
      ["event", "page_view", fields],
    ]);
    expect(calls().filter((args) => args[0] === "config")).toHaveLength(1);
  });

  it("reacts to the choice without a reload: 허용 starts it on this page, 거부 stops it (flag, no more page_views), 허용 again resumes with one config", async () => {
    at(IN_FORCE);
    const { container, rerender } = render(createElement(GoogleAnalytics));
    await flush();
    expect(container.innerHTML).toBe("");
    act(() => chooseAnalytics("granted"));
    await flush();
    expect(container.querySelector("script")).not.toBeNull();
    expect(pageViews()).toHaveLength(1);
    act(() => chooseAnalytics("denied"));
    await flush();
    expect(container.innerHTML).toBe("");
    expect(flags[DISABLE]).toBe(true);
    go("/me", "내 정보 · 스타로그");
    rerender(createElement(GoogleAnalytics));
    await flush();
    expect(pageViews()).toHaveLength(1);
    act(() => chooseAnalytics("granted"));
    await flush();
    expect(flags[DISABLE]).toBe(false);
    expect(pageViews()).toHaveLength(2);
    expect(pageViews()[1]?.[2]).toEqual({ page_location: `${ORIGIN}/me`, page_title: "내 정보 · 스타로그", page_referrer: `${ORIGIN}/` });
    expect(calls().filter((args) => args[0] === "config")).toHaveLength(1);
  });

  it("a 거부 made in another tab stops the gtag already running here", async () => {
    at(IN_FORCE);
    stored("granted");
    render(createElement(GoogleAnalytics));
    await flush();
    stored("denied");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });
    await flush();
    expect(flags[DISABLE]).toBe(true);
  });

  it("is never in the server HTML, which is cached for a year", () => {
    at(IN_FORCE);
    stored("granted");
    expect(renderToString(createElement(GoogleAnalytics))).toBe("");
  });
});
