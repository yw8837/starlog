import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError, type GenerationHooks } from "@/lib/ai/provider";
import { kstDay } from "@/lib/security/quota";
import { dailyStore, resetDailyStore } from "./dailyStore";
import type { Gate } from "./http";
import { SpendLedger, addPaidCost, budgetState, clientCount, resetSpendState, spentTodayKrw } from "./spend";
import { NDJSON, respondGeneration, type GenerationOutcome, type Settlement } from "./stream";

/** Priced at 2,800원 with KRW_PER_USD=1400 (Opus 5.5: 100k output tokens = $2). */
const EXPENSIVE = [{ model: "claude-opus-5-5", inputTokens: 0, outputTokens: 100_000, cacheReadTokens: 0, cacheWriteTokens: 0 }];
const HALF = [{ ...EXPENSIVE[0]!, outputTokens: 50_000 }];
const READING_ID = "abcdefghij0123456789";
const BODY = { reading: { verdict: "v" }, chapterToken: "t" };

const gate = (): Gate => ({ secret: "s".repeat(40), provider: mockProvider, owner: false, now: Date.now(), cookies: {}, client: "client-hash" }) as unknown as Gate;

/** A generation that is billed EXPENSIVE through the hooks, as the provider does, then succeeds or fails. */
const billed = (fail = false) => async (hooks: GenerationHooks): Promise<GenerationOutcome> => {
  hooks.onReserve?.(EXPENSIVE);
  hooks.onUsage?.(EXPENSIVE);
  if (fail) throw new GenerationError("UPSTREAM");
  return { body: BODY, cookies: [] };
};

async function paidBook(): Promise<number> {
  let sum = 0;
  for (let shard = 0; shard < 8; shard++) sum += Number((await dailyStore().get(`paidcost:${kstDay(Date.now())}:${shard}`)) ?? 0);
  return Math.round(sum);
}
const freeBook = async () => Math.round((await spentTodayKrw(Date.now())) ?? -1);

function settlement(calls: string[], deliver: () => Promise<Record<string, unknown>> = async () => ({ readingId: READING_ID }), recovered: Record<string, unknown> | null = null): Settlement {
  return {
    deliver: async () => {
      calls.push("deliver");
      return deliver();
    },
    recover: async () => {
      calls.push("recover");
      return recovered;
    },
    release: async () => {
      calls.push("release");
    },
  };
}

const post = (stream = false, signal?: AbortSignal) =>
  new Request("http://localhost/api/tarot/reading", { method: "POST", headers: stream ? { accept: NDJSON } : {}, signal });
const events = async (response: Response) => (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
const failedSave = async (): Promise<Record<string, unknown>> => {
  throw new Error("D1 answer lost");
};

beforeEach(() => {
  vi.stubEnv("KRW_PER_USD", "1400");
  resetDailyStore();
  resetSpendState();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cost books", () => {
  it("SpendLedger writes to the sink it is given", async () => {
    const writes: number[] = [];
    const ledger = new SpendLedger(() => Date.now(), async (krw) => {
      writes.push(Math.round(krw));
    });
    ledger.reserve(EXPENSIVE);
    ledger.bill(HALF);
    await ledger.finish();
    expect(writes).toEqual([2800, -1400]);
  });

  it("keeps the paid book out of the free-tier total and the budget", async () => {
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "1000");
    await addPaidCost(5000, Date.now());
    expect(await paidBook()).toBe(5000);
    expect(await freeBook()).toBe(0);
    expect(await budgetState(Date.now())).toBe("ok");
  });
});

describe("settlement inside the generation's keepAlive work", () => {
  it("JSON: saves before answering, adds the reading id, and books a paid opening on the paid book only", async () => {
    const calls: string[] = [];
    const res = await respondGeneration(post(), billed(), { gate: gate(), paidCost: true, settle: settlement(calls) });
    expect(await res.json()).toEqual({ ...BODY, readingId: READING_ID });
    expect(calls).toEqual(["deliver"]);
    expect(await paidBook()).toBe(2800);
    expect(await freeBook()).toBe(0);
    expect(await clientCount("client-hash", "full", Date.now())).toBe(0);
  });

  it("JSON: a 별조각 opening books the free total and is charged to the network before it starts", async () => {
    const calls: string[] = [];
    const res = await respondGeneration(post(), billed(), { gate: gate(), spend: "full", settle: settlement(calls) });
    expect(res.status).toBe(200);
    expect(await freeBook()).toBe(2800);
    expect(await paidBook()).toBe(0);
    expect(await clientCount("client-hash", "full", Date.now())).toBe(1);
  });

  it("JSON: releases after a failed generation, and after a save that did not land", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls: string[] = [];
    expect((await respondGeneration(post(), billed(true), { gate: gate(), settle: settlement(calls) })).status).toBe(502);
    expect(calls).toEqual(["release"]);
    const again: string[] = [];
    const res = await respondGeneration(post(), billed(), { gate: gate(), settle: settlement(again, failedSave, null) });
    expect(res.status).toBe(502);
    expect(again).toEqual(["deliver", "recover", "release"]);
  });

  it("JSON: a save whose answer was lost is recovered, not released", async () => {
    const calls: string[] = [];
    const res = await respondGeneration(post(), billed(), { gate: gate(), settle: settlement(calls, failedSave, { readingId: READING_ID }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...BODY, readingId: READING_ID });
    expect(calls).toEqual(["deliver", "recover"]);
  });

  it("NDJSON: done carries the saved id, so the save came first; paid cost stays off the free book", async () => {
    const calls: string[] = [];
    const list = await events(await respondGeneration(post(true), billed(), { gate: gate(), paidCost: true, settle: settlement(calls) }));
    expect(list.at(-1)).toEqual({ type: "done", data: { ...BODY, readingId: READING_ID } });
    expect(calls).toEqual(["deliver"]);
    await vi.waitFor(async () => expect(await paidBook()).toBe(2800));
    expect(await freeBook()).toBe(0);
  });

  it("NDJSON: an error event comes after the release", async () => {
    const calls: string[] = [];
    const list = await events(await respondGeneration(post(true), billed(true), { gate: gate(), settle: settlement(calls) }));
    expect(list.at(-1)).toMatchObject({ type: "error", status: 502 });
    expect(calls).toEqual(["release"]);
  });

  it("NDJSON: a client that leaves mid-generation gets its credit back", async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    const waiting = async (hooks: GenerationHooks): Promise<GenerationOutcome> =>
      new Promise((_, reject) => hooks.signal?.addEventListener("abort", () => reject(new GenerationError("UPSTREAM", ["aborted"]))));
    const res = await respondGeneration(post(true, controller.signal), waiting, { gate: gate(), settle: settlement(calls) });
    controller.abort();
    await res.text().catch(() => "");
    await vi.waitFor(() => expect(calls).toEqual(["release"]));
  });

  it("leaves 오픈 기념 responses exactly as before", async () => {
    const res = await respondGeneration(post(), billed(), { gate: gate(), spend: "full" });
    expect(await res.json()).toEqual(BODY);
  });
});
