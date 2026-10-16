// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { TarotEntry } from "./HomeEntries";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
});

const entry = () => screen.getByRole("link", { name: /타로 보기/ });
const answer = (visible: boolean) => vi.fn(async () => Response.json({ products: [{ id: "tarot-deep", open: visible, visible, opensAt: null }] }));

describe("the home's 타로 보기", () => {
  it("goes straight to the question builder while premium is off, as today", async () => {
    const fetchMock = answer(false);
    vi.stubGlobal("fetch", fetchMock);
    render(<TarotEntry />);
    expect(entry().getAttribute("href")).toBe("/tarot/new?new=1");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(entry().getAttribute("href")).toBe("/tarot/new?new=1");
  });

  it("stays on the builder when the status cannot be read", async () => {
    const fetchMock = vi.fn(async () => Promise.reject(new TypeError("offline")));
    vi.stubGlobal("fetch", fetchMock);
    render(<TarotEntry />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(entry().getAttribute("href")).toBe("/tarot/new?new=1");
  });

  it("goes to the 다리 화면 where premium is visible", async () => {
    vi.stubGlobal("fetch", answer(true));
    render(<TarotEntry />);
    await waitFor(() => expect(entry().getAttribute("href")).toBe("/tarot/start"));
  });
});
