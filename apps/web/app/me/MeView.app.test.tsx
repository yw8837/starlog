// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { resetBridgeForTests } from "@/lib/app/bridge";
import { resetShellForTests, setPrivacyOptionsRequired } from "@/lib/app/shell";
import { MeView } from "./MeView";

/** 내 정보 in the Starlog app: 광고 개인정보 설정 (the AdMob consent choices) when the shell says they are required. */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function fakeShell() {
  const sent: string[] = [];
  const native = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (raw: string) => {
      const { id, type } = JSON.parse(raw) as { id: string; type: string };
      sent.push(type);
      queueMicrotask(() => native.onmessage?.({ data: JSON.stringify({ id, ok: true }) }));
    },
  };
  Object.defineProperty(window, "StarlogNative", { configurable: true, value: native });
  return sent;
}

beforeEach(() => {
  resetBridgeForTests();
  resetShellForTests();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ payments: true, login: true, owner: false, user: null })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as { StarlogNative?: unknown }).StarlogNative;
  resetAccountForTests();
  resetBridgeForTests();
  resetShellForTests();
});

describe("MeView 광고 개인정보 설정", () => {
  it("is offered in the menu, to visitors too, when the app says the privacy options are required, and opens them", async () => {
    const sent = fakeShell();
    setPrivacyOptionsRequired(true);
    render(<MeView status={null} />);
    const button = await screen.findByRole("button", { name: "광고 개인정보 설정" });
    expect(button.closest("li")!.className).toMatch(/(^|\s)app-only(\s|$)/);
    expect(button.closest("nav")!.getAttribute("aria-label")).toBe("계정 메뉴");
    await act(async () => fireEvent.click(button));
    expect(sent).toEqual(["privacyOptions"]);
  });

  it("is not there when they are not required (or the app has not said)", () => {
    fakeShell();
    render(<MeView status={null} />);
    expect(screen.queryByRole("button", { name: "광고 개인정보 설정" })).toBeNull();
    act(() => setPrivacyOptionsRequired(true));
    expect(screen.getByRole("button", { name: "광고 개인정보 설정" })).toBeTruthy();
    act(() => setPrivacyOptionsRequired(false));
    expect(screen.queryByRole("button", { name: "광고 개인정보 설정" })).toBeNull();
  });
});
