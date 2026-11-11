import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { D1Binding } from "./d1";
import { accountDb, setTestDb } from "./index";
import { isConstraintError } from "./sqlErrors";
import { migratedTestD1 } from "./testing/migrate";

const insertUser = (db: D1Binding, id: string, key: string | null) =>
  db
    .prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES (?, ?, '별', ?, 0, 0)")
    .bind(id, key, `c_${id}`);

const MIGRATIONS = fileURLToPath(new URL("../../migrations/", import.meta.url));

const count = async (db: D1Binding, table: string) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

describe("test D1 with every migration applied", () => {
  afterEach(() => setTestDb(null));

  it("creates the P4 tables next to P3's", async () => {
    const db = migratedTestD1();
    const { results } = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(
      expect.arrayContaining(["owners", "meta", "credit_lots", "gift_claims", "ledger", "orders", "payments", "readings", "sessions", "unlocks", "users"]),
    );
  });

  it("rolls a whole batch back when one statement breaks a constraint", async () => {
    const db = migratedTestD1();
    await expect(db.batch([insertUser(db, "u_1", "k1"), insertUser(db, "u_2", "k1")])).rejects.toSatisfy(isConstraintError);
    expect(await count(db, "users")).toBe(0);
  });

  it("keeps a lot's units between 0 and its total", async () => {
    const db = migratedTestD1();
    await insertUser(db, "u_1", "k1").run();
    await db
      .prepare("INSERT INTO credit_lots (id, user_id, currency, source, units_total, units_left, created_at) VALUES ('lot_1', 'u_1', 'free', 'gift', 10, 10, 0)")
      .run();
    await expect(db.prepare("UPDATE credit_lots SET units_left = units_left - 11 WHERE id = 'lot_1'").run()).rejects.toSatisfy(isConstraintError);
    await expect(db.prepare("UPDATE credit_lots SET units_left = units_left + 1 WHERE id = 'lot_1'").run()).rejects.toSatisfy(isConstraintError);
    expect(await db.prepare("SELECT units_left FROM credit_lots WHERE id = 'lot_1'").first()).toEqual({ units_left: 10 });
  });

  it("enforces foreign keys, as D1 does", async () => {
    const db = migratedTestD1();
    await expect(
      db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('s1', 'nobody', 0, 1)").run(),
    ).rejects.toSatisfy(isConstraintError);
  });

  it("returns RETURNING rows and counts changes", async () => {
    const db = migratedTestD1();
    await insertUser(db, "u_1", "k1").run();
    const row = await db.prepare("UPDATE users SET nickname = '달' WHERE id = ? RETURNING id, nickname").bind("u_1").first();
    expect(row).toEqual({ id: "u_1", nickname: "달" });
    const none = await db.prepare("UPDATE users SET nickname = '해' WHERE id = ? RETURNING id").bind("nobody").first();
    expect(none).toBeNull();
    const [first, second] = await db.batch([
      db.prepare("UPDATE users SET nickname = '별' WHERE id = 'u_1'"),
      db.prepare("UPDATE users SET nickname = '별' WHERE id = 'nobody'"),
    ]);
    expect([first!.meta?.changes, second!.meta?.changes]).toEqual([1, 0]);
  });

  it("0023 lets one order hold several lots (the set), one per product, keeping every lot, index and foreign key", async () => {
    const before = migratedTestD1({ without: "0023_" });
    await insertUser(before, "u_1", "k1").run();
    await before
      .prepare(
        `INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at)
         VALUES ('o_1', 'u_1', 'tarot', 2900, 't', 'paid', '/', 0, 0, 0)`,
      )
      .run();
    await before.batch([
      before.prepare("INSERT INTO credit_lots (id, user_id, currency, source, order_id, product_id, units_total, units_left, status, expires_at, created_at) VALUES ('lot_o_1', 'u_1', 'paid', 'order', 'o_1', 'tarot', 1, 0, 'active', NULL, 5)"),
      before.prepare("INSERT INTO credit_lots (id, user_id, currency, source, units_total, units_left, status, expires_at, created_at) VALUES ('lot_g', 'u_1', 'free', 'gift', 10, 10, 'expired', 99, 6)"),
    ]);
    // The old schema refused a second lot for one order.
    await expect(
      before.prepare("INSERT INTO credit_lots (id, user_id, currency, source, order_id, product_id, units_total, units_left, created_at) VALUES ('lot_2', 'u_1', 'paid', 'order', 'o_1', 'match', 1, 1, 0)").run(),
    ).rejects.toSatisfy(isConstraintError);
    const rows = async () => (await before.prepare("SELECT * FROM credit_lots ORDER BY id").all()).results;
    const kept = await rows();
    const migration = readdirSync(MIGRATIONS).find((name) => name.startsWith("0023_"))!;
    before.exec(readFileSync(`${MIGRATIONS}${migration}`, "utf8"));
    expect(await rows()).toEqual(kept);
    const indexes = (await before.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'credit_lots' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>()).results.map((r) => r.name);
    expect(indexes).toEqual(["credit_lots_expiry", "credit_lots_order", "credit_lots_order_product", "credit_lots_user"]);
    // Now a second lot of another product goes in; a second of the same product, a lot of no known order or user, or an invalid count does not.
    await before.prepare("INSERT INTO credit_lots (id, user_id, currency, source, order_id, product_id, units_total, units_left, created_at) VALUES ('lot_2', 'u_1', 'paid', 'order', 'o_1', 'match', 1, 1, 0)").run();
    for (const sql of [
      "INSERT INTO credit_lots (id, user_id, currency, source, order_id, product_id, units_total, units_left, created_at) VALUES ('lot_3', 'u_1', 'paid', 'order', 'o_1', 'match', 1, 1, 0)",
      "INSERT INTO credit_lots (id, user_id, currency, source, order_id, product_id, units_total, units_left, created_at) VALUES ('lot_4', 'u_1', 'paid', 'order', 'nope', 'match', 1, 1, 0)",
      "INSERT INTO credit_lots (id, user_id, currency, source, units_total, units_left, created_at) VALUES ('lot_5', 'nobody', 'free', 'gift', 1, 1, 0)",
      "INSERT INTO credit_lots (id, user_id, currency, source, units_total, units_left, created_at) VALUES ('lot_6', 'u_1', 'free', 'gift', 1, 2, 0)",
    ]) await expect(before.prepare(sql).run(), sql).rejects.toSatisfy(isConstraintError);
    // Gifts and admin grants name no order: any number of them.
    await before.prepare("INSERT INTO credit_lots (id, user_id, currency, source, product_id, units_total, units_left, created_at) VALUES ('lot_7', 'u_1', 'free', 'gift', 'tarot', 1, 1, 0)").run();
    await before.prepare("INSERT INTO credit_lots (id, user_id, currency, source, product_id, units_total, units_left, created_at) VALUES ('lot_8', 'u_1', 'free', 'gift', 'tarot', 1, 1, 0)").run();
  });

  it("0024 lets a payment be a Google Play one, keeping every payment and its foreign key, and records Play purchases once per token", async () => {
    const before = migratedTestD1({ without: "0024_" });
    await insertUser(before, "u_1", "k1").run();
    for (const id of ["o_1", "o_2", "o_3"]) {
      await before
        .prepare(
          `INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at)
           VALUES (?, 'u_1', 'tarot', 2900, 't', 'paid', '/', 0, 0, 0)`,
        )
        .bind(id)
        .run();
    }
    await before.batch([
      before.prepare("INSERT INTO payments (payment_key, order_id, method, total_amount, status, approved_at, receipt_url, canceled_amount, canceled_at, mode, updated_at) VALUES ('pk_1', 'o_1', '카드', 2900, 'PARTIAL_CANCELED', 'a', 'r', 900, 'c', 'live', 7)"),
      before.prepare("INSERT INTO payments (payment_key, order_id, total_amount, status, mode, updated_at) VALUES ('pk_2', 'o_2', 2900, 'DONE', 'test', 8)"),
    ]);
    const playPayment = "INSERT INTO payments (payment_key, order_id, total_amount, status, mode, updated_at) VALUES ('play_x', 'o_3', 2900, 'DONE', 'play', 9)";
    await expect(before.prepare(playPayment).run()).rejects.toSatisfy(isConstraintError);
    const rows = async () => (await before.prepare("SELECT * FROM payments ORDER BY payment_key").all()).results;
    const kept = await rows();
    const migration = readdirSync(MIGRATIONS).find((name) => name.startsWith("0024_"))!;
    before.exec(readFileSync(`${MIGRATIONS}${migration}`, "utf8"));
    expect(await rows()).toEqual(kept);
    await before.prepare(playPayment).run();
    for (const sql of [
      "INSERT INTO payments (payment_key, order_id, total_amount, status, mode, updated_at) VALUES ('pk_9', 'o_1', 2900, 'DONE', 'live', 0)",
      "INSERT INTO payments (payment_key, order_id, total_amount, status, mode, updated_at) VALUES ('pk_9', 'nope', 2900, 'DONE', 'live', 0)",
      "INSERT INTO payments (payment_key, order_id, total_amount, status, mode, updated_at) VALUES ('pk_9', 'o_2', 2900, 'DONE', 'other', 0)",
    ]) await expect(before.prepare(sql).run(), sql).rejects.toSatisfy(isConstraintError);
    const purchase = (token: string, orderId: string) =>
      before.prepare("INSERT INTO play_purchases (purchase_token, order_id, play_product_id, created_at) VALUES (?, ?, 'tarot', 0)").bind(token, orderId);
    await purchase("token_1", "o_3").run();
    expect(await before.prepare("SELECT google_order_id, purchase_type, purchased_at, consumed_at, consume_tried_at, refund_sent_at, voided_at FROM play_purchases").first()).toEqual({
      google_order_id: null, purchase_type: null, purchased_at: null, consumed_at: null, consume_tried_at: null, refund_sent_at: null, voided_at: null,
    });
    // One row per token and per order, and only for an order that exists.
    for (const [token, orderId] of [["token_1", "o_2"], ["token_2", "o_3"], ["token_3", "nope"]] as const) {
      await expect(purchase(token, orderId).run(), token).rejects.toSatisfy(isConstraintError);
    }
    const indexes = (await before.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'play_purchases' AND name NOT LIKE 'sqlite_%'").all<{ name: string }>()).results;
    expect(indexes).toEqual([{ name: "play_purchases_unconsumed" }]);
  });

  it("refuses undefined like D1", async () => {
    const db = migratedTestD1();
    await expect(db.prepare("SELECT ?").bind(undefined).first()).rejects.toThrow(/undefined/);
  });

  it("accountDb() is the test database while one is set, and null without Workers", () => {
    expect(accountDb()).toBeNull();
    const db = migratedTestD1();
    setTestDb(db);
    expect(accountDb()).toBe(db);
  });
});
