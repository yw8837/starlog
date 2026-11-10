import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestDb } from "@/lib/db";
import { deliverUnlock, reserveUnlock } from "@/lib/pay/ledger";
import { mockToss } from "@/lib/pay/tossMock";
import { TossError } from "@/lib/pay/tossTypes";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { GET as status } from "../premium/status/route";
import { GET as checkout } from "./checkout/route";
import { POST as confirm } from "./confirm/route";
import { GET as ordersGet, POST as ordersPost } from "./orders/route";
import { POST as refund } from "./refund/route";
import { POST as webhook } from "./webhook/route";

/** The set's first moment on sale (owner 2026-11-10): 오픈 기념 무료 ends then. */
const OPENS = Date.parse("2026-12-01T00:00:00+09:00");
const SET = "set-2027";
/** The refund window of a payment made at OPENS + 12 h: the end of the 7th KST day after it. */
const UNTIL = "2026-12-08T14:59:59.999Z";

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

const refundOf = (b: Browser, orderId: string) => b.send(refund, "/api/pay/refund", { body: { orderId }, origin: true });
const hook = (body: unknown) => browser("203.0.113.200").send(webhook, "/api/pay/webhook", { body });
const statusOf = async (b: Browser, orderId: string) => ((await (await b.send(ordersGet, `/api/pay/orders?id=${orderId}`)).json()) as { status: string }).status;
const paymentKeyOf = async (db: ReturnType<typeof useTestDb>, orderId: string) =>
  (await db.prepare("SELECT payment_key FROM payments WHERE order_id = ?").bind(orderId).first<{ payment_key: string }>())!.payment_key;
const settled = (db: ReturnType<typeof useTestDb>, orderId: string) =>
  db.prepare("SELECT o.status, p.status AS payment, p.canceled_amount FROM orders o JOIN payments p ON p.order_id = o.id WHERE o.id = ?").bind(orderId).first();

