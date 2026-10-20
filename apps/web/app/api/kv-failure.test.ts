import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import type { GenerationHooks } from "@/lib/ai/provider";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { addNetworkCost, budgetState, resetSpendState, spentTodayKrw } from "@/lib/api/spend";
import { kstDay } from "@/lib/security/quota";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { keyedHash, signingSecret } from "@/lib/security/sign";
import { paidChapterOf } from "@/lib/testing/p4";
import { POST as daily } from "./tarot/daily/route";
import { POST as draw } from "./tarot/draw/route";
import { POST as followup } from "./followup/route";
import { POST as owner } from "./owner/route";
import { POST as reading } from "./tarot/reading/route";
import { POST as teaser } from "./tarot/teaser/route";
import { duringOpening } from "@/lib/testing/clock";

// These tests open the free first tarot reading (오픈 기념 무료), which ends 2026-10-31: pin the clock inside it.
duringOpening();

/**
 * A DAILY_KV binding that works, or fails every call, or fails only writes (KV's 429 on a hot key),
 * or fails reads of some keys; `bound: false` is a Worker deployed without the binding.
 */
const kv = vi.hoisted(() => {
  const data = new Map<string, string>();
  const state = { mode: "ok" as "ok" | "down" | "no-writes", unreadable: null as RegExp | null, bound: true };
  const fail = (what: string) => {
    throw new Error(`KV ${what} failed: 429 Too Many Requests`);
  };
  return {
    state,
    data,
    binding: {
      async get(key: string) {
        if (state.mode === "down" || state.unreadable?.test(key)) fail("GET");
        const value = data.get(key);
        return value === undefined ? null : JSON.parse(value);
      },
      async put(key: string, value: string) {
        if (state.mode !== "ok") fail("PUT");
        data.set(key, value);
      },
      async delete(key: string) {
        if (state.mode !== "ok") fail("DELETE");
        data.delete(key);
      },
    },
  };
});

vi.mock("@/lib/cloudflare", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cloudflare")>()),
  cloudflareEnv: () => (kv.state.bound ? { DAILY_KV: kv.binding } : {}),
}));

type Handler = (request: Request) => Promise<Response>;
const MONEY_INPUT = { topicId: "money", whoId: "me", whenId: "week", question: "", conditions: [], note: "" };

