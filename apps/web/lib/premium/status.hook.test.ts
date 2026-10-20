// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetPremiumStatusForTests, usePremiumStatus } from "./status";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
});

describe("usePremiumStatus (audit B B02)", () => {
  it("asks again on the next screen after a failed request, so one failure does not hide the premium entries for the rest of the tab", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ code: "UPSTREAM" }, { status: 500 }));
    vi.stubGlobal("fetch", fetchImpl);
    const first = renderHook(() => usePremiumStatus());
    await waitFor(() => expect(first.result.current).toBeNull());
    first.unmount();

    fetchImpl.mockImplementation(async () => Response.json({ products: [] }));
    const next = renderHook(() => usePremiumStatus());
    await waitFor(() => expect(next.result.current).not.toBeNull());
    expect(next.result.current).toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not ask again once it has an answer", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ products: [] }));
    vi.stubGlobal("fetch", fetchImpl);
    const first = renderHook(() => usePremiumStatus());
    await waitFor(() => expect(first.result.current).toBeTruthy());
    renderHook(() => usePremiumStatus());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
