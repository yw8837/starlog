import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dailyStore, resetDailyStore } from "@/lib/api/dailyStore";
import { clientCount, resetSpendState } from "@/lib/api/spend";
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

  it("is written past the free day's spent budget, like the paid reading; a visitor's is not", async () => {
    useTestDb();
    const buyer = browser("198.51.100.203");
    await loginAs(buyer, "buyer203");
    await buy(buyer, "tarot-deep");
    const drawToken = await dealt(buyer);
    // The day's estimated spend at the budget: free generations stop.
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
