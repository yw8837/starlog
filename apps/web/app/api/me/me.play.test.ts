import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { reserveUnlock } from "@/lib/pay/ledger";
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

describe("GET /api/me: a Google Play set with one reading opened (review L21)", () => {
  const SET_ON_SALE = Date.parse("2026-12-01T12:00:00+09:00");
  const userIdOf = async (db: D1Binding) => (await db.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>())!.id;

  /** Buys the 2027 set (paid with Play when `play`), and opens its 궁합 when `openMatch`; returns the unused items. */
  async function setUnused(play: boolean, openMatch: boolean) {
    vi.setSystemTime(SET_ON_SALE);
    vi.stubEnv("STARLOG_PREMIUM", "on");
    const db = useTestDb();
    const b = browser();
    await loginAs(b, "alice");
    const orderId = await buy(b, "set-2027");
    if (openMatch) {
      const opening = await reserveUnlock(db, { userId: await userIdOf(db), productId: "match", currency: "paid", now: SET_ON_SALE, payMode: "mock", earmarked: true });
      if (!opening.ok) throw new Error("not reserved");
      await db.prepare("UPDATE unlocks SET status = 'delivered' WHERE id = ?").bind(opening.unlockId).run();
    }
    if (play) await db.prepare("UPDATE payments SET mode = 'play', receipt_url = NULL WHERE order_id = ?").bind(orderId).run();
    return { orderId, unused: (await me(b)).user!.unused as Array<Record<string, unknown>> };
  }

  it("says its part is refunded through 문의: refundable false with noRefund play-part (Google refunds a Play order whole only)", async () => {
    const { orderId, unused } = await setUnused(true, true);
    expect(unused).toEqual([{ orderId, productId: "newyear-2027", refundable: false, noRefund: "play-part", set: true, provider: "play" }]);
  });

  it("keeps an unopened Play set refundable whole, and a web (Toss) set's part refundable as before", async () => {
    const whole = await setUnused(true, false);
    expect(whole.unused).toHaveLength(2);
    for (const item of whole.unused) expect(item).toMatchObject({ orderId: whole.orderId, refundAmount: 18900, set: true, provider: "play" });
    for (const item of whole.unused) expect(item).not.toHaveProperty("noRefund");
    const toss = await setUnused(false, true);
    expect(toss.unused).toEqual([{ orderId: toss.orderId, productId: "newyear-2027", refundUntil: expect.any(String), refundAmount: 11000, set: true }]);
  });
});
