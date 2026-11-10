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

  it("sends Purchase with its value in KRW, once per order, and only where the pixel runs", async () => {
    trackMetaPurchase("order_1", 14900, ID);
    expect(w.fbq).toBeUndefined();
    window.localStorage.setItem(KEY, JSON.stringify({ choice: "granted", at: "x", meta: true }));
    render(<MetaPixel id={ID} />);
    await flush();
    trackMetaPurchase("order_1", 14900, ID);
    trackMetaPurchase("order_1", 14900, ID);
    expect(queue().filter((a) => a[1] === "Purchase")).toEqual([["track", "Purchase", { value: 14900, currency: "KRW" }]]);
  });
});
