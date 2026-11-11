import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount } from "@/lib/account/deletion";
import { setTestDb } from "@/lib/db";
import { reserveUnlock } from "@/lib/pay/ledger";
import { payKeyMode } from "@/lib/pay/mode";
import { PlayError, mockPlay } from "@/lib/pay/play";
import { PLAY_ORPHAN_MESSAGE, reconcilePlayRefunds } from "@/lib/pay/playOrders";
import { mockToss } from "@/lib/pay/tossMock";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser, type Handler } from "@/lib/testing/p4";
import { GET as checkout } from "./checkout/route";
import { GET as ordersGet, POST as ordersPost } from "./orders/route";
import { POST as verify } from "./play/verify/route";
import { POST as refund } from "./refund/route";

const T0 = Date.parse("2026-10-01T03:00:00Z");
const MIN = 60_000;
const APP_UA = "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 StarlogApp/1.0.0";
const hex = (text: string) => createHash("sha256").update(text).digest("hex");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  vi.stubEnv("STARLOG_PLAY", "mock");
  resetMemoryLimiter();
  mockToss.reset();
  mockPlay.reset();
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

/** A request from the Android app's WebView: its user agent, the browser's cookies, our own Origin. */
function fromApp(b: Browser, handler: Handler, url: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { "cf-connecting-ip": "203.0.113.9", "user-agent": APP_UA, origin: "http://localhost" };
  if (b.jar.size) headers.cookie = [...b.jar].map(([name, value]) => `${name}=${value}`).join("; ");
  if (body !== undefined) headers["content-type"] = "application/json";
  return handler(new Request(new URL(url, "http://localhost"), { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}

type AppOrder = { orderId: string; amount: number; play: { productId: string; accountTag: string } };

/** The app's order, then the purchase Google holds for it (what Play Billing does with the order's `play`). */
async function appPurchase(b: Browser, productId = "tarot", token = `token-${Math.random().toString(36).slice(2)}`): Promise<AppOrder & { token: string }> {
  const res = await fromApp(b, ordersPost, "/api/pay/orders", { productId, returnTo: "/tarot/result", ack: true });
  expect(res.status).toBe(200);
  const order = (await res.json()) as AppOrder;
  mockPlay.addPurchase({ token, playProductId: order.play.productId, accountTag: order.play.accountTag, profileId: order.orderId });
  return { ...order, token };
}

const verifyAs = (b: Browser, body: unknown) => b.send(verify, "/api/pay/play/verify", { body, origin: true });
const userIdOf = async (db: ReturnType<typeof useTestDb>) => (await db.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>())!.id;

describe("checkout and orders from the app", () => {
  it("gives the app's checkout Google Play instead of Toss, and the web's exactly what it gave before", async () => {
    useTestDb();
    const b = await loggedIn();
    const app = await fromApp(b, checkout, "/api/pay/checkout?product=tarot");
    expect(app.status).toBe(200);
    const body = (await app.json()) as Record<string, unknown>;
    expect(body).toEqual({ productId: "tarot", name: "타로 전체 풀이", amount: 2900, customerKey: expect.stringMatching(/^c_/), provider: "play", clientKey: null, playProductId: "tarot" });
    expect(await (await b.send(checkout, "/api/pay/checkout?product=tarot")).json()).toEqual({ productId: "tarot", name: "타로 전체 풀이", amount: 2900, customerKey: body.customerKey, provider: "mock", clientKey: null });
  });

  it("needs this deploy's Play client in the app, and Toss outside it, each on its own", async () => {
    useTestDb();
    const b = await loggedIn();
    vi.stubEnv("STARLOG_PLAY", "");
    expect((await fromApp(b, checkout, "/api/pay/checkout?product=tarot")).status).toBe(503);
    expect((await fromApp(b, ordersPost, "/api/pay/orders", { productId: "tarot", ack: true })).status).toBe(503);
    expect((await b.send(checkout, "/api/pay/checkout?product=tarot")).status).toBe(200);
    vi.stubEnv("STARLOG_PLAY", "mock");
    vi.stubEnv("STARLOG_PAY", "");
    expect((await fromApp(b, checkout, "/api/pay/checkout?product=tarot")).status).toBe(200);
    expect((await fromApp(b, ordersPost, "/api/pay/orders", { productId: "tarot", ack: true })).status).toBe(200);
    expect((await b.send(checkout, "/api/pay/checkout?product=tarot")).status).toBe(503);
  });

  it("tells the app the Play product and the buyer's account tag with the order; the web's order is unchanged", async () => {
    vi.setSystemTime(Date.parse("2026-10-20T12:00:00+09:00"));
    vi.stubEnv("STARLOG_PREMIUM", "on");
    const db = useTestDb();
    const b = await loggedIn();
    const res = await fromApp(b, ordersPost, "/api/pay/orders", { productId: "tarot-deep", returnTo: "/premium/deep-tarot/result", ack: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ amount: 7900, play: { productId: "tarot_deep", accountTag: hex(await userIdOf(db)) } });
    expect(body.orderId).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const web = await (await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true }, origin: true })).json();
    expect(web).not.toHaveProperty("play");
  });
});

