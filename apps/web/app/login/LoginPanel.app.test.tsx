// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBridgeForTests } from "@/lib/app/bridge";
import { LoginPanel } from "./LoginPanel";

/** /login inside the Starlog app (W2.4): Google signs in natively; Kakao stays as it is (it runs inside the WebView). */

const APP_UA = "Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 StarlogApp/1.0.0";
const GOOGLE_START = "/api/auth/google/start?returnTo=%2Ftarot%2Fresult%3Fresume%3Dabc&age=signed-token";
const KAKAO_START = "/api/auth/kakao/start?returnTo=%2Ftarot%2Fresult&age=signed-token";

let calls: Array<{ url: string; body: unknown }> = [];

function stubServer(finish: () => Response, start: () => Response = () => Response.json({ state: "state-1", nonce: "nonce-1", clientId: "web.apps.googleusercontent.com" })) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, body });
      if (url === "/api/auth/age") return Response.json({ url: (body as { provider?: string }).provider === "google" ? GOOGLE_START : KAKAO_START });
      if (url === "/api/auth/google/native/start") return start();
      if (url === "/api/auth/google/native") return finish();
      return new Response(null, { status: 404 });
    }),
  );
}

function fakeShell(answer: { ok: true; data: unknown } | { ok: false; code: string }) {
  const sent: Array<{ type: string; payload?: unknown }> = [];
  const native = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (raw: string) => {
      const message = JSON.parse(raw) as { id: string; type: string; payload?: unknown };
      sent.push({ type: message.type, payload: message.payload });
      queueMicrotask(() => native.onmessage?.({ data: JSON.stringify({ id: message.id, ...answer }) }));
    },
  };
  Object.defineProperty(window, "StarlogNative", { configurable: true, value: native });
  return sent;
}

beforeEach(() => {
  resetBridgeForTests();
  vi.stubGlobal("navigator", { ...navigator, userAgent: APP_UA });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as { StarlogNative?: unknown }).StarlogNative;
  resetBridgeForTests();
});

const tapGoogle = () => {
  fireEvent.click(screen.getByRole("checkbox", { name: "만 14세 이상이에요" }));
  fireEvent.click(screen.getByRole("button", { name: "Google로 계속하기" }));
};

describe("LoginPanel in the Starlog app", () => {
  it("signs in with Google natively after the 만 14세 check, and returns with ?login=ok as the web flow does", async () => {
    const sent = fakeShell({ ok: true, data: { idToken: "id.token.sig" } });
    stubServer(() => Response.json({ ok: true, returnTo: "/tarot/result?resume=abc" }));
    const navigate = vi.fn();
    render(<LoginPanel next="/tarot/result?resume=abc" status={null} navigate={navigate} />);
    tapGoogle();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/tarot/result?resume=abc&login=ok"));
    expect(calls.map((c) => c.url)).toEqual(["/api/auth/age", "/api/auth/google/native/start", "/api/auth/google/native"]);
    expect(calls[1]!.body).toEqual({ returnTo: "/tarot/result?resume=abc", age: "signed-token" });
    expect(sent).toEqual([{ type: "googleSignIn", payload: { clientId: "web.apps.googleusercontent.com", nonce: "nonce-1" } }]);
    expect(calls[2]!.body).toEqual({ state: "state-1", idToken: "id.token.sig" });
    expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining("/api/auth/google/start"));
  });

  it("stays quietly when Google's sheet is closed, and shows the login's own failure line otherwise", async () => {
    fakeShell({ ok: false, code: "CANCELED" });
    stubServer(() => Response.json({ ok: true, returnTo: "/" }));
    const navigate = vi.fn();
    render(<LoginPanel next="/" status={null} navigate={navigate} />);
    tapGoogle();
    await waitFor(() => expect(calls.some((c) => c.url === "/api/auth/google/native/start")).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByText("로그인하지 못했어요. 다시 시도해 주세요.")).toBeNull();
    cleanup();
    resetBridgeForTests();
    fakeShell({ ok: true, data: { idToken: "id.token.sig" } });
    stubServer(() => Response.json({ code: "NOT_AVAILABLE", reason: "closed" }, { status: 409 }));
    render(<LoginPanel next="/" status={null} navigate={navigate} />);
    tapGoogle();
    // the visible line and the screen reader's status line
    expect(await screen.findAllByText("지금은 새로 가입할 수 없어요")).toHaveLength(2);
    cleanup();
    resetBridgeForTests();
    fakeShell({ ok: false, code: "ERROR" });
    stubServer(() => Response.json({ ok: true, returnTo: "/" }));
    render(<LoginPanel next="/" status={null} navigate={navigate} />);
    tapGoogle();
    expect(await screen.findAllByText("로그인하지 못했어요. 다시 시도해 주세요.")).toHaveLength(2);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps Kakao on its web flow, and never shows the in-app browser note", async () => {
    stubServer(() => Response.json({}));
    const navigate = vi.fn();
    render(<LoginPanel next="/tarot/result" status={null} navigate={navigate} />);
    expect(screen.queryByText(/앱 안 브라우저에서는/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "만 14세 이상이에요" }));
    fireEvent.click(screen.getByRole("button", { name: "카카오로 계속하기" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(KAKAO_START));
  });
});
