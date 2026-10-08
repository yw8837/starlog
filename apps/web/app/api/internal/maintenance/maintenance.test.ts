import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret } from "@/lib/account/secrets";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { RESERVATION_MS, reserveUnlock } from "@/lib/pay/ledger";
import { GIFT_CLAIM_KEEP_MS, RECORD_KEEP_MS, TOSS_CALLS_PER_RUN, TOSS_DEADLINE_MS, runMaintenance } from "@/lib/pay/maintenance";
import { mockToss } from "@/lib/pay/tossMock";
import { TossError } from "@/lib/pay/tossTypes";
import { insertReadingStatement, newReadingId } from "@/lib/readings/store";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as confirm } from "../../pay/confirm/route";
import { POST as ordersPost } from "../../pay/orders/route";
import { POST as refund } from "../../pay/refund/route";
import { POST as maintenance } from "./route";

const T0 = Date.parse("2026-10-01T03:00:00Z");
/** A purchase on 10-01 KST can be refunded on request through the end of 10-08 KST. */
const UNTIL = "2026-10-08T14:59:59.999Z";
const MIN = 60_000;
const CRON = "cron-secret-for-tests-0123456789abcdef";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  vi.stubEnv("STARLOG_CRON_SECRET", CRON);
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

const run = (token: string | null = CRON) =>
  maintenance(new Request("https://starlog.yeolmaeapps.kr/api/internal/maintenance", { method: "POST", headers: token === null ? {} : { authorization: `Bearer ${token}` } }));
const report = async () => (await (await run()).json()) as Record<string, number>;
const one = (db: D1Binding, sql: string) => db.prepare(sql).first();

async function loggedIn(name = "alice", ip = "198.51.100.40"): Promise<Browser> {
  const b = browser(ip);
  await loginAs(b, name);
  return b;
}

/** A 24-character order id. */
const oid = (n: number) => `order_${String(n).padStart(18, "0")}`;

async function insertOrder(db: D1Binding, input: { id: string; userId: string; status: string; at: number; productId?: string; failCode?: string; attempt?: number }) {
  await db
    .prepare(
      `INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, payment_key, fail_code, cancel_attempt, created_at, updated_at)
       VALUES (?, ?, ?, 2900, 'x', ?, '/', 0, ?, ?, ?, ?, ?)`,
    )
    .bind(input.id, input.userId, input.productId ?? "tarot", input.status, `mock_${input.id}`, input.failCode ?? null, input.attempt ?? 1, input.at, input.at)
    .run();
}

const userIdOf = async (db: D1Binding) => (await db.prepare("SELECT id FROM users ORDER BY created_at LIMIT 1").first<{ id: string }>())!.id;
const updatedAt = async (db: D1Binding, id: string) => (await db.prepare("SELECT updated_at FROM orders WHERE id = ?").bind(id).first<{ updated_at: number }>())!.updated_at;

async function newOrder(b: Browser): Promise<string> {
  return ((await (await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true }, origin: true })).json()) as { orderId: string }).orderId;
}

describe("the Cron Trigger's route", () => {
  it("runs only for the Cron Trigger's bearer secret", async () => {
    useTestDb();
    expect((await run(null)).status).toBe(403);
    expect((await run("wrong-secret-0123456789abcdef-0123")).status).toBe(403);
    expect((await run()).status).toBe(200);
    vi.stubEnv("STARLOG_CRON_SECRET", "");
    expect((await run()).status).toBe(503);
  });
});

