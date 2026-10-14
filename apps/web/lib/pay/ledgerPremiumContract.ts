import { expect, it } from "vitest";
import type { D1Binding } from "@/lib/db/d1";
import { RESERVATION_MS, extendUnlock, grantStatements, releaseUnlock, reserveUnlock, sweepUser } from "./ledger";

const NOW = Date.parse("2026-10-20T03:00:00Z");

async function seedUser(db: D1Binding, id: string) {
  await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES (?, ?, '별', ?, 0, 0)").bind(id, `k_${id}`, `c_${id}`).run();
}

/** A paid lot without an order (admin source), earmarked for `productId` (null = any standard reading). */
async function paidLot(db: D1Binding, userId: string, id: string, productId: string | null, units = 1) {
  await db.batch(grantStatements(db, { id, userId, currency: "paid", source: "admin", orderId: null, productId, units, expiresAt: null }, NOW));
}

const reserve = (db: D1Binding, productId: string, now: number) =>
  reserveUnlock(db, { userId: "u_1", productId, currency: "paid", now, payMode: "live", earmarked: true });

export function premiumLedgerContract(open: () => Promise<D1Binding>) {
  it("opens a premium reading only from a lot earmarked for it", async () => {
    const db = await open();
    await seedUser(db, "u_1");
    await paidLot(db, "u_1", "lot_any", null, 30);
    expect(await reserve(db, "match", NOW)).toEqual({ ok: false });
    await paidLot(db, "u_1", "lot_match", "match");
    expect(await reserve(db, "match", NOW)).toMatchObject({ ok: true, allocations: [["lot_match", 1]] });
  });

  it("keeps a reservation alive while a long reading is written, and only for its owner", async () => {
    const db = await open();
    await seedUser(db, "u_1");
    await seedUser(db, "u_2");
    await paidLot(db, "u_1", "lot_ny", "newyear-2027");
    const r = await reserve(db, "newyear-2027", NOW);
    if (!r.ok) throw new Error("not reserved");
    expect(await extendUnlock(db, { unlockId: r.unlockId, userId: "u_2", now: NOW + 60_000 })).toBe(false);
    expect(await extendUnlock(db, { unlockId: r.unlockId, userId: "u_1", now: NOW + 300_000 })).toBe(true);
    // Past the first expiry the lot is still held; past the extended one the sweep gives it back.
    const unitsLeft = async () => (await db.prepare("SELECT units_left FROM credit_lots WHERE id = 'lot_ny'").first<{ units_left: number }>())!.units_left;
    await sweepUser(db, "u_1", NOW + RESERVATION_MS + 1);
    expect(await unitsLeft()).toBe(0);
    await sweepUser(db, "u_1", NOW + 300_000 + RESERVATION_MS + 1);
    expect(await unitsLeft()).toBe(1);
  });

  it("lets a resume token claim its next part once: only while its part count equals part_seq, which the claim bumps", async () => {
    const db = await open();
    await seedUser(db, "u_1");
    await paidLot(db, "u_1", "lot_ny", "newyear-2027");
    const r = await reserveUnlock(db, { userId: "u_1", productId: "newyear-2027", currency: "paid", now: NOW, payMode: "live", earmarked: true, partSeq: 1 });
    if (!r.ok) throw new Error("not reserved");
    const partSeq = async () => (await db.prepare("SELECT part_seq FROM unlocks WHERE id = ?").bind(r.unlockId).first<{ part_seq: number }>())!.part_seq;
    expect(await partSeq()).toBe(1);
    expect(await extendUnlock(db, { unlockId: r.unlockId, userId: "u_1", now: NOW + 1, parts: 0 })).toBe(false);
    const twins = await Promise.all([1, 1].map((parts) => extendUnlock(db, { unlockId: r.unlockId, userId: "u_1", now: NOW + 2, parts })));
    expect(twins.sort()).toEqual([false, true]);
    expect(await partSeq()).toBe(2);
    expect(await extendUnlock(db, { unlockId: r.unlockId, userId: "u_1", now: NOW + 3 })).toBe(true);
    expect(await partSeq()).toBe(2);
    expect(await extendUnlock(db, { unlockId: r.unlockId, userId: "u_1", now: NOW + 4, parts: 2 })).toBe(true);
    expect(await partSeq()).toBe(3);
  });

  it("does not revive a reservation that was released or had expired", async () => {
    const db = await open();
    await seedUser(db, "u_1");
    await paidLot(db, "u_1", "lot_d", "tarot-deep");
    const r = await reserve(db, "tarot-deep", NOW);
    if (!r.ok) throw new Error("not reserved");
    expect(await releaseUnlock(db, { unlockId: r.unlockId, now: NOW + 1 })).toBe(true);
    expect(await extendUnlock(db, { unlockId: r.unlockId, userId: "u_1", now: NOW + 2 })).toBe(false);
    const again = await reserve(db, "tarot-deep", NOW + 3);
    if (!again.ok) throw new Error("not reserved");
    expect(await extendUnlock(db, { unlockId: again.unlockId, userId: "u_1", now: NOW + 3 + RESERVATION_MS + 1 })).toBe(false);
  });
}
