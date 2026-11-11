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
async function bought(db: D1Binding, input: { productId?: string; token?: string; state?: 0 | 1 | 2; tag?: string; purchaseType?: number | null; quantity?: number } = {}) {
  const product = productById(input.productId ?? "tarot")!;
  const order = await createOrder(db, { userId: "u_1", product, returnTo: "/tarot/result", now: T0 });
  const token = input.token ?? `token-${order.id}`;
  const playProductId = product.id.replaceAll("-", "_");
  mockPlay.addPurchase({
    token, playProductId, state: input.state ?? 0, accountTag: input.tag ?? (await playAccountTag("u_1")), profileId: order.id, purchaseType: input.purchaseType, quantity: input.quantity,
  });
  return { order, token, playProductId };
}

/** Google's order id of a purchase the mock holds. */
const googleOrderOf = async (playProductId: string, token: string) => (await mockPlay.getPurchase(playProductId, token))!.orderId!;
const REFUNDED_REJECTED = "결제를 확인하지 못해 환불했어요. 다시 시도해 주세요.";

const verify = (db: D1Binding, token: string, playProductId: string, now = T0 + 1000) => verifyPlayPurchase(db, mockPlay, { purchaseToken: token, playProductId, now });
const row = (db: D1Binding, sql: string, ...values: unknown[]) => db.prepare(sql).bind(...values).first();
const count = async (db: D1Binding, sql: string) => (await db.prepare(sql).first<{ n: number }>())!.n;

