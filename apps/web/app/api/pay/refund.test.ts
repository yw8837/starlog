import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDb } from "@/lib/db";
import { releaseUnlock, reserveUnlock } from "@/lib/pay/ledger";
import { mockToss } from "@/lib/pay/tossMock";
import { TossError } from "@/lib/pay/tossTypes";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as confirm } from "./confirm/route";
import { GET as ordersGet, POST as ordersPost } from "./orders/route";
import { POST as refund } from "./refund/route";
import { POST as webhook } from "./webhook/route";

const T0 = Date.parse("2026-10-01T03:00:00Z");
const MIN = 60_000;

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

async function loggedIn(name = "alice"): Promise<Browser> {
  const b = browser();
  await loginAs(b, name);
  return b;
}

type Db = ReturnType<typeof useTestDb>;
const refundOf = (b: Browser, orderId: string) => b.send(refund, "/api/pay/refund", { body: { orderId }, origin: true });
const hook = (body: unknown) => browser("203.0.113.200").send(webhook, "/api/pay/webhook", { body });
const statusOf = async (b: Browser, orderId: string) => ((await (await b.send(ordersGet, `/api/pay/orders?id=${orderId}`)).json()) as { status: string }).status;
const orderRow = (db: Db, orderId: string) => db.prepare("SELECT status, cancel_attempt FROM orders WHERE id = ?").bind(orderId).first();
const paymentKeyOf = async (db: Db, orderId: string) =>
  (await db.prepare("SELECT payment_key FROM orders WHERE id = ?").bind(orderId).first<{ payment_key: string }>())!.payment_key;
const userIdOf = async (db: Db) => (await db.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>())!.id;

describe("refunds", () => {
  it("refunds an unopened reading in full, once, under the order's first cancel key", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const cancel = vi.spyOn(mockToss, "cancel");
    const res = await refundOf(b, orderId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "refunded" });
    expect(cancel.mock.calls[0]![1]).toMatchObject({ idempotencyKey: `cancel-${orderId}-1` });
    expect((await mockToss.getPaymentByOrder(orderId)).status).toBe("CANCELED");
    expect((await me(b)).user?.unused).toEqual([]);
    expect(await db.prepare("SELECT o.status AS o, p.status AS p, l.status AS l FROM orders o JOIN payments p ON p.order_id = o.id JOIN credit_lots l ON l.order_id = o.id").first()).toEqual({ o: "refunded", p: "CANCELED", l: "refunded" });
    expect((await refundOf(b, orderId)).status).toBe(409);
  });

  it("will not refund a reading that was opened or is being opened", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const reserved = await reserveUnlock(db, { userId: await userIdOf(db), productId: "tarot", currency: "paid", units: 10, now: T0 });
    if (!reserved.ok) throw new Error("not reserved");
    expect((await refundOf(b, orderId)).status).toBe(409);
    expect(await orderRow(db, orderId)).toEqual({ status: "paid", cancel_attempt: 1 });
    expect((await mockToss.getPaymentByOrder(orderId)).status).toBe("DONE");
    // 내 정보 shows it as being opened, not as a purchase that can be refunded.
    expect((await me(b)).user).toMatchObject({ unused: [], opening: [{ productId: "tarot", currency: "paid", orderId }] });
  });

  it("puts the reading back when Toss refuses, after looking the payment up, and uses a new key next time", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    mockToss.failNext("cancel", new TossError(403, "NOT_CANCELABLE_PAYMENT", "취소 할 수 없는 결제 입니다."));
    const lookUp = vi.spyOn(mockToss, "getPayment");
    const res = await refundOf(b, orderId);
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "PAY_FAILED", message: "취소 할 수 없는 결제 입니다." });
    expect(lookUp).toHaveBeenCalled();
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
    expect(await orderRow(db, orderId)).toEqual({ status: "paid", cancel_attempt: 2 });
    // The first key would replay the refusal for 15 days; the next refund sends cancel-<id>-2.
    expect((await refundOf(b, orderId)).status).toBe(200);
  });

  it("never reads 409 processing as a refusal, and never reverts on time alone", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    mockToss.failNext("cancel", new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", "이전 요청이 처리 중입니다."));
    const res = await refundOf(b, orderId);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "PAY_PENDING" });
    vi.setSystemTime(T0 + 61_000);
    expect(await statusOf(b, orderId)).toBe("refunding");
    expect((await me(b)).user?.unused).toEqual([]);
    // Ten minutes on, Toss still shows the payment DONE: only now does the reading come back.
    vi.setSystemTime(T0 + 10 * MIN + 1);
    expect(await statusOf(b, orderId)).toBe("paid");
    expect(await orderRow(db, orderId)).toEqual({ status: "paid", cancel_attempt: 2 });
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
  });

  it("applies a cancel whose answer was lost once Toss shows it cancelled", async () => {
    useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    mockToss.failNext("cancel", new TossError(0, "NETWORK", "no response from Toss"), { applied: true });
    expect((await refundOf(b, orderId)).status).toBe(409);
    vi.setSystemTime(T0 + 10 * MIN + 1);
    expect(await statusOf(b, orderId)).toBe("refunded");
    expect((await me(b)).user?.unused).toEqual([]);
  });

  it("refunds only the buyer's own orders", async () => {
    useTestDb();
    const alice = await loggedIn("alice");
    const orderId = await buy(alice);
    const bob = await loggedIn("bob");
    expect((await refundOf(bob, orderId)).status).toBe(409);
  });

  it("cancels at once a payment that arrives for a deleted account", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId } = (await (await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true }, origin: true })).json()) as { orderId: string };
    await db.prepare("UPDATE users SET deleted_at = ?").bind(T0).run();
    const res = await browser("192.0.2.80").send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_orphan", orderId, amount: 2900 }, origin: true });
    expect(res.status).toBe(402);
    expect(await db.prepare("SELECT status, fail_code FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "refunded", fail_code: "ACCOUNT_DELETED" });
    expect((await mockToss.getPaymentByOrder(orderId)).status).toBe("CANCELED");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM credit_lots WHERE currency = 'paid'").first()).toEqual({ n: 0 });
  });
});

