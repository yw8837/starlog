import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyReading } from "@/lib/ai/schemas";
import { dailyStore, getOrCreateDailyResult, readDailyResult, resetDailyStore } from "./dailyStore";

const CONTEXT = Symbol.for("__cloudflare-context__");

const reading = (cardId: string): DailyReading => ({
  card: { cardId, orientation: "upright", keyword: "k" },
  summary: "s", body: "b", areas: { love: "l", money: "m", work: "w" }, lucky: { color: "노란색", number: 7 }, tip: "t",
});

/** A KV stand-in that records calls. */
function fakeKv() {
  const data = new Map<string, string>();
  const puts: Array<{ key: string; ttl?: number }> = [];
  return {
    data, puts,
    async get(key: string) {
      const raw = data.get(key);
      return raw === undefined ? null : JSON.parse(raw);
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      puts.push({ key, ttl: options?.expirationTtl });
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  };
}

function withBindings(env: Record<string, unknown>) {
  (globalThis as Record<symbol, unknown>)[CONTEXT] = { env, cf: undefined, ctx: {} };
}

beforeEach(() => {
  resetDailyStore();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CONTEXT];
  vi.restoreAllMocks();
});

describe("daily store", () => {
  it("uses an in-memory store when the KV binding is absent", async () => {
    expect(dailyStore().kind).toBe("memory");
    const created = await getOrCreateDailyResult("dev-1", "2026-09-30", async () => reading("major-17-star"));
    expect(created.generated).toBe(true);
    expect(await readDailyResult("dev-1", "2026-09-30")).toEqual(reading("major-17-star"));
    expect(await readDailyResult("dev-1", "2026-10-01")).toBeNull();
  });

  it("stores in KV under daily:<device>:<day> for 36 hours when the binding exists", async () => {
    const kv = fakeKv();
    withBindings({ DAILY_KV: kv });
    expect(dailyStore().kind).toBe("kv");
    await getOrCreateDailyResult("dev-2", "2026-09-30", async () => reading("wands-01"));
    expect(kv.puts).toContainEqual({ key: "daily:dev-2:2026-09-30", ttl: 36 * 3600 });
    expect(kv.puts).toContainEqual({ key: "daily-pending:dev-2:2026-09-30", ttl: 60 });
    expect(kv.data.has("daily-pending:dev-2:2026-09-30")).toBe(false); // marker cleared
    expect(await readDailyResult("dev-2", "2026-09-30")).toEqual(reading("wands-01"));
  });

  it("warns once when running on Workers without the binding, then uses memory", async () => {
    withBindings({});
    expect(dailyStore().kind).toBe("memory");
    dailyStore();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("runs one generation for concurrent misses in the same isolate", async () => {
    const create = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return reading("cups-02");
    });
    const [a, b] = await Promise.all([
      getOrCreateDailyResult("dev-3", "2026-09-30", create),
      getOrCreateDailyResult("dev-3", "2026-09-30", create),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect([a.generated, b.generated].sort()).toEqual([false, true]);
    expect(b.reading).toEqual(a.reading);
  });

  it("waits for another isolate's pending generation instead of generating again", async () => {
    const kv = fakeKv();
    withBindings({ DAILY_KV: kv });
    kv.data.set("daily-pending:dev-4:2026-09-30", "1");
    setTimeout(() => kv.data.set("daily:dev-4:2026-09-30", JSON.stringify(reading("swords-03"))), 15);
    const create = vi.fn(async () => reading("pentacles-01"));
    const result = await getOrCreateDailyResult("dev-4", "2026-09-30", create, { polls: 5, pollMs: 10 });
    expect(create).not.toHaveBeenCalled();
    expect(result).toEqual({ reading: reading("swords-03"), generated: false });
  });

  it("generates itself when the pending generation never lands", async () => {
    const kv = fakeKv();
    withBindings({ DAILY_KV: kv });
    kv.data.set("daily-pending:dev-5:2026-09-30", "1");
    const result = await getOrCreateDailyResult("dev-5", "2026-09-30", async () => reading("cups-10"), { polls: 2, pollMs: 5 });
    expect(result.generated).toBe(true);
  });
});