describe("POST /api/pay/play/verify", () => {
  it("grants the reading once and answers like the Toss confirm, also to a browser without the session", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId, token } = await appPurchase(b);
    const res = await verifyAs(b, { purchaseToken: token, productId: "tarot" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "paid", orderId, productId: "tarot", returnTo: "/tarot/result", signedIn: true });
    expect(await (await verifyAs(browser("192.0.2.70"), { purchaseToken: token, productId: "tarot" })).json()).toEqual({ status: "paid", orderId, productId: "tarot", returnTo: "/tarot/result", signedIn: false });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM credit_lots WHERE order_id = ?").bind(orderId).first()).toEqual({ n: 1 });
    expect((await me(b)).user?.unused).toMatchObject([{ orderId, productId: "tarot" }]);
    // It opens under this deploy's keys (mock here), as under any.
    expect((await reserveUnlock(db, { userId: await userIdOf(db), productId: "tarot", currency: "paid", now: Date.now(), payMode: payKeyMode() })).ok).toBe(true);
  });

  it("is not gated by STARLOG_PAYMENTS: a purchase that went through must always be recorded", async () => {
    useTestDb();
    const b = await loggedIn();
    const { token } = await appPurchase(b);
    vi.stubEnv("STARLOG_PAYMENTS", "off");
    expect((await verifyAs(b, { purchaseToken: token, productId: "tarot" })).status).toBe(200);
  });

  it("refuses a malformed body, another site, and a deploy without Play; answers pending and a deleted account's purchase", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { token } = await appPurchase(b);
    for (const body of [{ purchaseToken: "", productId: "tarot" }, { purchaseToken: "x".repeat(2001), productId: "tarot" }, { purchaseToken: token, productId: "tarot-deep" }, { purchaseToken: token }]) {
      expect((await verifyAs(b, body)).status, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    expect((await b.send(verify, "/api/pay/play/verify", { body: { purchaseToken: token, productId: "tarot" } })).status).toBe(403);
    vi.stubEnv("STARLOG_PLAY", "");
    expect((await verifyAs(b, { purchaseToken: token, productId: "tarot" })).status).toBe(503);
    vi.stubEnv("STARLOG_PLAY", "mock");
    expect(await (await verifyAs(b, { purchaseToken: "t_unknown", productId: "tarot" })).json()).toMatchObject({ code: "PAY_PENDING" });
    await db.prepare("UPDATE users SET deleted_at = ?").bind(T0).run();
    const orphan = await verifyAs(browser("192.0.2.71"), { purchaseToken: token, productId: "tarot" });
    expect(orphan.status).toBe(402);
    expect(await orphan.json()).toMatchObject({ code: "PAY_FAILED", message: PLAY_ORPHAN_MESSAGE });
  });
});

