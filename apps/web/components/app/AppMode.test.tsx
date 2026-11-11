// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { resetBridgeForTests } from "@/lib/app/bridge";
import { resetShellForTests, usePrivacyOptionsRequired } from "@/lib/app/shell";
import { AppMode } from "./AppMode";

/** What 내 정보 reads from the shell's hello. */
function PrivacyFlag() {
  return <p data-testid="privacy">{String(usePrivacyOptionsRequired())}</p>;
}

const APP_UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 StarlogApp/1.0.0";
const CHROME_UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

type Purchase = { purchaseToken: string; productId: string };

/**
 * The shell: answers `hello` with `hello` (counted in `hellos`) and unfinishedPurchases with `purchases` (each call); `types`
 * records every other request.
 */
function fakeShell(purchases: () => Purchase[] | "ERROR", hello: Record<string, unknown> | "ERROR" = { version: "1.0.0", privacyOptionsRequired: false }) {
  const types: string[] = [];
  const native = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (raw: string) => {
      const { id, type } = JSON.parse(raw) as { id: string; type: string };
      const answer = type === "hello" ? hello : purchases();
      if (type === "hello") hellos++;
      else types.push(type);
      queueMicrotask(() =>
        native.onmessage?.({
          data: JSON.stringify(answer === "ERROR" ? { id, ok: false, code: "ERROR" } : { id, ok: true, data: type === "hello" ? answer : { purchases: answer } }),
        }),
      );
    },
  };
  Object.defineProperty(window, "StarlogNative", { configurable: true, value: native });
  return types;
}
let hellos = 0;

/** /api/pay/play/verify answers `verify(token)`; /api/me answers a member. */
function stubServer(verify: (token: string) => Response) {
  const calls: Array<{ url: string; body?: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url === "/api/pay/play/verify") return verify((JSON.parse(String(init!.body)) as Purchase).purchaseToken);
      if (url === "/api/me") return Response.json({ payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused: [], opening: [] } });
      return new Response(null, { status: 404 });
    }),
  );
  return calls;
}

const setUa = (ua: string) => vi.stubGlobal("navigator", { ...navigator, userAgent: ua });
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  resetBridgeForTests();
  resetAccountForTests();
  resetShellForTests();
  hellos = 0;
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  delete document.documentElement.dataset.app;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as { StarlogNative?: unknown }).StarlogNative;
  delete document.documentElement.dataset.app;
  resetBridgeForTests();
  resetAccountForTests();
});

describe("AppMode (root layout, the Starlog app only)", () => {
  it("renders nothing and does nothing in a browser", async () => {
    setUa(CHROME_UA);
    const types = fakeShell(() => []);
    const calls = stubServer(() => Response.json({}));
    const { container } = render(<AppMode />);
    await act(async () => {});
    expect(container.innerHTML).toBe("");
    expect(types).toEqual([]);
    expect(calls).toEqual([]);
    expect(document.documentElement.dataset.app).toBeUndefined();
  });

  it("keeps <html data-app> (React's dev remount clears what the <head> script set)", () => {
    setUa(APP_UA);
    fakeShell(() => []);
    stubServer(() => Response.json({}));
    render(<AppMode />);
    expect(document.documentElement.dataset.app).toBe("android");
  });

  it("on start sends each unfinished purchase to verify and refreshes the account once one is paid", async () => {
    setUa(APP_UA);
    const types = fakeShell(() => [
      { purchaseToken: "tok-1", productId: "tarot" },
      { purchaseToken: "tok-2", productId: "saju" },
    ]);
    const calls = stubServer((token) =>
      token === "tok-1" ? Response.json({ status: "paid", orderId: "o1", productId: "tarot", returnTo: "/", signedIn: true }) : Response.json({ code: "PAY_PENDING" }, { status: 409 }),
    );
    render(<AppMode />);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/me")).toBe(true));
    expect(types).toEqual(["unfinishedPurchases"]);
    expect(calls.filter((c) => c.url === "/api/pay/play/verify").map((c) => c.body)).toEqual([
      { purchaseToken: "tok-1", productId: "tarot" },
      { purchaseToken: "tok-2", productId: "saju" },
    ]);
  });

  it("asks again when the app comes back to the front, and stays quiet when nothing is paid or the shell fails", async () => {
    setUa(APP_UA);
    let answer: Purchase[] | "ERROR" = "ERROR";
    const types = fakeShell(() => answer);
    const calls = stubServer(() => Response.json({ code: "PAY_FAILED", message: "x" }, { status: 402 }));
    render(<AppMode />);
    await waitFor(() => expect(types).toEqual(["unfinishedPurchases"]));
    answer = [{ purchaseToken: "tok-3", productId: "match" }];
    visibility = "hidden";
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(types).toHaveLength(1);
    visibility = "visible";
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(calls.filter((c) => c.url === "/api/pay/play/verify")).toHaveLength(1));
    expect(types).toEqual(["unfinishedPurchases", "unfinishedPurchases"]);
    expect(calls.some((c) => c.url === "/api/me")).toBe(false);
    // hello is asked once per page load, not on each resume
    expect(hellos).toBe(1);
  });

  it("asks the shell's hello once and keeps privacyOptionsRequired for 내 정보", async () => {
    setUa(APP_UA);
    fakeShell(() => [], { version: "1.0.0", privacyOptionsRequired: true });
    stubServer(() => Response.json({}));
    const { getByTestId } = render(
      <>
        <AppMode />
        <PrivacyFlag />
      </>,
    );
    await waitFor(() => expect(getByTestId("privacy").textContent).toBe("true"));
    expect(hellos).toBe(1);
  });

  it("keeps it off when the shell says false, fails, or is not there", async () => {
    setUa(APP_UA);
    fakeShell(() => [], { version: "1.0.0", privacyOptionsRequired: false });
    stubServer(() => Response.json({}));
    const first = render(
      <>
        <AppMode />
        <PrivacyFlag />
      </>,
    );
    await waitFor(() => expect(hellos).toBe(1));
    await act(async () => {});
    expect(first.getByTestId("privacy").textContent).toBe("false");
    first.unmount();
    resetBridgeForTests();
    fakeShell(() => [], "ERROR");
    const second = render(
      <>
        <AppMode />
        <PrivacyFlag />
      </>,
    );
    await waitFor(() => expect(hellos).toBe(2));
    await act(async () => {});
    expect(second.getByTestId("privacy").textContent).toBe("false");
    second.unmount();
    delete (window as { StarlogNative?: unknown }).StarlogNative;
    resetBridgeForTests();
    const third = render(
      <>
        <AppMode />
        <PrivacyFlag />
      </>,
    );
    await act(async () => {});
    expect(third.getByTestId("privacy").textContent).toBe("false");
  });
});