const request = (body: unknown, ip: string, accept?: string) => new Request("http://localhost/api", {
  method: "POST",
  headers: { "content-type": "application/json", "cf-connecting-ip": ip, ...(accept ? { accept } : {}) },
  body: JSON.stringify(body),
});
const call = async (handler: Handler, body: unknown, ip = "198.51.100.40") => {
  const response = await handler(request(body, ip));
  return { status: response.status, data: (await response.json()) as Record<string, any> };
};
const drawToken = async () => (await call(draw, { templateId: "self-flow", picks: [3, 30, 60] })).data.drawToken as string;

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("BETA_FULL_PER_DAY", "100");
  vi.stubEnv("STARLOG_OWNER_CODE", "owner-code-for-tests-0001");
  kv.state.mode = "ok";
  kv.state.unreadable = null;
  kv.state.bound = true;
  kv.data.clear();
  resetSpendState();
  resetMemoryLimiter();
  resetDailyStore();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {}); // the limiter bindings are absent here
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("DAILY_KV failures", () => {
  it("block new full readings and teasers while the spend total cannot be read (fail closed), and log it", async () => {
    const token = await drawToken();
    kv.state.mode = "down";
    const blockedTeaser = await call(teaser, { drawToken: token, input: MONEY_INPUT });
    expect(blockedTeaser.status).toBe(503);
    expect(blockedTeaser.data.code).toBe("AI_UNAVAILABLE");
    expect((await call(reading, { drawToken: token, input: MONEY_INPUT })).status).toBe(503);
    expect(errors.mock.calls.some((args: unknown[]) => String(args[0]).includes('"evt":"spend.kv_error"'))).toBe(true);
    kv.state.mode = "ok";
    expect((await call(teaser, { drawToken: token, input: MONEY_INPUT })).status).toBe(200);
  });

  it("never fail a reading when only writes fail (429): it is generated and returned", async () => {
    const token = await drawToken();
    kv.state.mode = "no-writes";
    expect((await call(teaser, { drawToken: token, input: MONEY_INPUT })).status).toBe(200);
    expect((await call(reading, { drawToken: token, input: MONEY_INPUT })).status).toBe(200);
    const fortune = await call(daily, {}, "198.51.100.41");
    expect(fortune.status).toBe(200);
    expect(fortune.data.card).toBeDefined();
  });

  it("never fail a generation already under way when KV goes down mid-stream", async () => {
    const token = await drawToken();
    const real = mockProvider.generate.bind(mockProvider);
    vi.spyOn(mockProvider, "generate").mockImplementation(async (task, attempt, feedback, hooks?: GenerationHooks) => {
      hooks?.onReserve?.([{ model: "claude-opus-5-5", inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 }]);
      kv.state.mode = "down";
      const result = await real(task, attempt, feedback, hooks);
      hooks?.onUsage?.([{ model: "claude-opus-5-5", inputTokens: 500, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 }]);
      return result;
    });
    const response = await teaser(request({ drawToken: token, input: MONEY_INPUT }, "198.51.100.42", "application/x-ndjson"));
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string });
    expect(events.at(-1)!.type).toBe("done");
  });

  it("close the daily card and follow-ups too while KV cannot be read, except for the owner", async () => {
    const token = await drawToken();
    const full = await call(reading, { drawToken: token, input: MONEY_INPUT }, "198.51.100.43");
    kv.state.mode = "down";
    expect((await call(daily, {}, "198.51.100.43")).status).toBe(503);
    const chapterToken = await paidChapterOf(full.data.chapterToken, full.data.reading);
    const answer = await call(followup, { chapterToken, reading: full.data.reading, question: "지출은 어떻게 줄일까요?" }, "198.51.100.43");
    expect(answer.status).toBe(503); // without the chapter count an older token could reset the cap

    kv.state.mode = "ok";
    const login = await owner(new Request("http://localhost/api", {
      method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.44", origin: "http://localhost" }, body: JSON.stringify({ code: "owner-code-for-tests-0001" }),
    }));
    const cookie = login.headers.getSetCookie()[0]!.split(";")[0]!;
    kv.state.mode = "down";
    const asOwner = (handler: Handler, body: unknown) => handler(new Request("http://localhost/api", {
      method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.44", cookie }, body: JSON.stringify(body),
    }));
    expect((await asOwner(daily, {})).status).toBe(200);
    // Nor a teaser, a reading or its follow-up: the owner pass is never closed by a total that cannot be read.
    expect((await asOwner(teaser, { drawToken: token, input: MONEY_INPUT })).status).toBe(200);
    const ownerReading = await asOwner(reading, { drawToken: token, input: MONEY_INPUT, unlock: { method: "owner" } });
    expect(ownerReading.status).toBe(200);
    const opened = (await ownerReading.json()) as { reading: unknown; chapterToken: string };
    expect((await asOwner(followup, { chapterToken: opened.chapterToken, reading: opened.reading, question: "지출은 어떻게 줄일까요?" })).status).toBe(200);
  });

  it("make the budget lagging after repeated failed cost writes, even while reads work: free full readings close, teasers go on", async () => {
    const real = mockProvider.generate.bind(mockProvider);
    vi.spyOn(mockProvider, "generate").mockImplementation(async (task, attempt, feedback, hooks?: GenerationHooks) => {
      hooks?.onUsage?.([{ model: "claude-opus-5-5", inputTokens: 0, outputTokens: 1_000, cacheReadTokens: 0, cacheWriteTokens: 0 }]);
      return real(task, attempt, feedback, hooks);
    });
    const token = await drawToken();
    kv.state.mode = "no-writes";
    for (let i = 0; i < 3; i++) expect((await call(teaser, { drawToken: token, input: MONEY_INPUT }, "198.51.100.45")).status).toBe(200);
    expect(await budgetState(Date.now())).toBe("lagging");
    expect((await call(teaser, { drawToken: token, input: MONEY_INPUT }, "198.51.100.45")).status).toBe(200);
    const full = await call(reading, { drawToken: token, input: MONEY_INPUT }, "198.51.100.45");
    expect(full.status).toBe(503);
    expect(full.data).toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("scale a partly readable total up to all shards", async () => {
    const day = kstDay(Date.now());
    for (let i = 0; i < 8; i++) kv.data.set(`cost:${day}:${i}`, JSON.stringify(100));
    expect(await spentTodayKrw(Date.now())).toBe(800);
    kv.state.unreadable = /^cost:.*:[0-3]$/;
    expect(await spentTodayKrw(Date.now())).toBe(800); // 400 from four shards, scaled ×8/4
  });

  it("let a network through when only its own cost total cannot be read, while the day's budget still fails closed", async () => {
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "10000");
    const token = await drawToken();
    const ip = "198.51.100.47";
    await addNetworkCost(await keyedHash(`client:${ip}`, signingSecret()!), 5_000, Date.now());
    expect((await call(reading, { drawToken: token, input: MONEY_INPUT }, ip)).status).toBe(429);
    kv.state.unreadable = /^netcost:/;
    expect((await call(reading, { drawToken: token, input: MONEY_INPUT }, ip)).status).toBe(200);
    kv.state.mode = "down";
    expect((await call(teaser, { drawToken: token, input: MONEY_INPUT }, ip)).status).toBe(503);
  });

  it("with no day cap (BETA_DAILY_BUDGET_KRW=off), still close while KV cannot be read: the per-network counts would read 0 (H-2)", async () => {
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "off");
    const token = await drawToken();
    expect(await budgetState(Date.now())).toBe("ok");
    kv.state.mode = "down";
    expect(await budgetState(Date.now())).toBe("unknown");
    expect((await call(teaser, { drawToken: token, input: MONEY_INPUT }, "198.51.100.48")).status).toBe(503);
    expect((await call(daily, {}, "198.51.100.48")).status).toBe(503);
    kv.state.mode = "ok";
    expect((await call(teaser, { drawToken: token, input: MONEY_INPUT }, "198.51.100.48")).status).toBe(200);
    // Still no day cap: a large day total closes nothing.
    await addNetworkCost("someone-else", 10_000_000, Date.now());
    for (let i = 0; i < 8; i++) kv.data.set(`cost:${kstDay(Date.now())}:${i}`, JSON.stringify(1_000_000));
    expect(await budgetState(Date.now())).toBe("ok");
  });

  it("with no day cap, still treat a Worker without the DAILY_KV binding as unknown (closed) (H-2)", async () => {
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "off");
    kv.state.bound = false;
    expect(await budgetState(Date.now())).toBe("unknown");
  });

  it("treat a Worker without the DAILY_KV binding as unknown (closed)", async () => {
    kv.state.bound = false;
    expect(await budgetState(Date.now())).toBe("unknown");
    const token = await drawToken();
    expect((await call(teaser, { drawToken: token, input: MONEY_INPUT }, "198.51.100.46")).status).toBe(503);
  });
});
