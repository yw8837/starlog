import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDb } from "@/lib/db";
import { mockToss } from "@/lib/pay/tossMock";
import { TossError } from "@/lib/pay/tossTypes";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { GET as checkout } from "./checkout/route";
import { POST as confirm } from "./confirm/route";
import { GET as ordersGet, POST as ordersPost } from "./orders/route";

const T0 = Date.parse("2026-10-01T03:00:00Z");

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

const order = (b: Browser, body: Record<string, unknown>) => b.send(ordersPost, "/api/pay/orders", { body, origin: true });
const newOrder = async (b: Browser) => ((await (await order(b, { productId: "tarot", returnTo: "/tarot/result", ack: true })).json()) as { orderId: string }).orderId;
const confirmAs = (b: Browser, orderId: string, paymentKey: string, amount = 2900) => b.send(confirm, "/api/pay/confirm", { body: { paymentKey, orderId, amount }, origin: true });
const statusOf = async (b: Browser, orderId: string) => (await (await b.send(ordersGet, `/api/pay/orders?id=${orderId}`)).json()) as Record<string, unknown>;

describe("checkout and orders", () => {
  it("gives the checkout page the server's price and the buyer's customer key", async () => {
    useTestDb();
    const b = await loggedIn();
    const res = await b.send(checkout, "/api/pay/checkout?product=tarot");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ productId: "tarot", name: "타로 전체 풀이", amount: 2900, provider: "mock", clientKey: null });
    expect(body.customerKey).toMatch(/^c_[A-Za-z0-9_-]{24}$/);
  });

  it("prices an order from the catalog, never from the request, and only after the 청약철회 notice", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    expect((await order(b, { productId: "tarot", returnTo: "/tarot/result" })).status).toBe(400);
    const res = await order(b, { productId: "tarot", returnTo: "/tarot/result", ack: true, amount: 1 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orderId: string; amount: number; orderName: string; successUrl: string; failUrl: string };
    expect(body).toMatchObject({ amount: 2900, orderName: "스타로그 타로 전체 풀이", successUrl: "http://localhost/pay/success", failUrl: "http://localhost/pay/fail" });
    expect(body.orderId).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(await db.prepare("SELECT amount_krw, status, withdrawal_ack_at, cancel_attempt FROM orders WHERE id = ?").bind(body.orderId).first()).toEqual({ amount_krw: 2900, status: "created", withdrawal_ack_at: T0, cancel_attempt: 1 });
  });

  it("refuses premium readings before P5, unknown products, guests, closed sales and other sites", async () => {
    useTestDb();
    const b = await loggedIn();
    expect((await order(b, { productId: "match", ack: true })).status).toBe(409);
    expect((await order(b, { productId: "moon-30", ack: true })).status).toBe(409);
    expect((await order(browser("192.0.2.1"), { productId: "tarot", ack: true })).status).toBe(401);
    expect((await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true } })).status).toBe(403);
    vi.stubEnv("STARLOG_PAYMENTS", "paused");
    expect((await order(b, { productId: "tarot", ack: true })).status).toBe(409);
  });
});

