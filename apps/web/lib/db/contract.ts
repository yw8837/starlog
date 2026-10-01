import { expect, it } from "vitest";
import type { BondsRepo, ConstellationRow, OwnerRow, StarRow } from "./bondsRepo";

/**
 * Behaviour every BondsRepo must have. The memory implementation runs it in memoryBondsRepo.test.ts,
 * the D1 one against local D1 (the real SQL and migration) in d1BondsRepo.int.test.ts.
 */

const basis = { dayStem: "丙", yearBranch: "巳", dayBranch: "寅", elements: { 목: 1, 화: 3, 토: 1, 금: 0, 수: 1 }, uncertain: false };
const owner = (id: string, nickname: string, rankingPublic = true): OwnerRow =>
  ({ id, nickname, rankingPublic, basis, lastRefillAt: null, createdAt: 1, joinsDay: null, joinsCount: 0 });
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
    await repo.insertInvite({ code: "ABCDEF", ownerId: "o1", createdAt: 7, revokedAt: null });
    expect(await repo.invitesSince("o1", 0)).toBe(2);
    expect(await repo.invitesSince("o1", 5)).toBe(1);
  });

  it("round-trips an owner (basis, flags) and updates in place", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    await repo.upsertOwner({ ...owner("o1", "새이름", false), lastRefillAt: 42, createdAt: 99, joinsDay: "2026-10-01", joinsCount: 9 });
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
    expect(await repo.starsOf("c1")).toHaveLength(1);
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

  it("keeps one constellation per sign and only one being filled per owner", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    await repo.upsertOwner(owner("o2", "다른"));
    await repo.insertConstellation(con("c1", "o1", 0, null, "aries"));
    await expect(repo.insertConstellation(con("c2", "o1", 0, null, "leo"))).rejects.toThrow();
    await repo.insertConstellation(con("c3", "o1", 300, 5, "leo"));
    await expect(repo.insertConstellation(con("c4", "o1", 300, 6, "leo"))).rejects.toThrow();
    await expect(repo.updateConstellation("c3", { status: "filling", completedAt: null })).rejects.toThrow();
    await repo.insertConstellation(con("c5", "o2", 0, null, "aries"));
    await repo.deleteConstellation("c1");
    await repo.updateConstellation("c3", { status: "filling", completedAt: null });
    expect((await repo.fillingOf("o1"))?.id).toBe("c3");
  });

  it("joins a star in one step: recount, complete on the last slot, count the join event", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    await repo.insertConstellation(con("c1", "o1", 0, null));
    const s0 = { ...star("s0", "c1", 0, "f0"), score: 80 };
    let after = await repo.joinStar(s0, 2, "2026-10-01", 500);
    expect(after).toMatchObject({ status: "filling", total: 80, completedAt: null });
    after = await repo.joinStar({ ...star("s1", "c1", 1, "f1"), score: 70 }, 2, "2026-10-01", 600);
    expect(after).toMatchObject({ status: "complete", total: 150, completedAt: 600 });
    expect(await repo.getOwner("o1")).toMatchObject({ joinsDay: "2026-10-01", joinsCount: 2 });
    // a new day starts the count again
    await repo.deleteStar("s1");
    await repo.updateConstellation("c1", { status: "filling", completedAt: null });
    await repo.joinStar({ ...star("s2", "c1", 1, "f2"), score: 60 }, 3, "2026-10-02", 700);
    expect(await repo.getOwner("o1")).toMatchObject({ joinsDay: "2026-10-02", joinsCount: 1 });
    // upsertOwner never resets the counters
    await repo.upsertOwner(owner("o1", "다른이름"));
    expect(await repo.getOwner("o1")).toMatchObject({ nickname: "다른이름", joinsCount: 1 });
  });

  it("starts the next sign in the same step when a join completes a constellation", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    await repo.insertConstellation(con("c1", "o1", 0, null));
    const next = { id: "c2", sign: "taurus" as const };
    await repo.joinStar({ ...star("s0", "c1", 0, "f0"), score: 80 }, 2, "2026-10-01", 500, next);
    expect(await repo.getConstellation("c2")).toBeNull(); // not complete yet: nothing starts
    const after = await repo.joinStar({ ...star("s1", "c1", 1, "f1"), score: 70 }, 2, "2026-10-01", 600, next);
    expect(after).toMatchObject({ status: "complete", completedAt: 600 });
    expect(await repo.fillingOf("o1")).toMatchObject({ id: "c2", sign: "taurus", status: "filling", total: 0, startedAt: 600 });
  });

  it("does not start a next sign the owner already has", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    await repo.insertConstellation(con("done", "o1", 300, 5, "taurus"));
    await repo.insertConstellation(con("c1", "o1", 0, null));
    await repo.joinStar({ ...star("s0", "c1", 0, "f0"), score: 80 }, 1, "2026-10-01", 600, { id: "c2", sign: "taurus" });
    expect(await repo.getConstellation("c1")).toMatchObject({ status: "complete" });
    expect(await repo.getConstellation("c2")).toBeNull();
    expect(await repo.fillingOf("o1")).toBeNull();
  });

  it("writes nothing when any part of a join fails (all or nothing)", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    await repo.insertConstellation(con("c1", "o1", 0, null));
    await repo.joinStar({ ...star("s0", "c1", 0, "f0"), score: 80 }, 4, "2026-10-01", 500);
    await expect(repo.joinStar({ ...star("s1", "c1", 0, "f1"), score: 99 }, 1, "2026-10-01", 600)).rejects.toThrow();
    expect(await repo.getConstellation("c1")).toMatchObject({ status: "filling", total: 80, completedAt: null });
    expect(await repo.getOwner("o1")).toMatchObject({ joinsCount: 1 });
    expect((await repo.starsOf("c1")).map((s) => s.id)).toEqual(["s0"]);
  });

  it("recounts from the stars and keeps an earlier completion time", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    await repo.insertConstellation(con("c1", "o1", 0, null));
    await repo.insertStar({ ...star("a", "c1", 0, "f0"), score: 70 });
    await repo.insertStar({ ...star("b", "c1", 1, "f1"), score: 75 });
    await repo.tally("c1", 3, 100);
    expect(await repo.getConstellation("c1")).toMatchObject({ status: "filling", total: 145, completedAt: null });
    await repo.tally("c1", 2, 200);
    expect(await repo.getConstellation("c1")).toMatchObject({ status: "complete", total: 145, completedAt: 200 });
    await repo.tally("c1", 2, 300);
    expect((await repo.getConstellation("c1"))?.completedAt).toBe(200);
  });

  it("counts removals and switches per owner per day", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    expect(await repo.bumpActions("o1", "2026-10-01")).toBe(1);
    expect(await repo.bumpActions("o1", "2026-10-01")).toBe(2);
    expect(await repo.bumpActions("o1", "2026-10-02")).toBe(1);
  });

  it("gives every sign's top entries since a time in one call, with the ranking's order and visibility", async () => {
    const repo = await make();
    for (const [id, name, pub] of [["a", "가", true], ["b", "나", true], ["c", "다", false], ["d", "라", true], ["e", "마", true]] as const) {
      await repo.upsertOwner(owner(id, name, pub));
    }
    await repo.insertConstellation(con("ca", "a", 350, 200));
    await repo.insertConstellation(con("cb", "b", 350, 100));
    await repo.insertConstellation(con("cc", "c", 390, 150));
    await repo.insertConstellation(con("cd", "d", 300, 300));
    await repo.insertConstellation(con("ce", "e", 400, 50));
    await repo.insertConstellation(con("cl", "a", 380, 250, "leo"));
    await repo.insertConstellation(con("cf", "b", 999, null, "leo"));
    const tops = await repo.topsBySign(100, 3);
    expect(tops.map((t) => [t.sign, t.rank, t.nickname, t.total])).toEqual([
      ["aries", 1, "나", 350],
      ["aries", 2, "가", 350],
      ["aries", 3, "라", 300],
      ["leo", 1, "가", 380],
    ]);
    expect((await repo.topsBySign(0, 1)).map((t) => t.nickname)).toEqual(["마", "가"]);
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
