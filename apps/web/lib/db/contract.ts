import { expect, it } from "vitest";
import type { BondsRepo, ConstellationRow, OwnerRow, StarRow } from "./bondsRepo";

/**
 * Behaviour every BondsRepo must have. The memory implementation runs it in memoryBondsRepo.test.ts,
 * the D1 one against local D1 (the real SQL and migration) in d1BondsRepo.int.test.ts.
 */

const basis = { dayStem: "丙", yearBranch: "巳", dayBranch: "寅", elements: { 목: 1, 화: 3, 토: 1, 금: 0, 수: 1 }, uncertain: false };
const owner = (id: string, nickname: string, rankingPublic = true): OwnerRow => ({ id, nickname, rankingPublic, basis, lastRefillAt: null, createdAt: 1 });
const con = (id: string, ownerId: string, total: number, completedAt: number | null, sign: ConstellationRow["sign"] = "aries"): ConstellationRow =>
  ({ id, ownerId, sign, status: completedAt ? "complete" : "filling", total, startedAt: 1, completedAt });
const star = (id: string, constellationId: string, slot: number, friendKey: string, createdAt = 10 + slot): StarRow =>
  ({ id, constellationId, slot, nickname: `별${slot}`, message: null, cardId: "wands-01", orientation: "upright", score: 80, parts: [], friendKey, createdAt });

export function bondsRepoContract(make: () => Promise<BondsRepo> | BondsRepo) {
  it("stores owners, invites and revokes old codes", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    expect((await repo.getOwner("o1"))?.nickname).toBe("용우");
    await repo.insertInvite({ code: "K7M4QX", ownerId: "o1", createdAt: 1, revokedAt: null });
    expect((await repo.activeInvite("o1"))?.code).toBe("K7M4QX");
    await repo.revokeInvites("o1", 5);
    expect(await repo.activeInvite("o1")).toBeNull();
    expect((await repo.inviteByCode("K7M4QX"))?.revokedAt).toBe(5);
    expect(await repo.inviteByCode("ZZZZZZ")).toBeNull();
  });

  it("round-trips an owner (basis, flags) and updates in place", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    await repo.upsertOwner({ ...owner("o1", "새이름", false), lastRefillAt: 42, createdAt: 99 });
    const row = await repo.getOwner("o1");
    expect(row).toEqual({ ...owner("o1", "새이름", false), lastRefillAt: 42, createdAt: 1 });
    expect(await repo.getOwner("nobody")).toBeNull();
  });

  it("keeps stars unique per slot and per friend, and deletes them with the constellation", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    await repo.insertConstellation(con("c1", "o1", 0, null));
    await repo.insertStar(star("s0", "c1", 0, "f0"));
    await expect(repo.insertStar(star("s1", "c1", 0, "f1"))).rejects.toThrow();
    await expect(repo.insertStar(star("s2", "c1", 1, "f0"))).rejects.toThrow();
    expect((await repo.fillingOf("o1"))?.id).toBe("c1");
    expect(await repo.starsSince("o1", 0)).toBe(1);
    await repo.deleteConstellation("c1");
    expect(await repo.starsOf("c1")).toEqual([]);
    expect(await repo.getConstellation("c1")).toBeNull();
    expect(await repo.fillingOf("o1")).toBeNull();
  });

  it("returns stars in slot order with their parts, and deletes one star", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    await repo.insertConstellation(con("c1", "o1", 0, null));
    const parts = [{ id: "stem-combine" as const, points: 12, text: "두 분의 일간이 서로 합을 이루는 사이예요" }];
    await repo.insertStar({ ...star("s2", "c1", 2, "f2"), message: "반가워", parts });
    await repo.insertStar(star("s0", "c1", 0, "f0"));
    const stars = await repo.starsOf("c1");
    expect(stars.map((s) => s.slot)).toEqual([0, 2]);
    expect(stars[1]).toEqual({ ...star("s2", "c1", 2, "f2"), message: "반가워", parts });
    await repo.deleteStar("s0");
    expect((await repo.starsOf("c1")).map((s) => s.id)).toEqual(["s2"]);
  });

  it("updates status, total and completion, and lists completed ones", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    await repo.insertConstellation(con("c1", "o1", 0, null));
    await repo.updateConstellation("c1", { status: "complete", total: 321, completedAt: 77 });
    expect(await repo.getConstellation("c1")).toEqual({ ...con("c1", "o1", 321, 77) });
    expect(await repo.fillingOf("o1")).toBeNull();
    expect((await repo.completedOf("o1")).map((c) => c.id)).toEqual(["c1"]);
    await repo.updateConstellation("c1", { status: "filling", completedAt: null });
    expect((await repo.fillingOf("o1"))?.total).toBe(321);
    expect(await repo.completedOf("o1")).toEqual([]);
  });

  it("counts an owner's stars since a time, across their constellations", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    await repo.upsertOwner(owner("o2", "다른"));
    await repo.insertConstellation(con("c1", "o1", 0, 5));
    await repo.insertConstellation(con("c2", "o1", 0, null, "leo"));
    await repo.insertConstellation(con("c3", "o2", 0, null));
    await repo.insertStar(star("a", "c1", 0, "f0", 100));
    await repo.insertStar(star("b", "c2", 0, "f0", 200));
    await repo.insertStar(star("c", "c2", 1, "f1", 300));
    await repo.insertStar(star("d", "c3", 0, "f0", 300));
    expect(await repo.starsSince("o1", 0)).toBe(3);
    expect(await repo.starsSince("o1", 200)).toBe(2);
    expect(await repo.starsSince("o2", 301)).toBe(0);
  });

  it("ranks complete, public constellations by total then earlier completion", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("a", "가"));
    await repo.upsertOwner(owner("b", "나"));
    await repo.upsertOwner(owner("c", "다", false));
    await repo.upsertOwner(owner("d", "라"));
    await repo.insertConstellation(con("ca", "a", 350, 200));
    await repo.insertConstellation(con("cb", "b", 350, 100));
    await repo.insertConstellation(con("cc", "c", 390, 150));
    await repo.insertConstellation(con("cd", "d", 400, null));
    await repo.insertConstellation(con("ce", "d", 380, 120, "leo"));
    expect((await repo.ranking("aries", null, 50)).map((e) => e.nickname)).toEqual(["나", "가"]);
    expect((await repo.ranking("aries", null, 50))[0]).toEqual({ constellationId: "cb", nickname: "나", total: 350, completedAt: 100 });
    expect(await repo.rankOf("ca", null)).toBe(2);
    expect(await repo.rankOf("cb", null)).toBe(1);
    expect(await repo.rankOf("cc", null)).toBeNull();
    expect(await repo.rankOf("cd", null)).toBeNull();
    expect(await repo.rankOf("nope", null)).toBeNull();
    expect((await repo.ranking("aries", 150, 50)).map((e) => e.nickname)).toEqual(["가"]);
    expect(await repo.rankOf("ca", 150)).toBe(1);
    expect(await repo.rankOf("cb", 150)).toBeNull();
    expect((await repo.ranking("aries", null, 1)).map((e) => e.nickname)).toEqual(["나"]);
    expect((await repo.ranking("leo", null, 50)).map((e) => e.nickname)).toEqual(["라"]);
  });
}