describe("verifyPlayPurchase", () => {
  it("records a purchase Google vouches for once: the order paid, the payment, the Play row and its lot, then consumes it", async () => {
    const db = await setup();
    const { order, token } = await bought(db, { purchaseType: 0 });
    const outcome = await verify(db, token, "tarot");
    expect(outcome).toMatchObject({ ok: true, order: { id: order.id, status: "paid", payment_key: `play_${hex(token)}`, fail_code: null } });
    const purchase = (await mockPlay.getPurchase("tarot", token))!;
    expect(await row(db, "SELECT * FROM payments WHERE order_id = ?", order.id)).toEqual({
      payment_key: `play_${hex(token)}`, order_id: order.id, method: "Google Play", total_amount: 2900, status: "DONE", approved_at: new Date(purchase.purchaseTimeMillis!).toISOString(),
      receipt_url: null, canceled_amount: 0, canceled_at: null, mode: "play", updated_at: T0 + 1000,
    });
    expect(await row(db, "SELECT * FROM play_purchases")).toEqual({
      purchase_token: token, order_id: order.id, play_product_id: "tarot", google_order_id: purchase.orderId, purchase_type: 0, purchased_at: purchase.purchaseTimeMillis,
      consumed_at: T0 + 1000, consume_tried_at: null, refund_sent_at: null, voided_at: null, created_at: T0 + 1000,
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

  it("refuses a purchase made for another account and refunds it at once (revoked), logging the order id only, never consuming it", async () => {
    const db = await setup();
    const { order, token } = await bought(db, { tag: await playAccountTag("u_someone_else") });
    const refund = vi.spyOn(mockPlay, "refund");
    expect(await verify(db, token, "tarot")).toEqual({ ok: false, code: "BAD_REQUEST", message: REFUNDED_REJECTED });
    expect(refund).toHaveBeenCalledWith(await googleOrderOf("tarot", token));
    expect(events(logs.warn)).toEqual([{ evt: "pay.play_mismatch", orderId: order.id }, { evt: "pay.play_rejected_refunded", orderId: order.id }]);
    expect(await row(db, "SELECT status FROM orders WHERE id = ?", order.id)).toEqual({ status: "created" });
    expect([await count(db, "SELECT COUNT(*) AS n FROM payments"), await count(db, "SELECT COUNT(*) AS n FROM play_purchases")]).toEqual([0, 0]);
    expect(await mockPlay.getPurchase("tarot", token)).toMatchObject({ purchaseState: 1, consumptionState: 0 });
  });

  it("refuses and refunds a purchase of another product than the order's, or of no order of ours; an unknown product id never reaches Google", async () => {
    const db = await setup();
    const order = await createOrder(db, { userId: "u_1", product: productById("tarot")!, returnTo: "/", now: T0 });
    mockPlay.addPurchase({ token: "t_saju", playProductId: "saju", accountTag: await playAccountTag("u_1"), profileId: order.id });
    expect(await verify(db, "t_saju", "saju")).toEqual({ ok: false, code: "BAD_REQUEST", message: REFUNDED_REJECTED });
    expect(events(logs.warn)).toContainEqual({ evt: "pay.play_mismatch", orderId: order.id });
    const asked = vi.spyOn(mockPlay, "getPurchase");
    expect(await verify(db, "t_other", "moon_30")).toEqual({ ok: false, code: "BAD_REQUEST" });
    expect(asked).not.toHaveBeenCalled();
    // Google's purchase names no order of ours (made outside the app), or one that does not exist.
    mockPlay.addPurchase({ token: "t_none", playProductId: "tarot", accountTag: await playAccountTag("u_1"), profileId: null });
    mockPlay.addPurchase({ token: "t_ghost", playProductId: "tarot", accountTag: await playAccountTag("u_1"), profileId: "order_that_is_not_there_0" });
    expect(await verify(db, "t_none", "tarot")).toEqual({ ok: false, code: "BAD_REQUEST", message: REFUNDED_REJECTED });
    expect(await verify(db, "t_ghost", "tarot")).toEqual({ ok: false, code: "BAD_REQUEST", message: REFUNDED_REJECTED });
    expect(events(logs.warn)).toContainEqual({ evt: "pay.play_rejected_refunded", orderId: null });
    expect(await count(db, "SELECT COUNT(*) AS n FROM payments")).toBe(0);
  });

  it("refuses and refunds a purchase of more than one (our products are single)", async () => {
    const db = await setup();
    const { order, token } = await bought(db, { quantity: 2 });
    expect(await verify(db, token, "tarot")).toEqual({ ok: false, code: "BAD_REQUEST", message: REFUNDED_REJECTED });
    expect(await row(db, "SELECT status FROM orders WHERE id = ?", order.id)).toEqual({ status: "created" });
    expect(await mockPlay.getPurchase("tarot", token)).toMatchObject({ purchaseState: 1 });
  });

  it("answers a plain BAD_REQUEST when the refund of a rejected purchase fails or Google gave no order id: Google's 3-day expiry stays the fallback", async () => {
    const db = await setup();
    const failed = await bought(db, { tag: "f".repeat(64) });
    vi.spyOn(mockPlay, "refund").mockRejectedValueOnce(new PlayError(503, "UNAVAILABLE"));
    expect(await verify(db, failed.token, "tarot")).toEqual({ ok: false, code: "BAD_REQUEST" });
    expect(events(logs.error)).toContainEqual({ evt: "pay.play_rejected_refund_failed", orderId: failed.order.id, status: 503 });
    const noOrder = await bought(db, { tag: "f".repeat(64) });
    const held = (await mockPlay.getPurchase("tarot", noOrder.token))!;
    vi.spyOn(mockPlay, "getPurchase").mockResolvedValueOnce({ ...held, orderId: null });
    const refund = vi.mocked(mockPlay.refund);
    refund.mockClear();
    expect(await verify(db, noOrder.token, "tarot")).toEqual({ ok: false, code: "BAD_REQUEST" });
    expect(refund).not.toHaveBeenCalled();
  });

  it("refunds a second purchase for an order a first one paid, and keeps the first granted", async () => {
    const db = await setup();
    const { order, token } = await bought(db);
    expect((await verify(db, token, "tarot")).ok).toBe(true);
    mockPlay.addPurchase({ token: "t_second", playProductId: "tarot", accountTag: await playAccountTag("u_1"), profileId: order.id });
    const refund = vi.spyOn(mockPlay, "refund");
    expect(await verify(db, "t_second", "tarot", T0 + 2000)).toEqual({ ok: false, code: "BAD_REQUEST", message: REFUNDED_REJECTED });
    expect(refund.mock.calls).toEqual([[await googleOrderOf("tarot", "t_second")]]);
    expect(await row(db, "SELECT o.status AS o, l.status AS l FROM orders o JOIN credit_lots l ON l.order_id = o.id WHERE o.id = ?", order.id)).toEqual({ o: "paid", l: "active" });
    expect(await mockPlay.getPurchase("tarot", token)).toMatchObject({ purchaseState: 0, consumptionState: 1 });
    expect((await db.prepare("SELECT purchase_token FROM play_purchases").all()).results).toEqual([{ purchase_token: token }]);
  });

  it("answers a verify that lost the race to another verify of the same token like the winner, and never refunds it", async () => {
    const db = await setup();
    const { order, token } = await bought(db);
    // The loser asks Google first, and hears back only after the winner recorded the purchase: it then reads the order paid.
    const google = mockPlay.getPurchase;
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const waiting = new Promise<void>((resolve) => (entered = resolve));
    vi.spyOn(mockPlay, "getPurchase").mockImplementationOnce(async (productId, purchaseToken) => {
      entered();
      await held;
      return google(productId, purchaseToken);
    });
    const refund = vi.spyOn(mockPlay, "refund");
    const loser = verify(db, token, "tarot", T0 + 1000);
    await waiting;
    const winner = await verify(db, token, "tarot", T0 + 1001);
    release();
    expect(winner).toMatchObject({ ok: true, order: { id: order.id, status: "paid" } });
    expect(await loser).toMatchObject({ ok: true, order: { id: order.id, status: "paid" } });
    // And both at once: one records it, the other answers the same.
    const both = await bought(db);
    const outcomes = await Promise.all([verify(db, both.token, "tarot"), verify(db, both.token, "tarot")]);
    expect(outcomes.map((outcome) => outcome.ok)).toEqual([true, true]);
    expect(refund).not.toHaveBeenCalled();
    expect(await count(db, "SELECT COUNT(*) AS n FROM credit_lots")).toBe(2);
  });

  it("answers a recorded token by its order as it is now: refunded → PAY_FAILED, being refunded → PAY_PENDING", async () => {
    const db = await setup();
    const { order, token } = await bought(db);
    await verify(db, token, "tarot");
    await db.prepare("UPDATE orders SET status = 'refunding' WHERE id = ?").bind(order.id).run();
    expect(await verify(db, token, "tarot")).toEqual({ ok: false, code: "PAY_PENDING" });
    await db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").bind(order.id).run();
    expect(await verify(db, token, "tarot")).toEqual({ ok: false, code: "PAY_FAILED", message: "이미 환불된 결제예요." });
  });

  it("records a promo code's or a rewarded purchase by its type, as not a real sale", async () => {
    const db = await setup();
    const promo = await bought(db, { purchaseType: 1 });
    expect((await verify(db, promo.token, "tarot")).ok).toBe(true);
    const real = await bought(db);
    expect((await verify(db, real.token, "tarot")).ok).toBe(true);
    expect((await db.prepare("SELECT order_id, purchase_type FROM play_purchases ORDER BY created_at, order_id").all()).results).toEqual(
      expect.arrayContaining([{ order_id: promo.order.id, purchase_type: 1 }, { order_id: real.order.id, purchase_type: null }]),
    );
  });

  it("refuses a token Google answers 400 for (malformed or forged): BAD_REQUEST and only a warning, never pending", async () => {
    const db = await setup();
    vi.spyOn(mockPlay, "getPurchase").mockRejectedValueOnce(new PlayError(400, "INVALID_ARGUMENT"));
    expect(await verify(db, "t_forged", "tarot")).toEqual({ ok: false, code: "BAD_REQUEST" });
    expect(events(logs.error)).toEqual([]);
    expect(events(logs.warn)).toEqual([{ evt: "pay.play_bad_token", status: 400, reason: "INVALID_ARGUMENT", token: hex("t_forged").slice(0, 12) }]);
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

  it("never grants or consumes a purchase that arrives for a deleted account: it is recorded, then refunded at once", async () => {
    const db = await setup();
    const { order, token } = await bought(db);
    await db.prepare("UPDATE users SET deleted_at = ?").bind(T0).run();
    const consume = vi.spyOn(mockPlay, "consume");
    const refund = vi.spyOn(mockPlay, "refund");
    const outcome = await verify(db, token, "tarot");
    expect(outcome).toEqual({ ok: false, code: "PAY_FAILED", message: PLAY_ORPHAN_MESSAGE });
    expect(PLAY_ORPHAN_MESSAGE).not.toMatch(/카드/);
    expect(refund).toHaveBeenCalledWith(await googleOrderOf("tarot", token));
    expect(await row(db, "SELECT status, fail_code FROM orders WHERE id = ?", order.id)).toEqual({ status: "refunded", fail_code: "ACCOUNT_DELETED" });
    expect(await count(db, "SELECT COUNT(*) AS n FROM credit_lots")).toBe(0);
    expect(await row(db, "SELECT mode, status, canceled_amount FROM payments")).toEqual({ mode: "play", status: "CANCELED", canceled_amount: 2900 });
    expect(await row(db, "SELECT consumed_at, voided_at FROM play_purchases")).toEqual({ consumed_at: null, voided_at: T0 + 1000 });
    expect(consume).not.toHaveBeenCalled();
    expect(events(logs.warn)).toContainEqual({ evt: "pay.play_for_deleted_account", orderId: order.id });
    expect(await verify(db, token, "tarot")).toEqual({ ok: false, code: "PAY_FAILED", message: PLAY_ORPHAN_MESSAGE });
    // The cron never consumes it either.
    expect(await consumePendingPlay(db, mockPlay, T0 + 2000, 10)).toBe(0);
  });

  it("leaves a deleted account's purchase `refunding` when its refund fails: Google's voided list closes it later", async () => {
    const db = await setup();
    const { order, token } = await bought(db);
    await db.prepare("UPDATE users SET deleted_at = ?").bind(T0).run();
    vi.spyOn(mockPlay, "refund").mockRejectedValueOnce(new PlayError(503, "UNAVAILABLE"));
    expect(await verify(db, token, "tarot")).toEqual({ ok: false, code: "PAY_FAILED", message: PLAY_ORPHAN_MESSAGE });
    expect(await row(db, "SELECT status, fail_code FROM orders WHERE id = ?", order.id)).toEqual({ status: "refunding", fail_code: "ACCOUNT_DELETED" });
    expect(await row(db, "SELECT voided_at FROM play_purchases")).toEqual({ voided_at: null });
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

  it("asks Google first: one consumed already (its answer lost) is only recorded, never consumed again", async () => {
    const db = await setup();
    const { token } = await bought(db);
    const googleConsume = mockPlay.consume;
    vi.spyOn(mockPlay, "consume").mockImplementationOnce(async (productId, purchaseToken) => {
      await googleConsume(productId, purchaseToken);
      throw new PlayError(0, "NETWORK");
    });
    expect((await verify(db, token, "tarot")).ok).toBe(true);
    expect(await row(db, "SELECT consumed_at FROM play_purchases")).toEqual({ consumed_at: null });
    const consume = vi.mocked(mockPlay.consume);
    consume.mockClear();
    expect(await consumePendingPlay(db, mockPlay, T0 + DAY, 10)).toBe(1);
    expect(consume).not.toHaveBeenCalled();
    expect(await row(db, "SELECT consumed_at, consume_tried_at FROM play_purchases")).toEqual({ consumed_at: T0 + DAY, consume_tried_at: T0 + DAY });
  });

  it("leaves a purchase Google canceled to the voided list, and moves one it cannot consume behind newer ones", async () => {
    const db = await setup();
    vi.spyOn(mockPlay, "consume").mockRejectedValue(new PlayError(503, "UNAVAILABLE"));
    const stuck = await bought(db, { token: "t_stuck" });
    await verify(db, stuck.token, "tarot", T0 + 1);
    const canceled = await bought(db, { token: "t_canceled" });
    await verify(db, canceled.token, "tarot", T0 + 2);
    const newer = await bought(db, { token: "t_newer" });
    await verify(db, newer.token, "tarot", T0 + 3);
    const held = (await mockPlay.getPurchase("tarot", canceled.token))!;
    const google = mockPlay.getPurchase;
    vi.spyOn(mockPlay, "getPurchase").mockImplementation(async (productId, token) => (token === canceled.token ? { ...held, purchaseState: 1 } : google(productId, token)));
    const tried = vi.mocked(mockPlay.consume);
    tried.mockClear();
    // t_stuck keeps failing; t_canceled is never consumed; each run takes the one least recently tried.
    expect(await consumePendingPlay(db, mockPlay, T0 + DAY, 1)).toBe(0);
    expect(await consumePendingPlay(db, mockPlay, T0 + DAY + 1, 1)).toBe(0);
    tried.mockImplementation(async () => {});
    expect(await consumePendingPlay(db, mockPlay, T0 + DAY + 2, 1)).toBe(1);
    expect(tried.mock.calls).toEqual([["tarot", "t_stuck"], ["tarot", "t_newer"]]);
    expect(await row(db, "SELECT consumed_at FROM play_purchases WHERE purchase_token = 't_canceled'")).toEqual({ consumed_at: null });
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
    // Undecided: moved behind the others.
    expect(await row(db, "SELECT updated_at FROM orders WHERE id = ?", auth.order.id)).toEqual({ updated_at: T0 + 16 * MIN });
  });

  it("moves a refund it cannot decide behind the others, never guesses, and reports it stuck an hour after the refund was sent", async () => {
    const db = await setup();
    const unknown = await paid(db);
    const later = await paid(db);
    vi.spyOn(mockPlay, "refund").mockRejectedValue(new PlayError(503, "UNAVAILABLE"));
    expect(await refund(db, unknown.order.id, T0 + 5 * MIN)).toEqual({ ok: false, code: "PAY_PENDING" });
    expect(await refund(db, later.order.id, T0 + 6 * MIN)).toEqual({ ok: false, code: "PAY_PENDING" });
    expect(await row(db, "SELECT refund_sent_at FROM play_purchases WHERE order_id = ?", unknown.order.id)).toEqual({ refund_sent_at: T0 + 5 * MIN });
    // Google no longer knows the token: nothing tells what became of the refund.
    const google = mockPlay.getPurchase;
    const asked = vi.spyOn(mockPlay, "getPurchase").mockImplementation(async (productId, token) => (token === unknown.token ? null : google(productId, token)));
    expect(await reconcilePlayRefunds(db, mockPlay, T0 + 20 * MIN, 1)).toBe(0);
    expect(asked.mock.calls.map(([, token]) => token)).toEqual([unknown.token]);
    expect(await reconcilePlayRefunds(db, mockPlay, T0 + 21 * MIN, 1)).toBe(1);
    expect(asked.mock.calls.map(([, token]) => token)).toEqual([unknown.token, later.token]);
    expect(await state(db, later.order.id)).toEqual({ order: { status: "paid" }, lots: [{ status: "active", units_left: 1 }] });
    expect(events(logs.error).filter((line: Record<string, unknown>) => line.evt === "pay.play_refund_stuck")).toEqual([]);
    expect(await reconcilePlayRefunds(db, mockPlay, T0 + 65 * MIN, 1)).toBe(0);
    expect(events(logs.error)).toContainEqual({ evt: "pay.play_refund_stuck", orderId: unknown.order.id });
    expect(await state(db, unknown.order.id)).toEqual({ order: { status: "refunding" }, lots: [{ status: "refunding", units_left: 0 }] });
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

  it("closes a deleted account's purchase once Google refunded it (our own refund of it having failed)", async () => {
    const db = await setup();
    const { order, token } = await bought(db);
    await db.prepare("UPDATE users SET deleted_at = ?").bind(T0).run();
    vi.spyOn(mockPlay, "refund").mockRejectedValueOnce(new PlayError(503, "UNAVAILABLE"));
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
