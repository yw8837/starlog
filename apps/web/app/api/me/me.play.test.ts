import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDb } from "@/lib/db";
import { mockToss } from "@/lib/pay/tossMock";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb } from "@/lib/testing/p4";

const T0 = Date.parse("2026-11-11T03:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  resetMemoryLimiter();
  mockToss.reset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/me: purchases made with Google Play (the Starlog app)", () => {
  it("marks an unopened purchase paid on Google Play with provider play (its refund is asked of Google); a Toss one stays as it was", async () => {
    const db = useTestDb();
    const b = browser();
    await loginAs(b, "alice");
    const toss = await buy(b, "tarot");
    const play = await buy(b, "saju");
    // W1 records a Play payment in `payments` with mode 'play' (migration 0024).
    await db.prepare("UPDATE payments SET mode = 'play', receipt_url = NULL WHERE order_id = ?").bind(play).run();
    const unused = (await me(b)).user!.unused as Array<Record<string, unknown>>;
    expect(unused.find((item) => item.orderId === toss)).not.toHaveProperty("provider");
    expect(unused.find((item) => item.orderId === play)).toMatchObject({ orderId: play, productId: "saju", provider: "play" });
  });
});
