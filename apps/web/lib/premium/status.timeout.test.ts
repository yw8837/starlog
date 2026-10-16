import { afterEach, describe, expect, it, vi } from "vitest";
import { STATUS_TIMEOUT_MS, refreshPremiumStatus, resetPremiumStatusForTests } from "./status";

afterEach(() => {
  vi.useRealTimers();
  resetPremiumStatusForTests();
});

describe("the premium status request (review 2026-10-16 #9)", () => {
  it("gives up after STATUS_TIMEOUT_MS: an unanswered request reads as could not be read, never loading forever", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    ) as unknown as typeof fetch;
    const answer = refreshPremiumStatus(fetchImpl);
    expect(STATUS_TIMEOUT_MS).toBe(8_000);
    await vi.advanceTimersByTimeAsync(STATUS_TIMEOUT_MS);
    expect(signal?.aborted).toBe(true);
    await expect(answer).resolves.toBeNull();
  });

  it("clears its timer when the answer comes in time", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => Response.json({ products: [] })) as unknown as typeof fetch;
    await expect(refreshPremiumStatus(fetchImpl)).resolves.not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
