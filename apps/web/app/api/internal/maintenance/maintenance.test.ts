import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret } from "@/lib/account/secrets";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { RESERVATION_MS, reserveUnlock } from "@/lib/pay/ledger";
import { GIFT_CLAIM_KEEP_MS, RECORD_KEEP_MS } from "@/lib/pay/maintenance";
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
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
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
    expect((await me(alice)).user?.unused).toEqual([{ orderId: refunded, productId: "tarot" }]);
    expect(await db.prepare("SELECT status, cancel_attempt FROM orders WHERE id = ?").bind(orphan).first()).toEqual({ status: "refunded", cancel_attempt: 2 });
    expect((await mockToss.getPaymentByOrder(orphan)).status).toBe("CANCELED");
  });

  it("returns any account's stale reservation", async () => {
    const db = useTestDb();
    const b = await loggedIn();
    const userId = (await db.prepare("SELECT id FROM users").first<{ id: string }>())!.id;
    expect((await reserveUnlock(db, { userId, productId: "tarot", currency: "free", units: 10, now: T0 })).ok).toBe(true);
    vi.setSystemTime(T0 + RESERVATION_MS + 1);
    expect(await report()).toMatchObject({ released: 1 });
    expect(await one(db, "SELECT status FROM unlocks")).toEqual({ status: "released" });
    expect((await me(b)).user?.stardust).toBe(10);
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
    ]);
    expect(await report()).toMatchObject({ sessions: 1, giftClaims: 1, purgedAccounts: 1 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM users WHERE id = 'u_old'")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM payments WHERE payment_key = 'pk_old'")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM users WHERE id = 'u_recent'")).toEqual({ n: 1 });
    expect((await db.prepare("SELECT kakao_key FROM gift_claims ORDER BY kakao_key").all<{ kakao_key: string }>()).results.map((r) => r.kakao_key)).toEqual(expect.arrayContaining(["k_kept"]));
    expect(await one(db, "SELECT COUNT(*) AS n FROM gift_claims WHERE kakao_key = 'k_gone'")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM users WHERE nickname IS NOT NULL")).toEqual({ n: 1 });
  });
});