describe("webhook", () => {
  it("re-queries Toss and settles a payment whose confirm answer never arrived", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId, amount } = (await (await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true }, origin: true })).json()) as { orderId: string; amount: number };
    await mockToss.confirm({ paymentKey: "mock_webhook", orderId, amount });
    const res = await hook({ eventType: "PAYMENT_STATUS_CHANGED", createdAt: "2026-10-01T12:00:00.000000", data: { paymentKey: "mock_webhook", orderId, status: "DONE" } });
    expect(res.status).toBe(200);
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "paid" });
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
  });

  it("applies a dashboard cancellation of an unopened reading", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const paymentKey = await paymentKeyOf(db, orderId);
    await mockToss.cancel(paymentKey, { reason: "관리자 취소", idempotencyKey: "admin" });
    expect((await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey, orderId, status: "CANCELED" } })).status).toBe(200);
    expect(await db.prepare("SELECT o.status AS o, l.status AS l FROM orders o JOIN credit_lots l ON l.order_id = o.id").first()).toEqual({ o: "refunded", l: "refunded" });
    expect((await me(b)).user?.unused).toEqual([]);
  });

  it("revokes a reading opened while its payment was cancelled: a later release brings nothing back", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const reserved = await reserveUnlock(db, { userId: await userIdOf(db), productId: "tarot", currency: "paid", units: 10, now: T0 });
    if (!reserved.ok) throw new Error("not reserved");
    const paymentKey = await paymentKeyOf(db, orderId);
    await mockToss.cancel(paymentKey, { reason: "관리자 취소", idempotencyKey: "admin" });
    expect((await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey, orderId, status: "CANCELED" } })).status).toBe(200);
    expect(await releaseUnlock(db, { unlockId: reserved.unlockId, now: T0 + 1 })).toBe(true);
    expect(await db.prepare("SELECT o.status AS o, l.status AS l, l.units_left AS left FROM orders o JOIN credit_lots l ON l.order_id = o.id").first()).toEqual({ o: "refunded", l: "revoked", left: 0 });
    expect((await me(b)).user?.unused).toEqual([]);
  });

  it("lets the webhook and the buyer's own refund both apply one cancellation: one refund row, no error", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const paymentKey = await paymentKeyOf(db, orderId);
    const realCancel = mockToss.cancel;
    vi.spyOn(mockToss, "cancel").mockImplementationOnce(async (key, input) => {
      const payment = await realCancel(key, input);
      // Toss's webhook lands before our own answer is applied.
      expect((await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey, orderId, status: "CANCELED" } })).status).toBe(200);
      return payment;
    });
    const res = await refundOf(b, orderId);
    expect(res.status).toBe(200);
    expect(await db.prepare("SELECT o.status AS o, l.status AS l FROM orders o JOIN credit_lots l ON l.order_id = o.id").first()).toEqual({ o: "refunded", l: "refunded" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'refund' AND order_id = ?").bind(orderId).first()).toEqual({ n: 1 });
  });

  it("books the refund when the webhook read the order just before the buyer's refund locked it", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const paymentKey = await paymentKeyOf(db, orderId);
    await mockToss.cancel(paymentKey, { reason: "관리자 취소", idempotencyKey: "admin" });
    const realGet = mockToss.getPayment;
    vi.spyOn(mockToss, "getPayment").mockImplementationOnce(async (key) => {
      // The webhook has read the order as paid; now the buyer's refund locks it and its cancel answer is lost.
      mockToss.failNext("cancel", new TossError(0, "NETWORK", "no response from Toss"));
      expect((await refundOf(b, orderId)).status).toBe(409);
      return realGet(key);
    });
    expect((await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey, orderId, status: "CANCELED" } })).status).toBe(200);
    expect(await db.prepare("SELECT o.status AS o, l.status AS l FROM orders o JOIN credit_lots l ON l.order_id = o.id").first()).toEqual({ o: "refunded", l: "refunded" });
    expect(await db.prepare("SELECT kind, units FROM ledger WHERE kind = 'refund' AND order_id = ?").bind(orderId).all()).toMatchObject({ results: [{ kind: "refund", units: 10 }] });
    expect((await me(b)).user).toMatchObject({ unused: [], opening: [] });
  });

  it("records a partial cancellation for the operator and leaves the reading alone", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const paymentKey = await paymentKeyOf(db, orderId);
    const done = await mockToss.getPayment(paymentKey);
    vi.spyOn(mockToss, "getPayment").mockResolvedValueOnce({ ...done, status: "PARTIAL_CANCELED", balanceAmount: 900 });
    expect((await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey, orderId, status: "PARTIAL_CANCELED" } })).status).toBe(200);
    expect(await db.prepare("SELECT status, canceled_amount FROM payments WHERE order_id = ?").bind(orderId).first()).toEqual({ status: "PARTIAL_CANCELED", canceled_amount: 2000 });
    expect(await orderRow(db, orderId)).toEqual({ status: "paid", cancel_attempt: 1 });
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("pay.partial_cancel"));
  });

  it("believes Toss, not the body: a forged DONE for an unknown payment changes nothing and asks Toss to retry", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId } = (await (await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true }, origin: true })).json()) as { orderId: string };
    const res = await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: "forged", orderId, status: "DONE" } });
    expect(res.status).not.toBe(200);
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "created" });
  });

  it("acknowledges other events and unknown orders", async () => {
    useTestDb();
    expect((await hook({ eventType: "DEPOSIT_CALLBACK", data: { paymentKey: "x", orderId: "y" } })).status).toBe(200);
    expect((await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: "x", orderId: "nobodys-order" } })).status).toBe(200);
  });
});
