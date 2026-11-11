// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeError, callNative, isApp, onNativeEvent, resetBridgeForTests, useIsApp } from "./bridge";

const APP_UA = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 StarlogApp/1.0.0";
const CHROME_UA = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

/** The object the shell injects (WebViewCompat.addWebMessageListener): postMessage out, onmessage in. */
function fakeNative() {
  const sent: Array<{ id: string; type: string; payload?: unknown }> = [];
  const native = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: vi.fn((message: string) => {
      sent.push(JSON.parse(message) as { id: string; type: string; payload?: unknown });
    }),
    /** The shell answers (a string, as replyProxy.postMessage(String) sends it). */
    reply(body: Record<string, unknown>) {
      native.onmessage?.({ data: JSON.stringify(body) });
    },
  };
  Object.defineProperty(window, "StarlogNative", { configurable: true, value: native });
  return { native, sent };
}

const userAgent = (ua: string) => vi.stubGlobal("navigator", { ...navigator, userAgent: ua });

beforeEach(() => resetBridgeForTests());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window as { StarlogNative?: unknown }).StarlogNative;
  resetBridgeForTests();
});

describe("isApp / useIsApp", () => {
  it("is true only in the Starlog app's WebView", () => {
    userAgent(APP_UA);
    expect(isApp()).toBe(true);
    userAgent(CHROME_UA);
    expect(isApp()).toBe(false);
  });

  it("starts false (as the server rendered) and turns true after mount in the app", () => {
    userAgent(APP_UA);
    const seen: boolean[] = [];
    renderHook(() => {
      const app = useIsApp();
      seen.push(app);
      return app;
    });
    expect(seen[0]).toBe(false);
    expect(seen.at(-1)).toBe(true);
  });

  it("stays false in a browser", () => {
    userAgent(CHROME_UA);
    const { result } = renderHook(() => useIsApp());
    expect(result.current).toBe(false);
  });
});

describe("callNative", () => {
  it("sends {id, type, payload} and resolves with the reply's data, matched by id", async () => {
    const { native, sent } = fakeNative();
    const first = callNative<{ version: string }>("hello");
    const second = callNative<{ purchaseToken: string }>("purchase", { playProductId: "tarot", orderId: "o1", accountTag: "a".repeat(64) });
    expect(sent.map((m) => m.type)).toEqual(["hello", "purchase"]);
    expect(sent[1]!.payload).toEqual({ playProductId: "tarot", orderId: "o1", accountTag: "a".repeat(64) });
    expect(new Set(sent.map((m) => m.id)).size).toBe(2);
    // answered out of order: each promise gets its own reply
    native.reply({ id: sent[1]!.id, ok: true, data: { purchaseToken: "tok" } });
    native.reply({ id: sent[0]!.id, ok: true, data: { version: "1.0.0" } });
    await expect(second).resolves.toEqual({ purchaseToken: "tok" });
    await expect(first).resolves.toEqual({ version: "1.0.0" });
  });

  it("takes an object reply as well as a string", async () => {
    const { native, sent } = fakeNative();
    const call = callNative("ad", { show: true });
    native.onmessage?.({ data: { id: sent[0]!.id, ok: true } });
    await expect(call).resolves.toBeUndefined();
  });

  it("rejects with the reply's code (CANCELED, PENDING, ERROR) and message", async () => {
    const { native, sent } = fakeNative();
    const call = callNative("purchase", { playProductId: "saju", orderId: "o2", accountTag: "b".repeat(64) });
    native.reply({ id: sent[0]!.id, ok: false, code: "CANCELED" });
    await expect(call).rejects.toMatchObject({ code: "CANCELED" });
    const pending = callNative("purchase", {});
    native.reply({ id: sent[1]!.id, ok: false, code: "PENDING", message: "pending" });
    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NativeError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: "PENDING", message: "pending" });
  });

  it("rejects UNAVAILABLE without the shell (a browser)", async () => {
    await expect(callNative("hello")).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("rejects UNAVAILABLE when the shell does not answer in time, and ignores a late answer", async () => {
    vi.useFakeTimers();
    const { native, sent } = fakeNative();
    const call = callNative("unfinishedPurchases", undefined, 1_000);
    const outcome = call.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await outcome).toMatchObject({ code: "UNAVAILABLE" });
    expect(() => native.reply({ id: sent[0]!.id, ok: true, data: {} })).not.toThrow();
  });

  it("gives purchase, googleSignIn and privacyOptions no short timeout: the person is in a native sheet", async () => {
    vi.useFakeTimers();
    const { native, sent } = fakeNative();
    const purchase = callNative("purchase", {});
    const signIn = callNative("googleSignIn", { clientId: "c", nonce: "n" });
    const privacy = callNative("privacyOptions");
    let settled = false;
    void Promise.allSettled([purchase, signIn, privacy]).then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(settled).toBe(false);
    native.reply({ id: sent[0]!.id, ok: true, data: { purchaseToken: "t", productId: "tarot" } });
    native.reply({ id: sent[1]!.id, ok: true, data: { idToken: "x.y.z" } });
    native.reply({ id: sent[2]!.id, ok: true });
    await expect(purchase).resolves.toEqual({ purchaseToken: "t", productId: "tarot" });
    await expect(signIn).resolves.toEqual({ idToken: "x.y.z" });
    await expect(privacy).resolves.toBeUndefined();
  });

  it("rejects UNAVAILABLE when postMessage throws", async () => {
    const { native } = fakeNative();
    native.postMessage.mockImplementation(() => {
      throw new Error("detached");
    });
    await expect(callNative("hello")).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("ignores messages it cannot read or did not ask for", async () => {
    const { native, sent } = fakeNative();
    const call = callNative("hello");
    expect(() => native.onmessage?.({ data: "not json" })).not.toThrow();
    native.reply({ id: "someone-else", ok: true, data: 1 });
    native.reply({ id: sent[0]!.id, ok: true, data: 2 });
    await expect(call).resolves.toBe(2);
  });
});

describe("onNativeEvent", () => {
  it("hands {event, data} messages to the handlers of that event until unsubscribed", async () => {
    const { native } = fakeNative();
    const seen: unknown[] = [];
    const stop = onNativeEvent("resume", (data) => seen.push(data));
    const other = vi.fn();
    onNativeEvent("other", other);
    act(() => native.reply({ event: "resume", data: { at: 1 } }));
    stop();
    act(() => native.reply({ event: "resume", data: { at: 2 } }));
    expect(seen).toEqual([{ at: 1 }]);
    expect(other).not.toHaveBeenCalled();
  });

  it("does nothing in a browser", () => {
    const stop = onNativeEvent("resume", () => {});
    expect(() => stop()).not.toThrow();
  });
});
