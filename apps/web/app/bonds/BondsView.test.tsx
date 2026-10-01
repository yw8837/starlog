// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BondsView } from "./BondsView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BondsView loading (Q-06)", () => {
  it("holds the page's final shape while this device's 별자리 loads", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const { container } = render(<BondsView initialSign={null} />);
    const skeleton = container.querySelector("[data-skeleton]");
    expect(skeleton?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("heading", { level: 1, name: "별자리 인연" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("별자리를 불러오는 중이에요");
  });

  it("replaces it with the start form once the device turns out to be new", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, owner: null }))));
    const { container } = render(<BondsView initialSign={null} />);
    expect(await screen.findByRole("button", { name: "별자리 인연 시작하기" })).toBeTruthy();
    expect(container.querySelector("[data-skeleton]")).toBeNull();
  });
});
