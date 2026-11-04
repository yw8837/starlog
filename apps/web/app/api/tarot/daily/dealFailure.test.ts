import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { resetSpendState } from "@/lib/api/spend";
import { setTestDb } from "@/lib/db";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, loginAs, useTestDb } from "@/lib/testing/p4";
import { POST as dailyPost } from "./route";

/** dailyDeal fails on demand; the rest of drawToken is the real one. */
const deal = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/security/drawToken", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/security/drawToken")>();
  return { ...real, dailyDeal: (...args: Parameters<typeof real.dailyDeal>) => (deal.fail ? Promise.reject(new Error("deal failed")) : real.dailyDeal(...args)) };
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-11-20T12:00:00+09:00"));
  for (const [k, v] of Object.entries({ STARLOG_AI: "mock", ANTHROPIC_API_KEY: "", STARLOG_PAYMENTS: "on", STARLOG_KAKAO: "mock", STARLOG_PAY: "mock" })) vi.stubEnv(k, v);
  resetMemoryLimiter();
  resetDailyStore();
  resetSpendState();
  deal.fail = false;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("오늘의 한 장 when its card cannot be dealt (code review 2026-11-05)", () => {
  it("spends none of the account's regenerations: the card and its context come before the place", async () => {
    const db = useTestDb();
    const b = browser("198.51.100.77");
    await loginAs(b, "kim");
    deal.fail = true;
    await expect(b.send(dailyPost, "/api/tarot/daily", { body: { pick: 1 } })).rejects.toThrow("deal failed");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM account_day_counts").first()).toEqual({ n: 0 });
    deal.fail = false;
    expect((await b.send(dailyPost, "/api/tarot/daily", { body: { pick: 1 } })).status).toBe(200);
    expect(await db.prepare("SELECT n FROM account_day_counts WHERE kind = 'daily'").first()).toEqual({ n: 1 });
  });
});
