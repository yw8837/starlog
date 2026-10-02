import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { D1Binding } from "./d1";
import { isConstraintError } from "./sqlErrors";
import { openLocalD1 } from "./testing/localD1";

/** The same constraint behaviour on real local D1 (workerd). Skipped with CI_NO_WORKERD=1, like P3's int test. */
describe.skipIf(process.env.CI_NO_WORKERD === "1")("P4 schema on local D1", () => {
  let db: D1Binding;
  let dispose: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    ({ db, dispose } = await openLocalD1());
  }, 120_000);

  afterAll(async () => {
    await dispose?.();
  });

  it("rolls back a reservation batch whose lot would go below zero, and upserts with RETURNING", async () => {
    await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_1', 'k1', '별', 'c_1', 0, 0)").run();
    await db.prepare("INSERT INTO credit_lots (id, user_id, currency, source, units_total, units_left, created_at) VALUES ('lot_1', 'u_1', 'free', 'gift', 10, 10, 0)").run();
    await expect(
      db.batch([
        db.prepare("INSERT INTO unlocks (id, user_id, product_id, currency, allocations, status, reserved_until, created_at) VALUES ('ul_1', 'u_1', 'tarot', 'free', '[]', 'reserved', 1, 0)"),
        db.prepare("UPDATE credit_lots SET units_left = CASE WHEN status = 'active' THEN units_left - 11 ELSE -1 END WHERE id = 'lot_1'"),
      ]),
    ).rejects.toSatisfy(isConstraintError);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM unlocks").first()).toEqual({ n: 0 });
    const upsert = await db
      .prepare(
        `INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_2', 'k1', '달', 'c_2', 1, 1)
         ON CONFLICT (kakao_key) DO UPDATE SET nickname = excluded.nickname RETURNING id, nickname`,
      )
      .first();
    expect(upsert).toEqual({ id: "u_1", nickname: "달" });
  });
});
