import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { D1Binding } from "@/lib/db/d1";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import { productById } from "./catalog";
import { deliverUnlock, reserveUnlock } from "./ledger";
import { createOrder, orderById } from "./orders";
import { PlayError, mockPlay, playAccountTag } from "./play";
import {
  PLAY_ORPHAN_MESSAGE,
  PLAY_SET_PART_MESSAGE,
  PLAY_VOIDED_SINCE,
  applyVoidedPlay,
  consumePendingPlay,
  reconcilePlayRefunds,
  refundUnusedPlayOrder,
  verifyPlayPurchase,
} from "./playOrders";

const T0 = Date.parse("2026-11-11T03:00:00Z");
const DAY = 24 * 60 * 60_000;
const hex = (text: string) => createHash("sha256").update(text).digest("hex");

let logs: { info: ReturnType<typeof vi.spyOn>; warn: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  mockPlay.reset();
  logs = {
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const events = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((call: unknown[]) => JSON.parse(String(call[0])) as Record<string, unknown>);
/** Every log line of the test: a purchase token must never be in one. */
const everyLog = () => [logs.info, logs.warn, logs.error].flatMap((spy) => spy.mock.calls.map((call: unknown[]) => String(call[0]))).join("\n");

async function setup() {
  const db = migratedTestD1();
  await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_1', 'k_1', '별', 'c_1', 0, 0)").run();
  return db;
}

/** An order made in the app and the purchase Google holds for it (the app sent the account tag and the order id). */
async function bought(db: D1Binding, input: { productId?: string; token?: string; state?: 0 | 1 | 2; tag?: string; test?: boolean } = {}) {
  const product = productById(input.productId ?? "tarot")!;
  const order = await createOrder(db, { userId: "u_1", product, returnTo: "/tarot/result", now: T0 });
  const token = input.token ?? `token-${order.id}`;
  const playProductId = product.id.replaceAll("-", "_");
  mockPlay.addPurchase({ token, playProductId, state: input.state ?? 0, accountTag: input.tag ?? (await playAccountTag("u_1")), profileId: order.id, test: input.test });
  return { order, token, playProductId };
}

const verify = (db: D1Binding, token: string, playProductId: string, now = T0 + 1000) => verifyPlayPurchase(db, mockPlay, { purchaseToken: token, playProductId, now });
const row = (db: D1Binding, sql: string, ...values: unknown[]) => db.prepare(sql).bind(...values).first();
const count = async (db: D1Binding, sql: string) => (await db.prepare(sql).first<{ n: number }>())!.n;

describe("verifyPlayPurchase", () => {
  it("records a purchase Google vouches for once: the order paid, the payment, the Play row and its lot, then consumes it", async () => {
    const db = await setup();
    const { order, token } = await bought(db, { test: true });
    const outcome = await verify(db, token, "tarot");
    expect(outcome).toMatchObject({ ok: true, order: { id: order.id, status: "paid", payment_key: `play_${hex(token)}`, fail_code: null } });
    const purchase = (await mockPlay.getPurchase("tarot", token))!;
    expect(await row(db, "SELECT * FROM payments WHERE order_id = ?", order.id)).toEqual({
      payment_key: `play_${hex(token)}`, order_id: order.id, method: "Google Play", total_amount: 2900, status: "DONE", approved_at: new Date(purchase.purchaseTimeMillis!).toISOString(),
      receipt_url: null, canceled_amount: 0, canceled_at: null, mode: "play", updated_at: T0 + 1000,
    });
    expect(await row(db, "SELECT * FROM play_purchases")).toEqual({
      purchase_token: token, order_id: order.id, play_product_id: "tarot", google_order_id: purchase.orderId, test: 1, purchased_at: purchase.purchaseTimeMillis,
      consumed_at: T0 + 1000, voided_at: null, created_at: T0 + 1000,
    });
    expect(await row(db, "SELECT id, product_id, status, units_left FROM credit_lots")).toEqual({ id: `lot_${order.id}`, product_id: "tarot", status: "active", units_left: 1 });
    expect(await count(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'grant'")).toBe(1);
    expect(purchase.consumptionState).toBe(1);
    expect(events(logs.info)).toContainEqual({ evt: "pay.paid", orderId: order.id, mode: "play" });
    expect(everyLog()).not.toContain(token);
  });

  it("answers a token seen before with its order and changes nothing, without asking Google", async () => {
    const db = await setup();
    const { order, token } = await bought(db);
    expect((await verify(db, token, "tarot")).ok).toBe(true);
    const asked = vi.spyOn(mockPlay, "getPurchase");
    const again = await verify(db, token, "tarot", T0 + 5000);
    expect(again).toMatchObject({ ok: true, order: { id: order.id, status: "paid", updated_at: T0 + 1000 } });
    expect(asked).not.toHaveBeenCalled();
    expect([await count(db, "SELECT COUNT(*) AS n FROM payments"), await count(db, "SELECT COUNT(*) AS n FROM credit_lots"), await count(db, "SELECT COUNT(*) AS n FROM ledger")]).toEqual([1, 1, 1]);
  });

  it("refuses a purchase made for another account, logging the order id only, and never consumes it", async () => {
    const db = await setup();
    const { order, token } = await bought(db, { tag: await playAccountTag("u_someone_else") });
    expect(await verify(db, token, "tarot")).toEqual({ ok: false, code: "BAD_REQUEST" });
    expect(events(logs.warn)).toEqual([{ evt: "pay.play_mismatch", orderId: order.id }]);
    expect(await row(db, "SELECT status FROM orders WHERE id = ?", order.id)).toEqual({ status: "created" });
    expect(await count(db, "SELECT COUNT(*) AS n FROM payments")).toBe(0);
    expect((await mockPlay.getPurchase("tarot", token))!.consumptionState).toBe(0);
  });

  it("refuses a purchase of another product than the order's, and a product id the catalog does not know", async () => {
    const db = await setup();
    const order = await createOrder(db, { userId: "u_1", product: productById("tarot")!, returnTo: "/", now: T0 });
    mockPlay.addPurchase({ token: "t_saju", playProductId: "saju", accountTag: await playAccountTag("u_1"), profileId: order.id });
    expect(await verify(db, "t_saju", "saju")).toEqual({ ok: false, code: "BAD_REQUEST" });
    expect(events(logs.warn)).toEqual([{ evt: "pay.play_mismatch", orderId: order.id }]);
    expect(await verify(db, "t_saju", "moon_30")).toEqual({ ok: false, code: "BAD_REQUEST" });
    // Google's purchase names no order of ours (made outside the app), or one that does not exist.
    mockPlay.addPurchase({ token: "t_none", playProductId: "tarot", accountTag: await playAccountTag("u_1"), profileId: null });
    mockPlay.addPurchase({ token: "t_ghost", playProductId: "tarot", accountTag: await playAccountTag("u_1"), profileId: "order_that_is_not_there_0" });
    expect(await verify(db, "t_none", "tarot")).toEqual({ ok: false, code: "BAD_REQUEST" });
    expect(await verify(db, "t_ghost", "tarot")).toEqual({ ok: false, code: "BAD_REQUEST" });
    expect(await count(db, "SELECT COUNT(*) AS n FROM payments")).toBe(0);
  });

  it("waits on a pending purchase and grants it once it went through; a cancelled one fails", async () => {
    const db = await setup();
    const { order, token } = await bought(db, { state: 2 });
    expect(await verify(db, token, "tarot")).toEqual({ ok: false, code: "PAY_PENDING" });
    expect(await row(db, "SELECT status FROM orders WHERE id = ?", order.id)).toEqual({ status: "created" });
    expect((await mockPlay.getPurchase("tarot", token))!.consumptionState).toBe(0);
    mockPlay.addPurchase({ token, playProductId: "tarot", accountTag: await playAccountTag("u_1"), profileId: order.id });
    expect(await verify(db, token, "tarot")).toMatchObject({ ok: true, order: { status: "paid" } });

    const cancelled = await bought(db, { state: 1 });
    expect(await verify(db, cancelled.token, "tarot")).toEqual({ ok: false, code: "PAY_FAILED" });
    expect(await row(db, "SELECT status FROM orders WHERE id = ?", cancelled.order.id)).toEqual({ status: "created" });
  });

  it("never guesses: a token Google does not know, or no answer from Google, is pending and changes nothing", async () => {
    const db = await setup();
    expect(await verify(db, "t_unknown", "tarot")).toEqual({ ok: false, code: "PAY_PENDING" });
    const { token } = await bought(db);
    vi.spyOn(mockPlay, "getPurchase").mockRejectedValueOnce(new PlayError(503, "UNAVAILABLE")).mockRejectedValueOnce(new PlayError(401, "UNAUTHENTICATED"));
    expect(await verify(db, token, "tarot")).toEqual({ ok: false, code: "PAY_PENDING" });
    expect(await verify(db, token, "tarot")).toEqual({ ok: false, code: "PAY_PENDING" });
    // Our own credentials refused is an error to fix; Google busy is only a warning.
    expect(events(logs.error)).toEqual([{ evt: "pay.play_verify_refused", status: 401, reason: "UNAUTHENTICATED", token: hex(token).slice(0, 12) }]);
    expect(events(logs.warn)).toContainEqual({ evt: "pay.play_verify_unknown", status: 503, reason: "UNAVAILABLE", token: hex(token).slice(0, 12) });
    expect(await count(db, "SELECT COUNT(*) AS n FROM payments")).toBe(0);
    expect(everyLog()).not.toContain(token);
  });

  it("pays an order the cron closed as abandoned: a pending purchase may land after the hour", async () => {
    const db = await setup();
    const { order, token } = await bought(db);
    await db.prepare("UPDATE orders SET status = 'failed', fail_code = 'ABANDONED' WHERE id = ?").bind(order.id).run();
    expect(await verify(db, token, "tarot")).toMatchObject({ ok: true, order: { status: "paid", fail_code: null } });
  });

  it("grants a set's two readings, one lot each", async () => {
    const db = await setup();
    vi.setSystemTime(Date.parse("2026-12-01T12:00:00+09:00"));
    const { order, token } = await bought(db, { productId: "set-2027" });
    expect(await verify(db, token, "set_2027", Date.now())).toMatchObject({ ok: true });
    expect((await db.prepare("SELECT product_id FROM credit_lots WHERE order_id = ? ORDER BY product_id").bind(order.id).all()).results).toEqual([{ product_id: "match" }, { product_id: "newyear-2027" }]);
    expect(await row(db, "SELECT total_amount FROM payments WHERE order_id = ?", order.id)).toEqual({ total_amount: 18900 });
  });

  it("never grants or consumes a purchase that arrives for a deleted account: Google refunds it after three days", async () => {
    const db = await setup();
    const { order, token } = await bought(db);
    await db.prepare("UPDATE users SET deleted_at = ?").bind(T0).run();
    const consume = vi.spyOn(mockPlay, "consume");
    const outcome = await verify(db, token, "tarot");
    expect(outcome).toEqual({ ok: false, code: "PAY_FAILED", message: PLAY_ORPHAN_MESSAGE });
    expect(PLAY_ORPHAN_MESSAGE).not.toMatch(/카드/);
    expect(await row(db, "SELECT status, fail_code FROM orders WHERE id = ?", order.id)).toEqual({ status: "refunding", fail_code: "ACCOUNT_DELETED" });
    expect(await count(db, "SELECT COUNT(*) AS n FROM credit_lots")).toBe(0);
    expect(await row(db, "SELECT mode, status FROM payments")).toEqual({ mode: "play", status: "DONE" });
    expect(await row(db, "SELECT consumed_at FROM play_purchases")).toEqual({ consumed_at: null });
    expect(consume).not.toHaveBeenCalled();
    expect(events(logs.warn)).toContainEqual({ evt: "pay.play_for_deleted_account", orderId: order.id });
    expect(await verify(db, token, "tarot")).toEqual({ ok: false, code: "PAY_FAILED", message: PLAY_ORPHAN_MESSAGE });
    // The cron never consumes it either.
    expect(await consumePendingPlay(db, mockPlay, T0 + 2000, 10)).toBe(0);
  });

  it("keeps the grant when consuming fails, logs it, and leaves it to the cron", async () => {
    const db = await setup();
    const { order, token } = await bought(db);
    vi.spyOn(mockPlay, "consume").mockRejectedValueOnce(new PlayError(503, "UNAVAILABLE"));
    expect(await verify(db, token, "tarot")).toMatchObject({ ok: true, order: { status: "paid" } });
    expect(await row(db, "SELECT consumed_at FROM play_purchases")).toEqual({ consumed_at: null });
    expect(events(logs.warn)).toContainEqual({ evt: "pay.play_consume_failed", orderId: order.id, status: 503 });
    expect(await consumePendingPlay(db, mockPlay, T0 + 600_000, 10)).toBe(1);
    expect(await row(db, "SELECT consumed_at FROM play_purchases")).toEqual({ consumed_at: T0 + 600_000 });
    expect((await mockPlay.getPurchase("tarot", token))!.consumptionState).toBe(1);
    expect(await consumePendingPlay(db, mockPlay, T0 + 1_200_000, 10)).toBe(0);
  });

  it("records a purchase Google already holds consumed without consuming it again", async () => {
    const db = await setup();
    const { token } = await bought(db);
    const held = (await mockPlay.getPurchase("tarot", token))!;
    vi.spyOn(mockPlay, "getPurchase").mockResolvedValueOnce({ ...held, consumptionState: 1 });
    const consume = vi.spyOn(mockPlay, "consume");
    expect((await verify(db, token, "tarot")).ok).toBe(true);
    expect(consume).not.toHaveBeenCalled();
    expect(await row(db, "SELECT consumed_at FROM play_purchases")).toEqual({ consumed_at: T0 + 1000 });
  });
});

describe("consumePendingPlay", () => {
  it("consumes only paid orders' purchases not consumed or voided, oldest first, at most `limit`", async () => {
    const db = await setup();
    const tokens: string[] = [];
    vi.spyOn(mockPlay, "consume").mockRejectedValue(new PlayError(503, "UNAVAILABLE"));
    for (let n = 0; n < 3; n++) {
      const { token } = await bought(db, { token: `t_${n}` });
      await verify(db, token, "tarot", T0 + n);
      tokens.push(token);
    }
    vi.mocked(mockPlay.consume).mockRestore();
    await db.prepare("UPDATE play_purchases SET voided_at = 1 WHERE purchase_token = 't_0'").run();
    const consume = vi.spyOn(mockPlay, "consume");
    expect(await consumePendingPlay(db, mockPlay, T0 + DAY, 1)).toBe(1);
    expect(consume.mock.calls).toEqual([["tarot", "t_1"]]);
    expect(await consumePendingPlay(db, mockPlay, T0 + DAY, 10)).toBe(1);
    expect(consume.mock.calls.at(-1)).toEqual(["tarot", "t_2"]);
  });
});

describe("refundUnusedPlayOrder", () => {
  const MIN = 60_000;
  /** A purchase verified and consumed: the order paid, as 환불받기 or account deletion finds it. */
  async function paid(db: D1Binding, productId = "tarot") {
    const { order, token, playProductId } = await bought(db, { productId });
    expect((await verify(db, token, playProductId, Date.now())).ok).toBe(true);
    return { order: (await orderById(db, order.id))!, token, playProductId, googleOrderId: (await mockPlay.getPurchase(playProductId, token))!.orderId! };
  }
  const refund = async (db: D1Binding, orderId: string, now = T0 + 5 * MIN, expected?: number) =>
    refundUnusedPlayOrder(db, mockPlay, { order: (await orderById(db, orderId))!, now, ...(expected === undefined ? {} : { expected }) });
  const state = async (db: D1Binding, orderId: string) => ({
    order: (await row(db, "SELECT status FROM orders WHERE id = ?", orderId)) as { status: string },
    lots: (await db.prepare("SELECT status, units_left FROM credit_lots WHERE order_id = ? ORDER BY product_id").bind(orderId).all()).results,
  });

  it("refunds an unopened purchase whole through Google, with the purchase revoked, and records it once", async () => {
    const db = await setup();
    const { order, googleOrderId } = await paid(db);
    const asked = vi.spyOn(mockPlay, "refund");
    expect(await refund(db, order.id)).toEqual({ ok: true, amount: 2900 });
    expect(asked).toHaveBeenCalledWith(googleOrderId);
    expect(await state(db, order.id)).toEqual({ order: { status: "refunded" }, lots: [{ status: "refunded", units_left: 0 }] });
    expect(await row(db, "SELECT status, canceled_amount FROM payments")).toEqual({ status: "CANCELED", canceled_amount: 2900 });
    expect(await row(db, "SELECT voided_at FROM play_purchases")).toEqual({ voided_at: T0 + 5 * MIN });
    expect(events(logs.info)).toContainEqual({ evt: "pay.refunded", orderId: order.id });
    // Google now lists it voided: the cron finds it applied already.
    expect(await applyVoidedPlay(db, mockPlay, T0 + 15 * MIN)).toBe(0);
    expect(await count(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'refund'")).toBe(1);
    expect(await refund(db, order.id, T0 + 20 * MIN)).toEqual({ ok: false, code: "NOT_REFUNDABLE" });
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it("refunds nothing that is not an unopened Play purchase, without asking Google", async () => {
    const db = await setup();
    const asked = vi.spyOn(mockPlay, "refund");
    const opened = await paid(db);
    const unlock = await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "paid", now: T0 + 2000, payMode: "live" });
    if (!unlock.ok) throw new Error("not reserved");
    expect(await refund(db, opened.order.id)).toEqual({ ok: false, code: "NOT_REFUNDABLE" });
    // Google's order id missing (a purchase with no order), or a Toss payment.
    const noGoogleOrder = await paid(db);
    await db.prepare("UPDATE play_purchases SET google_order_id = NULL WHERE order_id = ?").bind(noGoogleOrder.order.id).run();
    expect(await refund(db, noGoogleOrder.order.id)).toEqual({ ok: false, code: "NOT_REFUNDABLE" });
    const toss = await paid(db);
    await db.prepare("UPDATE payments SET mode = 'live' WHERE order_id = ?").bind(toss.order.id).run();
    expect(await refund(db, toss.order.id)).toEqual({ ok: false, code: "NOT_REFUNDABLE" });
    expect(asked).not.toHaveBeenCalled();
    for (const id of [noGoogleOrder.order.id, toss.order.id]) expect(await state(db, id)).toEqual({ order: { status: "paid" }, lots: [{ status: "active", units_left: 1 }] });
  });

  it("never refunds part of a set through Google: one reading opened, the other's part goes to the operator", async () => {
    vi.setSystemTime(Date.parse("2026-12-01T12:00:00+09:00"));
    const db = await setup();
    const asked = vi.spyOn(mockPlay, "refund");
    const { order } = await paid(db, "set-2027");
    const opened = await reserveUnlock(db, { userId: "u_1", productId: "newyear-2027", currency: "paid", now: Date.now(), payMode: "live", earmarked: true });
    if (!opened.ok) throw new Error("not reserved");
    expect(await deliverUnlock(db, { unlockId: opened.unlockId, readingId: "r_ny", now: Date.now() + 1 })).toBe("delivered");
    expect(await refund(db, order.id, Date.now() + 2)).toEqual({ ok: false, code: "NOT_REFUNDABLE", message: PLAY_SET_PART_MESSAGE });
    expect(asked).not.toHaveBeenCalled();
    expect(await state(db, order.id)).toEqual({ order: { status: "paid" }, lots: [{ status: "active", units_left: 1 }, { status: "active", units_left: 0 }] });
    // Both unopened: refunded whole.
    const whole = await paid(db, "set-2027");
    expect(await refund(db, whole.order.id, Date.now() + 3)).toEqual({ ok: true, amount: 18900 });
  });

  it("refunds only the amount the buyer confirmed", async () => {
    const db = await setup();
    const { order } = await paid(db);
    expect(await refund(db, order.id, T0 + 5 * MIN, 1000)).toEqual({ ok: false, code: "REFUND_AMOUNT_CHANGED" });
    expect(await state(db, order.id)).toEqual({ order: { status: "paid" }, lots: [{ status: "active", units_left: 1 }] });
    expect(await refund(db, order.id, T0 + 6 * MIN, 2900)).toEqual({ ok: true, amount: 2900 });
  });

  it("puts the reading back when Google refuses, and logs the status", async () => {
    const db = await setup();
    const { order } = await paid(db);
    vi.spyOn(mockPlay, "refund").mockRejectedValueOnce(new PlayError(400, "FAILED_PRECONDITION"));
    expect(await refund(db, order.id)).toEqual({ ok: false, code: "PAY_FAILED", message: "환불하지 못했어요. 문의해 주세요." });
    expect(await state(db, order.id)).toEqual({ order: { status: "paid" }, lots: [{ status: "active", units_left: 1 }] });
    expect(events(logs.warn)).toContainEqual({ evt: "pay.play_refund_refused", orderId: order.id, status: 400 });
    expect(await row(db, "SELECT voided_at FROM play_purchases")).toEqual({ voided_at: null });
  });

  it("keeps a refund whose answer was lost `refunding`; Google's voided list then closes it", async () => {
    const db = await setup();
    const { order } = await paid(db);
    const googleRefund = mockPlay.refund;
    // Google did refund; only its answer was lost.
    vi.spyOn(mockPlay, "refund").mockImplementationOnce(async (id) => {
      await googleRefund(id);
      throw new PlayError(0, "NETWORK");
    });
    expect(await refund(db, order.id)).toEqual({ ok: false, code: "PAY_PENDING" });
    expect(events(logs.warn)).toContainEqual({ evt: "pay.play_refund_unknown", orderId: order.id, status: 0 });
    expect(await state(db, order.id)).toEqual({ order: { status: "refunding" }, lots: [{ status: "refunding", units_left: 0 }] });
    expect(await applyVoidedPlay(db, mockPlay, T0 + 15 * MIN)).toBe(1);
    expect(await state(db, order.id)).toEqual({ order: { status: "refunded" }, lots: [{ status: "refunded", units_left: 0 }] });
  });

  it("gives the reading back at once when Google refuses our credentials (401): nothing was refunded, logged as an error", async () => {
    const db = await setup();
    const { order } = await paid(db);
    vi.spyOn(mockPlay, "refund").mockRejectedValueOnce(new PlayError(401, "UNAUTHENTICATED"));
    expect(await refund(db, order.id)).toMatchObject({ ok: false, code: "PAY_FAILED" });
    expect(events(logs.error)).toContainEqual({ evt: "pay.play_refund_refused", orderId: order.id, status: 401 });
    expect(await state(db, order.id)).toEqual({ order: { status: "paid" }, lots: [{ status: "active", units_left: 1 }] });
  });

  it("asks Google about a refund still `refunding` 10 minutes on: still purchased → the reading comes back; canceled → refunded", async () => {
    const db = await setup();
    const lost = await paid(db);
    const landed = await paid(db);
    const auth = await paid(db);
    vi.spyOn(mockPlay, "refund")
      .mockRejectedValueOnce(new PlayError(503, "UNAVAILABLE"))
      .mockRejectedValueOnce(new PlayError(0, "NETWORK"))
      .mockRejectedValueOnce(new PlayError(503, "UNAVAILABLE"));
    for (const { order } of [lost, landed, auth]) expect(await refund(db, order.id)).toEqual({ ok: false, code: "PAY_PENDING" });
    const held = (await mockPlay.getPurchase(landed.playProductId, landed.token))!;
    vi.spyOn(mockPlay, "getPurchase").mockImplementation(async (productId, token) =>
      token === landed.token ? { ...held, purchaseState: 1 } : token === auth.token ? Promise.reject(new PlayError(401, "UNAUTHENTICATED")) : { ...held, purchaseState: 0 },
    );
    expect(await reconcilePlayRefunds(db, mockPlay, T0 + 5 * MIN + 1000, 10)).toBe(0);
    expect(await reconcilePlayRefunds(db, mockPlay, T0 + 16 * MIN, 10)).toBe(2);
    expect(await state(db, lost.order.id)).toEqual({ order: { status: "paid" }, lots: [{ status: "active", units_left: 1 }] });
    expect(events(logs.info)).toContainEqual({ evt: "pay.play_refund_reverted", orderId: lost.order.id });
    expect(await state(db, landed.order.id)).toEqual({ order: { status: "refunded" }, lots: [{ status: "refunded", units_left: 0 }] });
    expect(await row(db, "SELECT voided_at FROM play_purchases WHERE order_id = ?", landed.order.id)).toEqual({ voided_at: T0 + 16 * MIN });
    expect(await state(db, auth.order.id)).toEqual({ order: { status: "refunding" }, lots: [{ status: "refunding", units_left: 0 }] });
  });
});

describe("applyVoidedPlay", () => {
  const since = async (db: D1Binding) => (await row(db, "SELECT value FROM meta WHERE key = ?", PLAY_VOIDED_SINCE)) as { value: string } | null;

  it("refunds an unopened purchase Google voided, once, and remembers how far it looked", async () => {
    const db = await setup();
    const { order, token } = await bought(db);
    await verify(db, token, "tarot");
    mockPlay.voidPurchase(token, T0 + 60_000);
    const list = vi.spyOn(mockPlay, "listVoided");
    const now = T0 + 10 * 60_000;
    expect(await applyVoidedPlay(db, mockPlay, now)).toBe(1);
    // First run: as far back as Google allows (30 days), an hour inside it.
    expect(list).toHaveBeenLastCalledWith({ startTime: now - 30 * DAY + 60 * 60_000 });
    expect(await row(db, "SELECT status FROM orders WHERE id = ?", order.id)).toEqual({ status: "refunded" });
    expect(await row(db, "SELECT status, units_left FROM credit_lots")).toEqual({ status: "refunded", units_left: 0 });
    expect(await row(db, "SELECT status, canceled_amount FROM payments")).toEqual({ status: "CANCELED", canceled_amount: 2900 });
    expect(await row(db, "SELECT voided_at FROM play_purchases")).toEqual({ voided_at: now });
    expect(await count(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'refund'")).toBe(1);
    expect(events(logs.info)).toContainEqual({ evt: "pay.play_voided", orderId: order.id });
    expect(await since(db)).toEqual({ value: String(now) });
    // Again: listed again (an hour of overlap: Google filters by when it saw the record), applied once.
    const later = now + 10 * 60_000;
    expect(await applyVoidedPlay(db, mockPlay, later)).toBe(0);
    expect(list).toHaveBeenLastCalledWith({ startTime: now - 60 * 60_000 });
    expect(await count(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'refund'")).toBe(1);
    expect(await since(db)).toEqual({ value: String(later) });
    expect(everyLog()).not.toContain(token);
  });

  it("revokes a purchase whose reading was opened, and ignores tokens it never recorded", async () => {
    const db = await setup();
    const { order, token } = await bought(db);
    await verify(db, token, "tarot");
    const opened = await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "paid", now: T0 + 2000, payMode: "live" });
    if (!opened.ok) throw new Error("not reserved");
    expect(await deliverUnlock(db, { unlockId: opened.unlockId, readingId: "r_1", now: T0 + 3000 })).toBe("delivered");
    mockPlay.addPurchase({ token: "t_elsewhere", playProductId: "tarot", accountTag: null, profileId: null });
    mockPlay.voidPurchase("t_elsewhere", T0 + 4000);
    mockPlay.voidPurchase(token, T0 + 5000);
    expect(await applyVoidedPlay(db, mockPlay, T0 + 10 * 60_000)).toBe(1);
    expect(await row(db, "SELECT status FROM orders WHERE id = ?", order.id)).toEqual({ status: "refunded" });
    expect(await row(db, "SELECT status FROM credit_lots")).toEqual({ status: "revoked" });
    expect(events(logs.warn)).toContainEqual({ evt: "pay.canceled_after_open", orderId: order.id });
  });

  it("closes a deleted account's purchase once Google refunded it", async () => {
    const db = await setup();
    const { order, token } = await bought(db);
    await db.prepare("UPDATE users SET deleted_at = ?").bind(T0).run();
    await verify(db, token, "tarot");
    mockPlay.voidPurchase(token, T0 + 3 * DAY);
    expect(await applyVoidedPlay(db, mockPlay, T0 + 3 * DAY + 60_000)).toBe(1);
    expect(await row(db, "SELECT status, fail_code FROM orders WHERE id = ?", order.id)).toEqual({ status: "refunded", fail_code: "ACCOUNT_DELETED" });
    expect(await row(db, "SELECT status, canceled_amount FROM payments")).toEqual({ status: "CANCELED", canceled_amount: 2900 });
  });

  it("looks no further back than Google allows, and moves on only after a run that went through", async () => {
    const db = await setup();
    const now = T0 + 40 * DAY;
    await db.prepare("INSERT INTO meta (key, value, updated_at) VALUES (?, ?, 0)").bind(PLAY_VOIDED_SINCE, String(T0)).run();
    const list = vi.spyOn(mockPlay, "listVoided").mockRejectedValueOnce(new PlayError(503, "UNAVAILABLE"));
    await expect(applyVoidedPlay(db, mockPlay, now)).rejects.toBeInstanceOf(PlayError);
    expect(list).toHaveBeenLastCalledWith({ startTime: now - 30 * DAY + 60 * 60_000 });
    expect(await since(db)).toEqual({ value: String(T0) });
  });
});
