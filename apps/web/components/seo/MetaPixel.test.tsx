// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/script", async () => {
  const { createElement } = await import("react");
  return { default: ({ src }: { src: string }) => createElement("script", { "data-src": src }) };
});

const ID = "123456789012345";
const KEY = "starlog.analytics.consent";
const IN_FORCE = Date.parse("2026-11-17T00:00:00+09:00");
type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[][]; disablePushState?: boolean };
const w = window as unknown as { fbq?: Fbq; _fbq?: unknown };

let MetaPixel: typeof import("./MetaPixel").MetaPixel;
let trackMetaPurchase: typeof import("./MetaPixel").trackMetaPurchase;

beforeEach(async () => {
  vi.resetModules();
  ({ MetaPixel, trackMetaPurchase } = await import("./MetaPixel"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(IN_FORCE);
  nav.pathname = "/";
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  delete w.fbq;
  delete w._fbq;
});

const queue = () => (w.fbq?.queue ?? []).map((args) => [...args]);
const flush = () => act(async () => {});

describe("MetaPixel (sales 2026-11-10 item 7): only for a visitor whose 허용 named Meta, only with a pixel id", () => {
  it("loads nothing with no pixel id, even after 허용", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ choice: "granted", at: "x", meta: true }));
    const { container } = render(<MetaPixel id="" />);
    await flush();
    expect(container.innerHTML).toBe("");
    expect(w.fbq).toBeUndefined();
  });

  it("loads nothing before a choice, or on an older 허용 that covered GA only", async () => {
    const { container } = render(<MetaPixel id={ID} />);
    await flush();
    expect(container.innerHTML).toBe("");
    window.localStorage.setItem(KEY, JSON.stringify({ choice: "granted", at: "x" }));
    cleanup();
    const again = render(<MetaPixel id={ID} />);
    await flush();
    expect(again.container.innerHTML).toBe("");
    expect(w.fbq).toBeUndefined();
  });

  it("after 허용 loads fbevents.js, sends one PageView per page with nothing personal in its address, and none for /chapter or /pay", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ choice: "granted", at: "x", meta: true }));
    const view = render(<MetaPixel id={ID} />);
    await flush();
    expect(view.container.querySelector("script")?.getAttribute("data-src")).toBe("https://connect.facebook.net/en_US/fbevents.js");
    expect(w.fbq?.disablePushState).toBe(true);
    expect(queue()).toEqual([["set", "autoConfig", false, ID], ["init", ID], ["consent", "grant"], ["track", "PageView"]]);
    window.history.pushState(null, "", "/chapter/abc123");
    nav.pathname = "/chapter/abc123";
    view.rerender(<MetaPixel id={ID} />);
    await flush();
    expect(queue().filter((a) => a[1] === "PageView")).toHaveLength(1);
  });

  const FAST = { loadMs: 40, settleMs: 30 };
  const granted = async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ choice: "granted", at: "x", meta: true }));
    render(<MetaPixel id={ID} />);
    await flush();
  };
  /** What fbevents.js does when it arrives: it takes over the stub's calls. */
  const loadScript = () => {
    const calls: unknown[][] = [];
    (w.fbq as unknown as { callMethod: (...args: unknown[]) => void }).callMethod = (...args) => calls.push(args);
    return calls;
  };

  it("sends nothing and waits for nothing where the pixel does not run", async () => {
    const started = Date.now();
    await trackMetaPurchase("order_1", 14900, ID, FAST);
    expect(w.fbq).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(FAST.loadMs);
  });

  it("waits for fbevents.js, sends Purchase in KRW with an event id from a hash of the order (never the order id), once per order", async () => {
    window.sessionStorage.clear();
    await granted();
    let calls: unknown[][] = [];
    setTimeout(() => (calls = loadScript()), 10);
    await trackMetaPurchase("order_1", 14900, ID, FAST);
    const purchases = calls.filter((a) => a[1] === "Purchase");
    expect(purchases).toHaveLength(1);
    const [, , data, options] = purchases[0] as [string, string, unknown, { eventID: string }];
    expect(data).toEqual({ value: 14900, currency: "KRW" });
    expect(options.eventID).toMatch(/^purchase-[0-9a-f]{32}$/);
    expect(options.eventID).not.toContain("order_1");
    expect(JSON.stringify(window.sessionStorage)).not.toContain("order_1");
    await trackMetaPurchase("order_1", 14900, ID, FAST);
    expect(calls.filter((a) => a[1] === "Purchase")).toHaveLength(1);
  });

  it("resolves only after a short pause once sent, so the request leaves before the page does", async () => {
    window.sessionStorage.clear();
    await granted();
    loadScript();
    const started = performance.now();
    await trackMetaPurchase("order_2", 7900, ID, FAST);
    expect(performance.now() - started).toBeGreaterThanOrEqual(FAST.settleMs - 5);
  });

  it("gives up waiting after the bound when fbevents.js never arrives, and does not mark the order sent", async () => {
    window.sessionStorage.clear();
    await granted();
    const started = performance.now();
    await trackMetaPurchase("order_3", 7900, ID, FAST);
    const waited = performance.now() - started;
    expect(waited).toBeGreaterThanOrEqual(FAST.loadMs - 5);
    expect(waited).toBeLessThan(FAST.loadMs + FAST.settleMs + 200);
    // Not sent for real: a reload of /pay/success may try again (the same event id lets Meta drop a repeat).
    const calls = loadScript();
    await trackMetaPurchase("order_3", 7900, ID, FAST);
    expect(calls.filter((a) => a[1] === "Purchase")).toHaveLength(1);
  });
});
