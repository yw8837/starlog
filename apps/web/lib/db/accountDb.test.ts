import { afterEach, describe, expect, it } from "vitest";
import type { D1Binding } from "./d1";
import { accountDb, setTestDb } from "./index";
import { isConstraintError } from "./sqlErrors";
import { migratedTestD1 } from "./testing/migrate";

const insertUser = (db: D1Binding, id: string, key: string | null) =>
  db
    .prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES (?, ?, '별', ?, 0, 0)")
    .bind(id, key, `c_${id}`);

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