/** Opens and delivers one reading with the set's lot of it. */
async function openAndDeliver(db: ReturnType<typeof useTestDb>, productId: string) {
  const userId = (await db.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>())!.id;
  const opened = await reserveUnlock(db, { userId, productId, currency: "paid", now: Date.now(), payMode: "mock", earmarked: true });
  if (!opened.ok) throw new Error("not reserved");
  expect(await deliverUnlock(db, { unlockId: opened.unlockId, readingId: `r_${opened.unlockId}`, now: Date.now() })).toBe("delivered");
}

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
    const res = await refundOf(b, orderId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "refunded", amount: 18900 });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.calls[0]![1]).not.toHaveProperty("amount");
    expect(await lotsOf(db, orderId)).toEqual([
      { product_id: "match", status: "refunded", units_left: 0 },
      { product_id: "newyear-2027", status: "refunded", units_left: 0 },
    ]);
    expect(await db.prepare("SELECT o.status, p.canceled_amount FROM orders o JOIN payments p ON p.order_id = o.id WHERE o.id = ?").bind(orderId).first()).toEqual({ status: "refunded", canceled_amount: 18900 });
    expect((await me(b)).user!.unused).toEqual([]);
  });

  it("refunds the 궁합's part, 4,000원, once the 신년운세 was opened: a partial cancel at Toss; the 신년운세 stays", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await boughtSet(db, b);
    await openAndDeliver(db, "newyear-2027");
    expect((await me(b)).user!.unused).toEqual([{ orderId, productId: "match", refundUntil: UNTIL, refundAmount: 4000, set: true }]);
    const cancel = vi.spyOn(mockToss, "cancel");
    const res = await refundOf(b, orderId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "refunded", amount: 4000 });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.calls[0]![1]).toMatchObject({ amount: 4000, idempotencyKey: `cancel-${orderId}-1` });
    expect(await lotsOf(db, orderId)).toEqual([
      { product_id: "match", status: "refunded", units_left: 0 },
      { product_id: "newyear-2027", status: "active", units_left: 0 },
    ]);
    expect(await settled(db, orderId)).toEqual({ status: "paid", payment: "PARTIAL_CANCELED", canceled_amount: 4000 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE order_id = ? AND kind = 'refund'").bind(orderId).first()).toEqual({ n: 1 });
    expect((await me(b)).user!.unused).toEqual([]);
    const history = ((await (await b.send(ordersGet, "/api/pay/orders")).json()) as { orders: unknown[] }).orders;
    expect(history).toMatchObject([{ orderId, status: "paid", amount: 18900, refunded: 4000, openedProducts: ["newyear-2027"], refundable: false }]);
    // Nothing more to refund; Toss's own event for it changes nothing and asks nothing of the operator.
    expect(await (await refundOf(b, orderId)).json()).toMatchObject({ code: "NOT_REFUNDABLE" });
    expect((await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: await paymentKeyOf(db, orderId), orderId, status: "PARTIAL_CANCELED" } })).status).toBe(200);
    expect(await settled(db, orderId)).toEqual({ status: "paid", payment: "PARTIAL_CANCELED", canceled_amount: 4000 });
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining("pay.partial_cancel"));
  });

  it("refunds the 신년운세's part, 11,000원, once the 궁합 was opened; nothing once both were", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const first = await boughtSet(db, b);
    await openAndDeliver(db, "match");
    expect(await (await refundOf(b, first)).json()).toEqual({ ok: true, status: "refunded", amount: 11000 });
    expect(await settled(db, first)).toEqual({ status: "paid", payment: "PARTIAL_CANCELED", canceled_amount: 11000 });
    const second = await boughtSet(db, b);
    await openAndDeliver(db, "match");
    await openAndDeliver(db, "newyear-2027");
    const cancel = vi.spyOn(mockToss, "cancel");
    expect(await (await refundOf(b, second)).json()).toMatchObject({ code: "NOT_REFUNDABLE" });
    expect(cancel).not.toHaveBeenCalled();
  });

  it("settles a partial cancel whose answer was lost when Toss reports it: the 궁합 leaves as a refund once, never back in use", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await boughtSet(db, b);
    await openAndDeliver(db, "newyear-2027");
    mockToss.failNext("cancel", new TossError(0, "NETWORK", "no response from Toss"), { applied: true });
    expect(await (await refundOf(b, orderId)).json()).toMatchObject({ code: "PAY_PENDING" });
    expect(await lotsOf(db, orderId)).toEqual([
      { product_id: "match", status: "refunding", units_left: 0 },
      { product_id: "newyear-2027", status: "active", units_left: 0 },
    ]);
    // The webhook brings Toss's word: 4,000원 cancelled, the refund's target.
    expect((await hook({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: await paymentKeyOf(db, orderId), orderId, status: "PARTIAL_CANCELED" } })).status).toBe(200);
    expect(await settled(db, orderId)).toEqual({ status: "paid", payment: "PARTIAL_CANCELED", canceled_amount: 4000 });
    expect(await lotsOf(db, orderId)).toEqual([
      { product_id: "match", status: "refunded", units_left: 0 },
      { product_id: "newyear-2027", status: "active", units_left: 0 },
    ]);
    // The same answer again (the cron) changes nothing.
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect((await b.send(ordersGet, `/api/pay/orders?id=${orderId}`)).status).toBe(200);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE order_id = ? AND kind = 'refund'").bind(orderId).first()).toEqual({ n: 1 });
  });

  it("settles a lost partial cancel by looking it up 10 minutes on: applied at the target, or the 궁합 back for a new attempt when Toss never cancelled", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const landed = await boughtSet(db, b);
    await openAndDeliver(db, "newyear-2027");
    mockToss.failNext("cancel", new TossError(0, "NETWORK", "no response from Toss"), { applied: true });
    expect(await (await refundOf(b, landed)).json()).toMatchObject({ code: "PAY_PENDING" });
    const lost = await boughtSet(db, b);
    await openAndDeliver(db, "newyear-2027");
    mockToss.failNext("cancel", new TossError(0, "NETWORK", "no response from Toss"));
    expect(await (await refundOf(b, lost)).json()).toMatchObject({ code: "PAY_PENDING" });
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(await statusOf(b, landed)).toBe("paid");
    expect(await settled(db, landed)).toEqual({ status: "paid", payment: "PARTIAL_CANCELED", canceled_amount: 4000 });
    expect(await statusOf(b, lost)).toBe("paid");
    expect(await settled(db, lost)).toEqual({ status: "paid", payment: "DONE", canceled_amount: 0 });
    expect(await lotsOf(db, lost)).toEqual([
      { product_id: "match", status: "active", units_left: 1 },
      { product_id: "newyear-2027", status: "active", units_left: 0 },
    ]);
    // Its next attempt goes under a new key and lands.
    const cancel = vi.spyOn(mockToss, "cancel");
    expect(await (await refundOf(b, lost)).json()).toEqual({ ok: true, status: "refunded", amount: 4000 });
    expect(cancel.mock.calls[0]![1]).toMatchObject({ amount: 4000, idempotencyKey: `cancel-${lost}-2` });
  });

  it("puts the 궁합 back when Toss refuses its partial cancel", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await boughtSet(db, b);
    await openAndDeliver(db, "newyear-2027");
    mockToss.failNext("cancel", new TossError(400, "NOT_CANCELABLE_PAYMENT", "취소 할 수 없는 결제 입니다."));
    expect(await (await refundOf(b, orderId)).json()).toMatchObject({ code: "PAY_FAILED" });
    expect(await db.prepare("SELECT status, cancel_attempt FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "paid", cancel_attempt: 2 });
    expect(await lotsOf(db, orderId)).toEqual([
      { product_id: "match", status: "active", units_left: 1 },
      { product_id: "newyear-2027", status: "active", units_left: 0 },
    ]);
    expect((await me(b)).user!.unused).toEqual([{ orderId, productId: "match", refundUntil: UNTIL, refundAmount: 4000, set: true }]);
  });

  it("asks before a set when the buyer holds an unopened 2027 신년운세 or 프리미엄 궁합", async () => {
    useTestDb();
    const b = await loggedIn();
    expect(await (await order(b)).json()).toMatchObject({ held: 0 });
    await buy(b, "match");
    expect(await (await order(b)).json()).toMatchObject({ held: 1 });
  });
});
