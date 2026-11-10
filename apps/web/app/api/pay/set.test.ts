import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDb } from "@/lib/db";
import { deliverUnlock, reserveUnlock } from "@/lib/pay/ledger";
import { mockToss } from "@/lib/pay/tossMock";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { GET as status } from "../premium/status/route";
import { GET as checkout } from "./checkout/route";
import { POST as confirm } from "./confirm/route";
import { POST as ordersPost } from "./orders/route";
import { POST as refund } from "./refund/route";
import { POST as webhook } from "./webhook/route";

/** The set's first moment on sale (owner 2026-11-10): 오픈 기념 무료 ends then. */
const OPENS = Date.parse("2026-12-01T00:00:00+09:00");
const SET = "set-2027";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OPENS + 12 * 3_600_000);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_PREMIUM", "on");
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

const order = (b: Browser) => b.send(ordersPost, "/api/pay/orders", { body: { productId: SET, returnTo: "/premium/newyear-2027/new", ack: true }, origin: true });
const confirmAs = (b: Browser, orderId: string, paymentKey: string, amount: number) => b.send(confirm, "/api/pay/confirm", { body: { paymentKey, orderId, amount }, origin: true });
const lotsOf = async (db: ReturnType<typeof useTestDb>, orderId: string) =>
  (await db.prepare("SELECT product_id, status, units_left FROM credit_lots WHERE order_id = ? ORDER BY product_id").bind(orderId).all()).results;
const setOpen = async () => ((await (await status(new Request("http://localhost/api/premium/status"))).json()) as { set?: { open: boolean; opensAt: number } }).set;

async function boughtSet(db: ReturnType<typeof useTestDb>, b: Browser): Promise<string> {
  const { orderId } = (await (await order(b)).json()) as { orderId: string };
  expect((await confirmAs(b, orderId, `mock_${orderId}`, 18900)).status).toBe(200);
  expect(await lotsOf(db, orderId)).toHaveLength(2);
  return orderId;
}

describe("2027 신년운세 + 프리미엄 궁합 set (owner 2026-11-10)", () => {
  it("is sold by the server from 2026-12-01 00:00 KST only, while premium is on, and until 2027 신년운세 closes", async () => {
    useTestDb();
    const b = await loggedIn();
    vi.setSystemTime(OPENS - 1);
    expect((await order(b)).status).toBe(409);
    expect((await b.send(checkout, `/api/pay/checkout?product=${SET}`)).status).toBe(409);
    expect(await setOpen()).toEqual({ open: false, opensAt: OPENS });
    vi.setSystemTime(OPENS);
    expect(await setOpen()).toEqual({ open: true, opensAt: OPENS });
    expect(await (await b.send(checkout, `/api/pay/checkout?product=${SET}`)).json()).toMatchObject({ productId: SET, name: "2027 신년운세 + 프리미엄 궁합", amount: 18900 });
    const res = await order(b);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ amount: 18900, orderName: "스타로그 2027 신년운세 + 프리미엄 궁합" });
    vi.stubEnv("STARLOG_PREMIUM", "off");
    expect((await order(b)).status).toBe(409);
    expect(await setOpen()).toEqual({ open: false, opensAt: OPENS });
    vi.stubEnv("STARLOG_PREMIUM", "on");
    vi.setSystemTime(Date.parse("2027-12-01T00:00:00+09:00"));
    expect(await setOpen()).toEqual({ open: false, opensAt: OPENS });
    expect((await order(await loggedIn("bob"))).status).toBe(409);
  });

  it("confirms only at 18,900원 and grants one 2027 신년운세 and one 프리미엄 궁합, never more on a repeated confirm or the webhook", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const { orderId } = (await (await order(b)).json()) as { orderId: string };
    expect((await confirmAs(b, orderId, `mock_${orderId}`, 14900)).status).toBe(400);
    expect(await lotsOf(db, orderId)).toEqual([]);
    expect((await confirmAs(b, orderId, `mock_${orderId}`, 18900)).status).toBe(200);
    expect((await confirmAs(b, orderId, `mock_${orderId}`, 18900)).status).toBe(200);
    expect((await browser("203.0.113.200").send(webhook, "/api/pay/webhook", { body: { eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: `mock_${orderId}`, orderId, status: "DONE" } } })).status).toBe(200);
    expect(await lotsOf(db, orderId)).toEqual([
      { product_id: "match", status: "active", units_left: 1 },
      { product_id: "newyear-2027", status: "active", units_left: 1 },
    ]);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE order_id = ? AND kind = 'grant'").bind(orderId).first()).toEqual({ n: 2 });
    const unused = (await me(b)).user!.unused;
    expect(unused.map((item) => item.productId).sort()).toEqual(["match", "newyear-2027"]);
    expect(unused.every((item) => item.orderId === orderId && typeof item.refundUntil === "string" && (item as { set?: true }).set === true)).toBe(true);
  });

  it("refunds 18,900원 whole when neither reading was opened", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await boughtSet(db, b);
    const cancel = vi.spyOn(mockToss, "cancel");
    const res = await b.send(refund, "/api/pay/refund", { body: { orderId }, origin: true });
    expect(res.status).toBe(200);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(await lotsOf(db, orderId)).toEqual([
      { product_id: "match", status: "refunded", units_left: 0 },
      { product_id: "newyear-2027", status: "refunded", units_left: 0 },
    ]);
    expect(await db.prepare("SELECT o.status, p.canceled_amount FROM orders o JOIN payments p ON p.order_id = o.id WHERE o.id = ?").bind(orderId).first()).toEqual({ status: "refunded", canceled_amount: 18900 });
    expect((await me(b)).user!.unused).toEqual([]);
  });

  it("refunds nothing once one reading was opened; the other still opens and shows as not refundable", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await boughtSet(db, b);
    const userId = (await db.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>())!.id;
    const opened = await reserveUnlock(db, { userId, productId: "newyear-2027", currency: "paid", now: Date.now(), payMode: "mock", earmarked: true });
    if (!opened.ok) throw new Error("not reserved");
    expect(await deliverUnlock(db, { unlockId: opened.unlockId, readingId: "r_1", now: Date.now() })).toBe("delivered");
    const cancel = vi.spyOn(mockToss, "cancel");
    const res = await b.send(refund, "/api/pay/refund", { body: { orderId }, origin: true });
    expect(await res.json()).toMatchObject({ code: "NOT_REFUNDABLE" });
    expect(cancel).not.toHaveBeenCalled();
    expect(await lotsOf(db, orderId)).toEqual([
      { product_id: "match", status: "active", units_left: 1 },
      { product_id: "newyear-2027", status: "active", units_left: 0 },
    ]);
    expect((await me(b)).user!.unused).toEqual([{ orderId, productId: "match", refundable: false, set: true }]);
  });
});