describe("a Google Play order on the web's payment routes", () => {
  it("refunds an unopened Play purchase through Google within the 7 days, once, and never asks Toss", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId, token } = await appPurchase(b);
    await verifyAs(b, { purchaseToken: token, productId: "tarot" });
    const cancel = vi.spyOn(mockToss, "cancel");
    const asked = vi.spyOn(mockPlay, "refund");
    const res = await b.send(refund, "/api/pay/refund", { body: { orderId, amount: 2900 }, origin: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "refunded", amount: 2900 });
    expect(asked).toHaveBeenCalledTimes(1);
    expect(await db.prepare("SELECT o.status AS o, l.status AS l, pp.voided_at AS voided FROM orders o JOIN credit_lots l ON l.order_id = o.id JOIN play_purchases pp ON pp.order_id = o.id WHERE o.id = ?").bind(orderId).first()).toEqual({ o: "refunded", l: "refunded", voided: T0 });
    expect(await (await b.send(refund, "/api/pay/refund", { body: { orderId }, origin: true })).json()).toMatchObject({ code: "NOT_REFUNDABLE" });
    expect(asked).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("keeps the 7-day window and the amount check for a Play purchase, and needs this deploy's Play client", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId, token } = await appPurchase(b);
    await verifyAs(b, { purchaseToken: token, productId: "tarot" });
    const asked = vi.spyOn(mockPlay, "refund");
    expect(await (await b.send(refund, "/api/pay/refund", { body: { orderId, amount: 1000 }, origin: true })).json()).toMatchObject({ code: "REFUND_AMOUNT_CHANGED" });
    vi.stubEnv("STARLOG_PLAY", "");
    expect((await b.send(refund, "/api/pay/refund", { body: { orderId }, origin: true })).status).toBe(503);
    vi.stubEnv("STARLOG_PLAY", "mock");
    vi.setSystemTime(Date.parse("2026-10-08T15:00:00Z")); // 10-09 00:00 KST: past 10-08's end
    expect(await (await b.send(refund, "/api/pay/refund", { body: { orderId }, origin: true })).json()).toMatchObject({ code: "REFUND_WINDOW_CLOSED" });
    expect(asked).not.toHaveBeenCalled();
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "paid" });
  });

  it("says which way each order was paid in 결제 내역, keeping every field", async () => {
    useTestDb();
    const b = await loggedIn();
    const tossOrder = await buy(b);
    vi.setSystemTime(T0 + MIN);
    const { orderId, token } = await appPurchase(b);
    await verifyAs(b, { purchaseToken: token, productId: "tarot" });
    const { orders } = (await (await b.send(ordersGet, "/api/pay/orders")).json()) as { orders: Array<Record<string, unknown>> };
    expect(orders).toEqual([
      { orderId, productId: "tarot", amount: 2900, status: "paid", createdAt: T0 + MIN, receiptUrl: null, method: "Google Play", refundable: true, opened: false, openedProducts: [], refunded: 0, unfinished: false, provider: "play" },
      { orderId: tossOrder, productId: "tarot", amount: 2900, status: "paid", createdAt: T0, receiptUrl: null, method: "카드", refundable: true, opened: false, openedProducts: [], refunded: 0, unfinished: false, provider: "toss" },
    ]);
  });

  it("never sends a Play order to Toss when an order's status or 결제 내역 is read", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId, token } = await appPurchase(b);
    await verifyAs(b, { purchaseToken: token, productId: "tarot" });
    // A Play order mid-refund (applyVoidedPlay locks, then applies): Toss must never be asked about it.
    await db.prepare("UPDATE orders SET status = 'refunding', updated_at = ? WHERE id = ?").bind(T0, orderId).run();
    const asked = [vi.spyOn(mockToss, "getPayment"), vi.spyOn(mockToss, "getPaymentByOrder"), vi.spyOn(mockToss, "cancel"), vi.spyOn(mockToss, "confirm")];
    vi.setSystemTime(T0 + 11 * MIN);
    expect(await (await b.send(ordersGet, `/api/pay/orders?id=${orderId}`)).json()).toMatchObject({ status: "refunding" });
    expect((await b.send(ordersGet, "/api/pay/orders")).status).toBe(200);
    for (const spy of asked) expect(spy).not.toHaveBeenCalled();
  });

});