describe("maintenance", () => {
  it("settles a payment Toss approved while nobody was asking", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await newOrder(b);
    mockToss.failNext("confirm", new TossError(500, "FAILED_INTERNAL_SYSTEM_PROCESSING", ""), { applied: true });
    expect((await b.send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_left", orderId, amount: 2900 }, origin: true })).status).toBe(409);
    vi.setSystemTime(T0 + 31_000);
    expect(await report()).toMatchObject({ confirming: 1 });
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "paid" });
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot", refundUntil: UNTIL }]);
  });

  it("puts back a refund Toss never did, and retries a deleted account's payment until it is cancelled", async () => {
    const db = useTestDb();
    const alice = await loggedIn("alice");
    const refunded = await buy(alice);
    mockToss.failNext("cancel", new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", ""));
    expect((await alice.send(refund, "/api/pay/refund", { body: { orderId: refunded }, origin: true })).status).toBe(409);

    const bob = await loggedIn("bob", "198.51.100.41");
    const orphan = await newOrder(bob);
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = (SELECT user_id FROM orders WHERE id = ?)").bind(T0, orphan).run();
    mockToss.failNext("cancel", new TossError(500, "FAILED_INTERNAL_SYSTEM_PROCESSING", ""));
    expect((await browser("192.0.2.90").send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_orphan", orderId: orphan, amount: 2900 }, origin: true })).status).toBe(402);
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orphan).first()).toEqual({ status: "refunding" });

    vi.setSystemTime(T0 + 10 * MIN + 1);
    expect(await report()).toMatchObject({ refunding: 2 });
    expect(await db.prepare("SELECT status, cancel_attempt FROM orders WHERE id = ?").bind(refunded).first()).toEqual({ status: "paid", cancel_attempt: 2 });
    expect((await me(alice)).user?.unused).toEqual([{ orderId: refunded, productId: "tarot", refundUntil: UNTIL }]);
    expect(await db.prepare("SELECT status, cancel_attempt FROM orders WHERE id = ?").bind(orphan).first()).toEqual({ status: "refunded", cancel_attempt: 2 });
    expect((await mockToss.getPaymentByOrder(orphan)).status).toBe("CANCELED");
  });

  it("leaves a refund paid under other Toss keys to the operator: never sent to Toss", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const orderId = await buy(b);
    mockToss.failNext("cancel", new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", ""));
    expect((await b.send(refund, "/api/pay/refund", { body: { orderId }, origin: true })).status).toBe(409);
    await db.prepare("UPDATE payments SET mode = 'test'").run();
    const lookUp = vi.spyOn(mockToss, "getPayment");
    vi.setSystemTime(T0 + 10 * MIN + 1);
    expect(await report()).toMatchObject({ refunding: 0 });
    expect(lookUp).not.toHaveBeenCalled();
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "refunding" });
  });

  it("does the work that needs no Toss first, and an item that fails stops nothing", async () => {
    const db = useTestDb();
    await loggedIn("alice");
    const userId = await userIdOf(db);
    // Recording this one throws (an unknown product); the next one is fine.
    await insertOrder(db, { id: oid(1), userId, status: "confirming", at: T0 - 20 * MIN, productId: "bogus" });
    await insertOrder(db, { id: oid(2), userId, status: "confirming", at: T0 - 19 * MIN });
    for (const id of [oid(1), oid(2)]) await mockToss.confirm({ paymentKey: `mock_${id}`, orderId: id, amount: 2900 });
    await loggedIn("bob", "198.51.100.41");
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id <> ?").bind(T0, userId).run();
    const realLookUp = mockToss.getPaymentByOrder;
    let erasedBeforeToss: boolean | null = null;
    vi.spyOn(mockToss, "getPaymentByOrder").mockImplementation(async (orderId) => {
      erasedBeforeToss ??= (await one(db, "SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NOT NULL AND erased_at IS NULL"))?.n === 0;
      return realLookUp(orderId);
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await report()).toMatchObject({ confirming: 2, failed: 1, erased: 1 });
    expect(erasedBeforeToss).toBe(true);
    expect(await one(db, `SELECT status FROM orders WHERE id = '${oid(2)}'`)).toEqual({ status: "paid" });
    // Only the event, the order id and a code: never a message.
    expect(error).toHaveBeenCalledWith(JSON.stringify({ evt: "cron.confirm_failed", orderId: oid(1), code: "Error" }));
  });

  it("asks Toss at most TOSS_CALLS_PER_RUN times a run, oldest first; the rest waits for the next run", async () => {
    const db = useTestDb();
    await loggedIn();
    const userId = await userIdOf(db);
    const total = TOSS_CALLS_PER_RUN + 5;
    for (let n = 1; n <= total; n++) await insertOrder(db, { id: oid(n), userId, status: "confirming", at: T0 - 60 * MIN + n });
    const lookUps = vi.spyOn(mockToss, "getPaymentByOrder");
    // A confirming order may take two calls (the look-up, then a lost confirm sent again): each starts only with room for both.
    const first = await report();
    expect(first).toMatchObject({ confirming: TOSS_CALLS_PER_RUN - 1, refunding: 0 });
    expect(lookUps).toHaveBeenCalledTimes(TOSS_CALLS_PER_RUN - 1);
    expect(TOSS_CALLS_PER_RUN).toBeLessThanOrEqual(30);
    expect(await one(db, `SELECT status FROM orders WHERE id = '${oid(total)}'`)).toEqual({ status: "confirming" });
    expect(await report()).toMatchObject({ confirming: total - first.confirming! });
    expect(await one(db, "SELECT COUNT(*) AS n FROM orders WHERE status = 'confirming'")).toEqual({ n: 0 });
  });

  it("stops starting Toss work once the run's deadline has passed", async () => {
    const db = useTestDb();
    await loggedIn();
    const userId = await userIdOf(db);
    for (let n = 1; n <= 3; n++) await insertOrder(db, { id: oid(n), userId, status: "confirming", at: T0 - 60 * MIN + n });
    let clock = T0;
    vi.spyOn(mockToss, "getPaymentByOrder").mockImplementation(async () => {
      clock += TOSS_DEADLINE_MS;
      throw new TossError(404, "NOT_FOUND_PAYMENT", "");
    });
    expect(await runMaintenance(db, mockToss, T0, { clock: () => clock })).toMatchObject({ confirming: 1 });
  });

  it("puts what it cannot decide behind the others: failed look-ups, a stuck orphan, a partial cancel", async () => {
    const db = useTestDb();
    await loggedIn();
    const userId = await userIdOf(db);
    const old = T0 - 30 * MIN;
    await insertOrder(db, { id: oid(1), userId, status: "confirming", at: old });
    await insertOrder(db, { id: oid(2), userId, status: "refunding", at: old });
    await insertOrder(db, { id: oid(3), userId, status: "refunding", at: old, failCode: "ACCOUNT_DELETED", attempt: 5 });
    await insertOrder(db, { id: oid(4), userId, status: "refunding", at: old });
    for (const id of [oid(3), oid(4)]) {
      await mockToss.confirm({ paymentKey: `mock_${id}`, orderId: id, amount: 2900 });
      await db.prepare("INSERT INTO payments (payment_key, order_id, total_amount, status, mode, updated_at) VALUES (?, ?, 2900, 'DONE', 'mock', 0)").bind(`mock_${id}`, id).run();
    }
    vi.spyOn(mockToss, "getPaymentByOrder").mockRejectedValue(new TossError(500, "FAILED_INTERNAL_SYSTEM_PROCESSING", ""));
    const realGet = mockToss.getPayment;
    vi.spyOn(mockToss, "getPayment").mockImplementation(async (key) => {
      if (key === `mock_${oid(2)}`) throw new TossError(500, "FAILED_INTERNAL_SYSTEM_PROCESSING", "");
      const payment = await realGet(key);
      return key === `mock_${oid(4)}` ? { ...payment, status: "PARTIAL_CANCELED", balanceAmount: 900 } : payment;
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await report()).toMatchObject({ confirming: 1, refunding: 3 });
    for (const n of [1, 2, 3, 4]) expect(await updatedAt(db, oid(n)), oid(n)).toBe(T0);
    expect(await one(db, `SELECT status, cancel_attempt FROM orders WHERE id = '${oid(3)}'`)).toEqual({ status: "refunding", cancel_attempt: 5 });
  });

  it("closes an order nobody paid within the hour", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const stale = await newOrder(b);
    vi.setSystemTime(T0 + 30 * MIN);
    const fresh = await newOrder(b);
    vi.setSystemTime(T0 + 60 * MIN + 1);
    expect(await report()).toMatchObject({ abandoned: 1 });
    expect(await one(db, `SELECT status, fail_code FROM orders WHERE id = '${stale}'`)).toEqual({ status: "failed", fail_code: "ABANDONED" });
    expect(await one(db, `SELECT status FROM orders WHERE id = '${fresh}'`)).toEqual({ status: "created" });
  });

  it("tries a deleted account's payment five times in all, each under its own key, then leaves it to the operator", async () => {
    const db = useTestDb();
    const bob = await loggedIn("bob");
    const orphan = await newOrder(bob);
    await db.prepare("UPDATE users SET deleted_at = ?").bind(T0).run();
    const keys: string[] = [];
    vi.spyOn(mockToss, "cancel").mockImplementation(async (_paymentKey, input) => {
      keys.push(input.idempotencyKey);
      throw new TossError(403, "NOT_CANCELABLE_PAYMENT", "취소 할 수 없는 결제 입니다.");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await browser("192.0.2.92").send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_orphan_5", orderId: orphan, amount: 2900 }, origin: true })).status).toBe(402);
    for (let run = 1; run <= 6; run++) {
      vi.setSystemTime(T0 + run * 11 * MIN);
      await report();
    }
    expect(keys).toEqual([1, 2, 3, 4, 5].map((n) => `cancel-${orphan}-${n}`));
    expect(error).toHaveBeenCalledWith(JSON.stringify({ evt: "pay.orphan_refund_stuck", orderId: orphan }));
  });

  it("returns any account's stale reservation", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const userId = (await db.prepare("SELECT id FROM users").first<{ id: string }>())!.id;
    expect((await reserveUnlock(db, { userId, productId: "tarot", currency: "free", now: T0, payMode: "mock" })).ok).toBe(true);
    vi.setSystemTime(T0 + RESERVATION_MS + 1);
    expect(await report()).toMatchObject({ released: 1 });
    expect(await one(db, "SELECT status FROM unlocks")).toEqual({ status: "released" });
    expect((await me(b)).user?.gift?.status).toBe("unused");
  });

  it("finishes an erase that a deletion did not", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    await buy(b);
    const userId = (await db.prepare("SELECT id FROM users").first<{ id: string }>())!.id;
    const chapter = { kind: "tarot" as const, reading: { verdict: "v" }, chapterToken: "t", createdAt: T0, turns: [], followUpsLeft: 3 };
    await (await insertReadingStatement(db, accountSecret()!, { id: newReadingId(), userId, productId: "tarot", source: "paid", unlockId: null, chapter, now: T0 })).run();
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = ?").bind(T0, userId).run();
    expect(await report()).toMatchObject({ erased: 1 });
    expect(await one(db, "SELECT kakao_key, nickname, erased_at FROM users")).toEqual({ kakao_key: null, nickname: null, erased_at: T0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
    expect(await one(db, "SELECT account_deleted_at FROM gift_claims")).toEqual({ account_deleted_at: T0 });
  });

  it("purges sessions, year-old gift claims of deleted accounts, and records past five years", async () => {
    const db = useTestDb();
    await loggedIn("alice");
    await db.batch([
      db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at, deleted_at, erased_at) VALUES ('u_old', NULL, NULL, 'c_old', 0, 0, 1, 1)"),
      db.prepare("INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at) VALUES ('order_old_000000000000001', 'u_old', 'tarot', 2900, 'x', 'paid', '/', 0, ?, ?)").bind(T0 - RECORD_KEEP_MS - 1, T0 - RECORD_KEEP_MS - 1),
      db.prepare("INSERT INTO payments (payment_key, order_id, total_amount, status, mode, updated_at) VALUES ('pk_old', 'order_old_000000000000001', 2900, 'DONE', 'live', 0)"),
      db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at, deleted_at, erased_at) VALUES ('u_recent', NULL, NULL, 'c_recent', 0, 0, 1, 1)"),
      db.prepare("INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at) VALUES ('order_recent_00000000001', 'u_recent', 'tarot', 2900, 'x', 'refunded', '/', 0, ?, ?)").bind(T0 - 1000, T0 - 1000),
      db.prepare("INSERT INTO gift_claims (kakao_key, claimed_at, account_deleted_at) VALUES ('k_gone', 0, ?)").bind(T0 - GIFT_CLAIM_KEEP_MS - 1),
      db.prepare("INSERT INTO gift_claims (kakao_key, claimed_at, account_deleted_at) VALUES ('k_kept', 0, ?)").bind(T0 - 1000),
      db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('s_old', 'u_recent', 0, ?)").bind(T0 - 1),
      // A reading an interrupted erase left behind does not stop the purge.
      db.prepare("INSERT INTO readings (id, user_id, kind, product_id, source, payload, key_version, created_at, updated_at) VALUES ('r_old', 'u_old', 'tarot', 'tarot', 'paid', 'p', 1, 0, 0)"),
    ]);
    expect(await report()).toMatchObject({ sessions: 1, giftClaims: 1, purgedAccounts: 1 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM users WHERE id = 'u_old'")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM payments WHERE payment_key = 'pk_old'")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM users WHERE id = 'u_recent'")).toEqual({ n: 1 });
    expect((await db.prepare("SELECT kakao_key FROM gift_claims ORDER BY kakao_key").all<{ kakao_key: string }>()).results.map((r) => r.kakao_key)).toEqual(expect.arrayContaining(["k_kept"]));
    expect(await one(db, "SELECT COUNT(*) AS n FROM gift_claims WHERE kakao_key = 'k_gone'")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM users WHERE nickname IS NOT NULL")).toEqual({ n: 1 });
  });
});
