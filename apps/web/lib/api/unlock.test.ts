import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { D1Binding } from "@/lib/db/d1";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import { grantStatements, reserveUnlock } from "@/lib/pay/ledger";
import { settlementFor, type UnlockPlan } from "./unlock";

const NOW = Date.parse("2026-10-25T03:00:00Z");

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const one = (db: D1Binding, sql: string) => db.prepare(sql).first();

async function planFor(db: D1Binding): Promise<UnlockPlan> {
  const r = await reserveUnlock(db, { userId: "u_1", productId: "tarot", currency: "paid", now: NOW, payMode: "live" });
  if (!r.ok) throw new Error("not reserved");
  return {
    method: "paid", productId: "tarot", first: null, spend: undefined, paidCost: true,
    save: { db, accountSecret: "account-secret-for-tests-0123456789abcdef", userId: "u_1", source: "paid", unlockId: r.unlockId },
  };
}

describe("standard settlement", () => {
  it("gives the purchase back on a failure, counting it toward the restore cap only when the model began writing (L-1)", async () => {
    const db = migratedTestD1();
    await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_1', 'k_1', '별', 'c_1', 0, 0)").run();
    await db.batch(grantStatements(db, { id: "lot_t", userId: "u_1", currency: "paid", source: "admin", orderId: null, productId: "tarot", units: 1, expiresAt: null }, NOW));
    const chapterOf = () => {
      throw new Error("nothing is saved");
    };
    await settlementFor(await planFor(db), chapterOf, NOW)!.release(false);
    await settlementFor(await planFor(db), chapterOf, NOW)!.release(true);
    expect(await one(db, "SELECT units_left FROM credit_lots WHERE id = 'lot_t'")).toEqual({ units_left: 1 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'restore' AND idem_key LIKE 'restore:%'")).toEqual({ n: 1 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'restore' AND idem_key LIKE 'restore-began:%'")).toEqual({ n: 1 });
  });
});
