import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError, type GenerationHooks } from "@/lib/ai/provider";
import { dailyStore, resetDailyStore } from "@/lib/api/dailyStore";
import { clientCount, networkCostKrw, resetSpendState, spentTodayKrw } from "@/lib/api/spend";
import { setTestDb } from "@/lib/db";
import { mockToss } from "@/lib/pay/tossMock";
import { kstDay } from "@/lib/security/quota";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { keyedHash, signingSecret } from "@/lib/security/sign";
import { browser, buy, loginAs, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as draw } from "../tarot/draw/route";
import { POST as deepTeaser } from "./tarot-deep/teaser/route";

const T0 = Date.parse("2026-11-20T03:00:00Z");
const DEEP_INPUT = { topicId: "money", whoId: "me", whenId: "month", question: "", conditions: [], note: "" };
const TEASER = "/api/premium/tarot-deep/teaser";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  for (const [k, v] of Object.entries({
    STARLOG_AI: "mock", ANTHROPIC_API_KEY: "", STARLOG_PAYMENTS: "on", STARLOG_PREMIUM: "on", STARLOG_KAKAO: "mock", STARLOG_PAY: "mock",
    BETA_TEASER_PER_DAY: "1", BETA_DAILY_BUDGET_KRW: "1000",
  })) vi.stubEnv(k, v);
  resetMemoryLimiter();
  resetDailyStore();
  resetSpendState();
  mockToss.reset();
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const dealt = async (b: Browser) =>
  ((await (await b.send(draw, "/api/tarot/draw", { body: { templateId: "deep-tarot", picks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] } })).json()) as { drawToken: string }).drawToken;
const networkCount = async (address: string) => clientCount(await keyedHash(`client:${address}`, signingSecret()!), "teaser", Date.now());
const networkCost = async (address: string) => networkCostKrw(await keyedHash(`client:${address}`, signingSecret()!), Date.now());
async function paidBook(): Promise<number> {
  let sum = 0;
  for (let shard = 0; shard < 8; shard++) sum += Number((await dailyStore().get(`paidcost:${kstDay(Date.now())}:${shard}`)) ?? 0);
  return Math.round(sum);
}

async function buyerOf(address: string, name: string): Promise<{ b: Browser; orderId: string }> {
  const b = browser(address);
  await loginAs(b, name);
  return { b, orderId: await buy(b, "tarot-deep") };
}

describe("a buyer's premium preview (review 2026-10-16 #1)", () => {
  it("never spends or stops at the day's free previews: the reading it was bought for needs no preview", async () => {
    useTestDb();
    const buyer = browser("198.51.100.201");
    await loginAs(buyer, "buyer201");
    await buy(buyer, "tarot-deep");
    const drawToken = await dealt(buyer);
    for (let i = 0; i < 3; i++) expect((await buyer.send(deepTeaser, TEASER, { body: { drawToken, input: DEEP_INPUT } })).status).toBe(200);
    expect(await networkCount("198.51.100.201")).toBe(0);

    // Someone without a purchase still has one free preview a day.
    const visitor = browser("198.51.100.202");
    const visitorDraw = await dealt(visitor);
    expect((await visitor.send(deepTeaser, TEASER, { body: { drawToken: visitorDraw, input: DEEP_INPUT } })).status).toBe(200);
    expect((await visitor.send(deepTeaser, TEASER, { body: { drawToken: visitorDraw, input: DEEP_INPUT } })).status).toBe(429);
  });

  it("is written past the free day's spent budget, like the paid reading; a visitor's past the cap but not past its ceiling", async () => {
    useTestDb();
    const buyer = browser("198.51.100.203");
    await loginAs(buyer, "buyer203");
    await buy(buyer, "tarot-deep");
    const drawToken = await dealt(buyer);
    // At the cap (80% of 1,000) a visitor's preview still opens: the paywall shows after it.
    for (let shard = 0; shard < 8; shard++) await dailyStore().put(`cost:${kstDay(Date.now())}:${shard}`, 100, 3600);
    const early = browser("198.51.100.206");
    expect((await early.send(deepTeaser, TEASER, { body: { drawToken: await dealt(early), input: DEEP_INPUT } })).status).toBe(200);
    // Past the ceiling (twice that): free generations stop.
    for (let shard = 0; shard < 8; shard++) await dailyStore().put(`cost:${kstDay(Date.now())}:${shard}`, 1000, 3600);
    const visitor = browser("198.51.100.204");
    expect((await visitor.send(deepTeaser, TEASER, { body: { drawToken: await dealt(visitor), input: DEEP_INPUT } })).status).toBe(503);
    expect((await buyer.send(deepTeaser, TEASER, { body: { drawToken, input: DEEP_INPUT } })).status).toBe(200);
  });

  it("still opens for a buyer while premium is off (the purchase opens whatever the switch says)", async () => {
    useTestDb();
    const buyer = browser("198.51.100.205");
    await loginAs(buyer, "buyer205");
    await buy(buyer, "tarot-deep");
    vi.stubEnv("STARLOG_PREMIUM", "off");
    expect((await buyer.send(deepTeaser, TEASER, { body: { drawToken: await dealt(buyer), input: DEEP_INPUT } })).status).toBe(200);
  });
});