describe("confirm", () => {
  it("confirms once and grants exactly one unopened reading, however often it is called", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
    const again = await confirmAs(b, orderId, "mock_again");
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ status: "paid", signedIn: true });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM credit_lots WHERE currency = 'paid'").first()).toEqual({ n: 1 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'grant' AND order_id = ?").bind(orderId).first()).toEqual({ n: 1 });
    expect(await db.prepare("SELECT status, mode, total_amount FROM payments WHERE order_id = ?").bind(orderId).first()).toEqual({ status: "DONE", mode: "mock", total_amount: 2900 });
  });

  it("confirms from a browser without the session (an in-app browser handing over), for the order's own account", async () => {
    useTestDb();
    const alice = await loggedIn();
    const orderId = await newOrder(alice);
    const elsewhere = browser("192.0.2.77");
    const res = await confirmAs(elsewhere, orderId, "mock_handover");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "paid", orderId, productId: "tarot", returnTo: "/tarot/result", signedIn: false });
    expect(await statusOf(elsewhere, orderId)).toEqual({ orderId, productId: "tarot", status: "paid", returnTo: "/tarot/result", signedIn: false });
    expect((await me(alice)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
    expect((await elsewhere.send(confirm, "/api/pay/confirm", { body: { paymentKey: "x", orderId, amount: 2900 } })).status).toBe(403);
  });

  it("refuses an amount that is not the order's, and never asks Toss", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await newOrder(b);
    const spy = vi.spyOn(mockToss, "confirm");
    expect((await confirmAs(b, orderId, "mock_x", 100)).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    expect(await db.prepare("SELECT status, fail_code FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "failed", fail_code: "AMOUNT_MISMATCH" });
  });

  it("looks a declined payment up before failing it, then shows Toss's message", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await newOrder(b);
    const lookUp = vi.spyOn(mockToss, "getPaymentByOrder");
    const res = await confirmAs(b, orderId, "mock_fail_1");
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "PAY_FAILED", message: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." });
    expect(lookUp).toHaveBeenCalledWith(orderId);
    expect(await db.prepare("SELECT status, fail_code FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "failed", fail_code: "REJECT_CARD_PAYMENT" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM credit_lots WHERE currency = 'paid'").first()).toEqual({ n: 0 });
  });

  it("keeps a 5xx answer pending, then settles it from Toss and grants once", async () => {
    useTestDb();
    const b = await loggedIn();
    const orderId = await newOrder(b);
    mockToss.failNext("confirm", new TossError(500, "FAILED_INTERNAL_SYSTEM_PROCESSING", ""), { applied: true });
    const lost = await confirmAs(b, orderId, "mock_lost");
    expect(lost.status).toBe(409);
    expect(await lost.json()).toMatchObject({ code: "PAY_PENDING" });
    expect(await statusOf(b, orderId)).toMatchObject({ status: "confirming" });
    vi.setSystemTime(T0 + 31_000);
    expect(await statusOf(b, orderId)).toEqual({ orderId, productId: "tarot", status: "paid", returnTo: "/tarot/result", signedIn: true });
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
  });

  it("never reads 409 processing as a refusal: the order waits until Toss's window has surely closed", async () => {
    useTestDb();
    const b = await loggedIn();
    const orderId = await newOrder(b);
    mockToss.failNext("confirm", new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", "이전 요청이 처리 중입니다."));
    expect((await confirmAs(b, orderId, "mock_busy")).status).toBe(409);
    vi.setSystemTime(T0 + 31_000);
    expect(await statusOf(b, orderId)).toMatchObject({ status: "confirming" });
    vi.setSystemTime(T0 + 15 * 60_000 + 1);
    expect(await statusOf(b, orderId)).toMatchObject({ status: "failed" });
  });

  it("never grants a payment that arrives for a deleted account", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await newOrder(b);
    await db.prepare("UPDATE users SET deleted_at = ?").bind(T0).run();
    const res = await confirmAs(browser("192.0.2.78"), orderId, "mock_orphan");
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "PAY_FAILED", message: expect.stringContaining("탈퇴") });
    expect(await db.prepare("SELECT status, fail_code FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "refunding", fail_code: "ACCOUNT_DELETED" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM credit_lots WHERE currency = 'paid'").first()).toEqual({ n: 0 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM payments").first()).toEqual({ n: 1 });
  });

  it("lists the buyer's paid orders with what can still be refunded", async () => {
    useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    const { orders } = (await (await b.send(ordersGet, "/api/pay/orders")).json()) as { orders: Array<Record<string, unknown>> };
    expect(orders).toEqual([{ orderId, productId: "tarot", amount: 2900, status: "paid", createdAt: T0, receiptUrl: null, method: "카드", refundable: true, opened: false }]);
    expect((await browser("192.0.2.79").send(ordersGet, "/api/pay/orders")).status).toBe(401);
  });
});
