import { describe, expect, it, vi } from "vitest";
import { parseApiError, type ApiResult } from "@/lib/reading/api";
import { PREMIUM_RESUME_KEY, isPremiumStep, pendingResume, premiumApiPath, runPremiumReading } from "./client";

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map };
}

const INPUT = { birth: { year: 1990 } };
const done = (extra: Record<string, unknown> = {}) => ({ ok: true as const, data: { status: "done", reading: { title: "t" }, chapterToken: "c", ...extra } });
const step = (resume: string, n: number, of: number) => ({ ok: true as const, data: { status: "continue", resume, done: n, of } });

describe("premium reading loop", () => {
  it("chains part requests with the resume token, reports each part, and clears the token when done", async () => {
    const storage = memoryStorage();
    const calls: unknown[] = [];
    const post = vi.fn(async (path: string, body: unknown): Promise<ApiResult<unknown>> => {
      expect(path).toBe("/api/premium/newyear-2027/reading");
      calls.push(body);
      return calls.length < 3 ? step(`r${calls.length}`, calls.length, 3) : done({ readingId: "x" });
    });
    const parts: number[] = [];
    const result = await runPremiumReading("newyear-2027", INPUT, { method: "paid", of: 3, storage, post, onProgress: (e) => parts.push(e.part) });
    expect(result).toMatchObject({ ok: true, data: { status: "done", readingId: "x" } });
    expect(calls).toEqual([
      { ...INPUT, unlock: { method: "paid" } },
      { ...INPUT, unlock: { method: "paid" }, resume: "r1" },
      { ...INPUT, unlock: { method: "paid" }, resume: "r2" },
    ]);
    expect([...new Set(parts)]).toEqual([0, 1, 2]);
    expect(storage.map.has(PREMIUM_RESUME_KEY("newyear-2027"))).toBe(false);
  });

  it("keeps the last token after a failure and resumes from the next part", async () => {
    const storage = memoryStorage();
    const failing = vi.fn().mockResolvedValueOnce(step("r1", 1, 2)).mockResolvedValueOnce({ ok: false, error: { code: "UPSTREAM", status: 502 } });
    expect((await runPremiumReading("tarot-deep", INPUT, { method: "paid", of: 2, storage, post: failing })).ok).toBe(false);
    expect(pendingResume("tarot-deep", INPUT, storage)).toEqual({ done: 1 });
    const retry = vi.fn().mockResolvedValueOnce(done());
    await runPremiumReading("tarot-deep", INPUT, { method: "paid", of: 2, storage, post: retry });
    expect(retry.mock.calls[0]![1]).toMatchObject({ resume: "r1" });
    expect(pendingResume("tarot-deep", INPUT, storage)).toBeNull();
  });

  it("drops a resume token the server no longer accepts and starts over once", async () => {
    const storage = memoryStorage();
    storage.setItem(PREMIUM_RESUME_KEY("match"), JSON.stringify({ input: JSON.stringify(INPUT), resume: "old", done: 1 }));
    const post = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: { code: "BAD_TOKEN", status: 400, token: "resume" } })
      .mockResolvedValueOnce(step("r1", 1, 2))
      .mockResolvedValueOnce(done());
    expect((await runPremiumReading("match", INPUT, { method: "paid", of: 2, storage, post })).ok).toBe(true);
    expect(post.mock.calls[0]![1]).toMatchObject({ resume: "old" });
    expect(post.mock.calls[1]![1]).not.toHaveProperty("resume");
  });

  it("hands back a dead draw (deal again) and anything else without retrying", async () => {
    const storage = memoryStorage();
    const draw = vi.fn().mockResolvedValueOnce({ ok: false, error: { code: "BAD_TOKEN", status: 400, token: "draw" } });
    expect(await runPremiumReading("tarot-deep", INPUT, { method: "paid", of: 2, storage, post: draw })).toMatchObject({ ok: false, error: { token: "draw" } });
    expect(draw).toHaveBeenCalledTimes(1);
    const opened = vi.fn().mockResolvedValueOnce({ ok: false, error: { code: "NOT_AVAILABLE", status: 409, reason: "opened", readingId: "abcdefghij0123456789" } });
    expect(await runPremiumReading("tarot-deep", INPUT, { method: "owner", of: 2, storage, post: opened })).toMatchObject({ ok: false, error: { reason: "opened" } });
    expect(opened.mock.calls[0]![1]).toMatchObject({ unlock: { method: "owner" } });
  });

  it("ignores a stored token for another input, or one it cannot read", () => {
    const storage = memoryStorage();
    storage.setItem(PREMIUM_RESUME_KEY("match"), JSON.stringify({ input: JSON.stringify({ other: 1 }), resume: "x", done: 1 }));
    expect(pendingResume("match", INPUT, storage)).toBeNull();
    storage.setItem(PREMIUM_RESUME_KEY("match"), "{not json");
    expect(pendingResume("match", INPUT, storage)).toBeNull();
    expect(pendingResume("match", INPUT, null)).toBeNull();
  });

  it("knows the routes, the step shapes, and the server's premium error fields", () => {
    expect(premiumApiPath("tarot-deep", "teaser")).toBe("/api/premium/tarot-deep/teaser");
    expect(isPremiumStep({ status: "continue", resume: "r", done: 1, of: 2 })).toBe(true);
    expect(isPremiumStep({ status: "done", reading: {}, chapterToken: "c" })).toBe(true);
    expect(isPremiumStep({ status: "done", reading: null, chapterToken: "c" })).toBe(false);
    expect(isPremiumStep({ status: "continue", done: 1 })).toBe(false);
    expect(parseApiError(400, { code: "BAD_TOKEN", token: "resume" }).token).toBe("resume");
    expect(parseApiError(409, { code: "NOT_AVAILABLE", reason: "opened", readingId: "abcdefghij0123456789" })).toMatchObject({ reason: "opened", readingId: "abcdefghij0123456789" });
    expect(parseApiError(409, { code: "NOT_AVAILABLE", reason: "opening", reservedUntil: 123 }).reservedUntil).toBe(123);
  });
});