describe("a buyer's premium previews are bounded and paid for (review 2026-10-17 H2)", () => {
  it("stops at five a day for each product a buyer holds, and starts again the next KST day", async () => {
    useTestDb();
    const { b } = await buyerOf("198.51.100.211", "buyer211");
    const drawToken = await dealt(b);
    for (let i = 0; i < 5; i++) expect((await b.send(deepTeaser, TEASER, { body: { drawToken, input: DEEP_INPUT } })).status).toBe(200);
    const sixth = await b.send(deepTeaser, TEASER, { body: { drawToken, input: DEEP_INPUT } });
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toMatchObject({ code: "BETA_LIMIT", scope: "buyer" });
    vi.setSystemTime(Date.parse("2026-11-21T00:00:00+09:00"));
    expect((await b.send(deepTeaser, TEASER, { body: { drawToken: await dealt(b), input: DEEP_INPUT } })).status).toBe(200);
  });

  it("never passes five when the previews come at once: each one claims its place before it starts (review 2026-10-17 #6)", async () => {
    useTestDb();
    const { b } = await buyerOf("198.51.100.215", "buyer215");
    const drawToken = await dealt(b);
    // A slow store, as KV is: a count read and written back by each request would let every one of them read 0.
    const store = dailyStore();
    const get = store.get.bind(store);
    vi.spyOn(store, "get").mockImplementation(async (key: string) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return get(key);
    });
    const statuses = await Promise.all(Array.from({ length: 8 }, () => b.send(deepTeaser, TEASER, { body: { drawToken, input: DEEP_INPUT } }).then((res) => res.status)));
    expect(statuses.filter((s) => s === 200)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(3);
  });

  it("gives its place back when the model could not write it, so failures never use up the five; a refused text keeps it (review 2026-10-20 A5)", async () => {
    useTestDb();
    const { b } = await buyerOf("198.51.100.216", "buyer216");
    const drawToken = await dealt(b);
    const real = mockProvider.generate.bind(mockProvider);
    let failure: GenerationError | null = new GenerationError("UPSTREAM", ["APIError:529"]);
    vi.spyOn(mockProvider, "generate").mockImplementation(async (task, attempt, feedback, hooks?: GenerationHooks) => {
      if (failure) throw failure;
      return real(task, attempt, feedback, hooks);
    });
    const send = () => b.send(deepTeaser, TEASER, { body: { drawToken, input: DEEP_INPUT } });
    for (let i = 0; i < 3; i++) expect(await (await send()).json()).toMatchObject({ code: "UPSTREAM" });
    failure = null;
    for (let i = 0; i < 4; i++) expect((await send()).status).toBe(200);
    failure = new GenerationError("REFUSED");
    expect((await send()).status).toBe(422);
    failure = null;
    const sixth = await send();
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toMatchObject({ code: "BETA_LIMIT", scope: "buyer" });
  });

  it("is closed while the day's spend cannot be read (budget unknown), for a buyer too", async () => {
    useTestDb();
    const { b } = await buyerOf("198.51.100.212", "buyer212");
    const drawToken = await dealt(b);
    const store = dailyStore();
    const get = store.get.bind(store);
    vi.spyOn(store, "get").mockImplementation(async (key: string) => {
      if (key.startsWith("cost:")) throw new Error("kv down");
      return get(key);
    });
    const res = await b.send(deepTeaser, TEASER, { body: { drawToken, input: DEEP_INPUT } });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("books its model cost in the paid book: never the free day's total, never the network's free share", async () => {
    useTestDb();
    vi.stubEnv("KRW_PER_USD", "1400");
    const address = "198.51.100.213";
    const { b } = await buyerOf(address, "buyer213");
    const drawToken = await dealt(b);
    const real = mockProvider.generate.bind(mockProvider);
    vi.spyOn(mockProvider, "generate").mockImplementation(async (task, attempt, feedback, hooks?: GenerationHooks) => {
      hooks?.onUsage?.([{ model: "claude-opus-5-5", inputTokens: 0, outputTokens: 10_000, cacheReadTokens: 0, cacheWriteTokens: 0 }]);
      return real(task, attempt, feedback, hooks);
    });
    expect((await b.send(deepTeaser, TEASER, { body: { drawToken, input: DEEP_INPUT } })).status).toBe(200);
    expect(await paidBook()).toBe(280);
    expect(Math.round((await spentTodayKrw(Date.now())) ?? -1)).toBe(0);
    expect(await networkCost(address)).toBe(0);
  });

  it("takes the ordinary preview path on a production deploy's test keys: a test payment charged nobody", async () => {
    vi.stubEnv("STARLOG_SIGNING_SECRET", "signing-secret-for-premium-tests-0123456789");
    vi.stubEnv("STARLOG_ACCOUNT_SECRET", "account-secret-for-premium-tests-0123456789");
    const db = useTestDb();
    const { b, orderId } = await buyerOf("198.51.100.214", "buyer214");
    await db.prepare("UPDATE payments SET mode = 'test' WHERE order_id = ?").bind(orderId).run();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_PAY", "");
    vi.stubEnv("NEXT_PUBLIC_TOSS_CLIENT_KEY", "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm");
    vi.stubEnv("TOSS_SECRET_KEY", "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6");
    b.jar.set("__Host-sl_sid", b.jar.get("sl_sid")!);
    vi.stubEnv("STARLOG_PREMIUM", "off");
    expect((await b.send(deepTeaser, TEASER, { body: { drawToken: await dealt(b), input: DEEP_INPUT } })).status).toBe(409);
  });
});
