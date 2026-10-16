// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TarotStartPage, { metadata } from "./page";

const gate = vi.hoisted(() => ({ visible: false }));
vi.mock("@/lib/premium/pageGate", () => ({ premiumVisibleHere: async () => gate.visible }));
const redirect = vi.hoisted(() => vi.fn((href: string) => {
  throw new Error(`NEXT_REDIRECT ${href}`);
}));
vi.mock("next/navigation", () => ({ redirect, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/tarot/start" }));

afterEach(() => {
  cleanup();
  redirect.mockClear();
});

describe("/tarot/start, the 다리 화면 (owner 2026-10-16)", () => {
  it("does not exist while premium is not visible here: straight on to today's question builder", async () => {
    gate.visible = false;
    await expect(TarotStartPage()).rejects.toThrow("NEXT_REDIRECT /tarot/new?new=1");
    expect(redirect).toHaveBeenCalledWith("/tarot/new?new=1");
  });

  it("offers 일반 타로 (the gold one, today's 3-card flow) and 켈틱 크로스 10장 with its price, both into the same builder", async () => {
    gate.visible = true;
    const { container } = render(await TarotStartPage());
    expect(screen.getByRole("heading", { level: 1, name: "어떤 타로를 볼까요?" })).toBeTruthy();
    const links = within(screen.getByRole("list", { name: "타로 고르기" })).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/tarot/new?new=1", "/tarot/new?new=1&spread=deep"]);
    expect(links[0]!.textContent).toContain("일반 타로");
    expect(links[0]!.textContent).toContain("카드 3장");
    expect(links[1]!.textContent).toContain("켈틱 크로스 10장");
    expect(links[1]!.textContent).toContain("7,900원");
    // One gold choice on the screen: the free flow stays the main one.
    expect(container.querySelectorAll("[data-primary]")).toHaveLength(1);
    expect(links[0]!.hasAttribute("data-primary")).toBe(true);
    expect(container.textContent).not.toMatch(/베타/);
    expect(metadata.robots).toMatchObject({ index: false });
  });
});
