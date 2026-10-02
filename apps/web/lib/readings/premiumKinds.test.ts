import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import { insertReadingStatement, newReadingId, type ServerChapter } from "./store";

const DIR = new URL("../../migrations/", import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const P5 = files.find((f) => f.endsWith("_premium_readings.sql"))!;
const SECRET = "account-secret-for-tests-0123456789abcdef";

const row = (id: string, kind: string, unlockId: string | null = null) =>
  `INSERT INTO readings (id, user_id, kind, product_id, source, unlock_id, payload, key_version, created_at, updated_at) VALUES ('${id}', 'u_1', '${kind}', '${kind}', 'paid', ${unlockId ? `'${unlockId}'` : "NULL"}, 'x', 1, 1, 1)`;

describe("premium reading kinds", () => {
  it("keeps the readings saved before the migration and accepts the premium kinds after it", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    for (const file of files.filter((f) => f < P5)) db.exec(readFileSync(new URL(file, DIR), "utf8"));
    const shape = () => ({
      columns: db.prepare("PRAGMA table_info(readings)").all(),
      index: db.prepare("PRAGMA index_info(readings_user)").all(),
    });
    const before = shape();
    db.exec("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_1', 'k_1', '별', 'c_1', 0, 0)");
    db.exec(row("r_old", "tarot", "ul_old"));
    expect(() => db.exec(row("r_early", "match"))).toThrow(/CHECK/);
    db.exec(readFileSync(new URL(P5, DIR), "utf8"));
    expect(db.prepare("SELECT id, kind, unlock_id FROM readings").all()).toEqual([{ id: "r_old", kind: "tarot", unlock_id: "ul_old" }]);
    // Only the kind CHECK widened: the same columns, the same index, the same other constraints.
    expect(shape()).toEqual(before);
    for (const kind of ["tarot-deep", "match", "newyear-2027"]) db.exec(row(`r_${kind}`, kind, `ul_${kind}`));
    expect(() => db.exec(row("r_bad", "other"))).toThrow(/CHECK/);
    expect(() => db.exec(row("r_dup", "match", "ul_match"))).toThrow(/UNIQUE/);
    expect(() => db.exec(row("r_src", "match").replace("'paid'", "'claimed'"))).toThrow(/CHECK/);
    expect(() => db.exec(row("r_orphan", "match").replace("'u_1'", "'u_404'"))).toThrow(/FOREIGN KEY/);
  });

  it("saves a premium chapter through the store", async () => {
    const db = migratedTestD1();
    await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_1', 'k_1', '별', 'c_1', 0, 0)").run();
    const chapter: ServerChapter = { kind: "match", reading: { verdict: "v" }, chapterToken: "t", createdAt: 1, turns: [], followUpsLeft: 5 };
    await (await insertReadingStatement(db, SECRET, { id: newReadingId(), userId: "u_1", productId: "match", source: "paid", unlockId: null, chapter, now: 1 })).run();
    expect(await db.prepare("SELECT kind FROM readings").first()).toEqual({ kind: "match" });
  });
});