describe("deleting an account that holds an unopened Play purchase", () => {
  const orderAndLot = (db: ReturnType<typeof useTestDb>, orderId: string) =>
    db.prepare("SELECT o.status AS o, l.status AS l FROM orders o JOIN credit_lots l ON l.order_id = o.id WHERE o.id = ?").bind(orderId).first();
  const deleted = async (db: ReturnType<typeof useTestDb>) => (await db.prepare("SELECT deleted_at IS NOT NULL AS gone FROM users").first<{ gone: number }>())!.gone === 1;

  async function playBuyer() {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId, token } = await appPurchase(b);
    await verifyAs(b, { purchaseToken: token, productId: "tarot" });
    return { db, orderId, userId: await userIdOf(db) };
  }

  it("refunds it through Google and deletes the account (this deploy's Play client by default)", async () => {
    const { db, orderId, userId } = await playBuyer();
    const cancel = vi.spyOn(mockToss, "cancel");
    expect(await deleteAccount(db, mockToss, { userId, now: T0 + MIN })).toEqual({ ok: true, refunded: 1 });
    expect(await orderAndLot(db, orderId)).toEqual({ o: "refunded", l: "refunded" });
    expect(await deleted(db)).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("deletes a Play-only account on a deploy without Toss keys", async () => {
    const { db, orderId, userId } = await playBuyer();
    expect(await deleteAccount(db, null, { userId, now: T0 + MIN }, mockPlay)).toEqual({ ok: true, refunded: 1 });
    expect(await orderAndLot(db, orderId)).toEqual({ o: "refunded", l: "refunded" });
    expect(await deleted(db)).toBe(true);
  });

  it("sets it aside for the operator and still deletes when Google refuses, or Play is not configured", async () => {
    const refused = await playBuyer();
    vi.spyOn(mockPlay, "refund").mockRejectedValueOnce(new PlayError(400, "FAILED_PRECONDITION"));
    expect(await deleteAccount(refused.db, mockToss, { userId: refused.userId, now: T0 + MIN })).toEqual({ ok: true, refunded: 0 });
    expect(await orderAndLot(refused.db, refused.orderId)).toEqual({ o: "paid", l: "revoked" });
    expect(await deleted(refused.db)).toBe(true);
    setTestDb(null);
    const unconfigured = await playBuyer();
    expect(await deleteAccount(unconfigured.db, null, { userId: unconfigured.userId, now: T0 + MIN }, null)).toEqual({ ok: true, refunded: 0 });
    expect(await orderAndLot(unconfigured.db, unconfigured.orderId)).toEqual({ o: "paid", l: "revoked" });
    expect(await deleted(unconfigured.db)).toBe(true);
    expect(vi.mocked(console.warn).mock.calls.map(([line]: unknown[]) => String(line))).toContain(JSON.stringify({ evt: "account.delete_play_set_aside", orderId: unconfigured.orderId }));
  });

  it("waits while Google's answer to the refund is unknown, and deletes once the cron settled it", async () => {
    const { db, orderId, userId } = await playBuyer();
    vi.spyOn(mockPlay, "refund").mockRejectedValueOnce(new PlayError(503, "UNAVAILABLE"));
    expect(await deleteAccount(db, mockToss, { userId, now: T0 + MIN })).toEqual({ ok: false, code: "PENDING" });
    expect(await deleted(db)).toBe(false);
    // Asked again before it settled: still in flight, never deleted with the refund unknown.
    expect(await deleteAccount(db, mockToss, { userId, now: T0 + 2 * MIN })).toEqual({ ok: false, code: "PENDING" });
    expect(await deleted(db)).toBe(false);
    // Google never refunded it (still purchased): the cron puts the reading back, and the next try refunds it.
    expect(await reconcilePlayRefunds(db, mockPlay, T0 + 12 * MIN, 5)).toBe(1);
    expect(await deleteAccount(db, mockToss, { userId, now: T0 + 13 * MIN })).toEqual({ ok: true, refunded: 1 });
    expect(await orderAndLot(db, orderId)).toEqual({ o: "refunded", l: "refunded" });
  });
});
