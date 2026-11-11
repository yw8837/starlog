// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBridgeForTests } from "@/lib/app/bridge";
import { AppAdSignal } from "./AppAdSignal";

const APP_UA = "Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 StarlogApp/1.0.0";
const CHROME_UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

/** The shell, recording each `ad` request's payload; answers ok (or ERROR). */
function adShell(fail = false) {
  const shows: boolean[] = [];
  const native = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (raw: string) => {
      const message = JSON.parse(raw) as { id: string; type: string; payload?: { show: boolean } };
      if (message.type === "ad") shows.push(message.payload!.show);
      queueMicrotask(() => native.onmessage?.({ data: JSON.stringify(fail ? { id: message.id, ok: false, code: "ERROR" } : { id: message.id, ok: true }) }));
    },
  };
  Object.defineProperty(window, "StarlogNative", { configurable: true, value: native });
  return shows;
}

beforeEach(() => resetBridgeForTests());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as { StarlogNative?: unknown }).StarlogNative;
  resetBridgeForTests();
});

describe("AppAdSignal (a free result's banner signal, the Starlog app only)", () => {
  it("asks for the banner while on, and hides it when off and when the screen goes", () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: APP_UA });
    const shows = adShell();
    const { container, rerender, unmount } = render(<AppAdSignal on={false} />);
    expect(container.innerHTML).toBe("");
    expect(shows).toEqual([false]);
    rerender(<AppAdSignal on />);
    expect(shows.at(-1)).toBe(true);
    rerender(<AppAdSignal on={false} />);
    expect(shows.at(-1)).toBe(false);
    rerender(<AppAdSignal on />);
    unmount();
    expect(shows.at(-1)).toBe(false);
  });

  it("swallows the shell's errors", async () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: APP_UA });
    adShell(true);
    const errors = vi.fn();
    window.addEventListener("unhandledrejection", errors);
    render(<AppAdSignal on />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    window.removeEventListener("unhandledrejection", errors);
    expect(errors).not.toHaveBeenCalled();
  });

  it("does nothing in a browser", () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: CHROME_UA });
    const shows = adShell();
    render(<AppAdSignal on />);
    expect(shows).toEqual([]);
  });
});
