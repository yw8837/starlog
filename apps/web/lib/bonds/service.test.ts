import { describe, expect, it, vi } from "vitest";
import { bondBasis, bondScore } from "@starlog/core";
import { createMemoryBondsRepo } from "@/lib/db/memoryBondsRepo";
import { CONSTELLATIONS } from "@starlog/core";
import {
  BondsError, RANKING_LIMIT, chooseSign, inviteOf, invitePage, joinStar, joinedView, nextSignAfter, ownerView, rankingView, refill, regenerateInvite, removeStar, resolveInvite, saveOwner,
  switchSign, todayBondCard,
} from "./service";

const HOUR = 3_600_000;
const me = { calendar: "solar" as const, year: 1990, month: 1, day: 1 };
const friends = [
  { calendar: "solar" as const, year: 1991, month: 5, day: 12 },
  { calendar: "solar" as const, year: 1992, month: 8, day: 3 },
  { calendar: "solar" as const, year: 1988, month: 11, day: 20 },
  { calendar: "solar" as const, year: 1995, month: 2, day: 28 },
];

async function setup() {
  const repo = createMemoryBondsRepo();
  const t0 = Date.UTC(2026, 9, 1, 3);
  await saveOwner(repo, t0, "o1", { nickname: "용우", birth: me });
  const { code } = await inviteOf(repo, t0, "o1");
  return { repo, t0, code };
}
const join = (repo: ReturnType<typeof createMemoryBondsRepo>, now: number, code: string, i: number) =>
  joinStar(repo, now, { code, friendKey: `f${i}`, nickname: `친구${i}`, birth: friends[i]!, pick: i, message: null });

describe("bonds service", () => {
  it("does not store the owner's birth date", async () => {
    const { repo } = await setup();
    expect(JSON.stringify(await repo.getOwner("o1"))).not.toContain("1990");
  });

  it("needs a chosen sign before friends can join", async () => {
    const { repo, t0, code } = await setup();
    await expect(join(repo, t0, code, 0)).rejects.toMatchObject({ code: "CHOOSING" });
    expect(await resolveInvite(repo, code)).toMatchObject({ ownerNickname: "용우", sign: null, filled: 0 });
  });

  it("fills the chosen sign in order, scores each friend, and completes on the last slot", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await join(repo, t0 + i, code, i));
    expect(results.map((r) => r.star.slot)).toEqual([0, 1, 2, 3]);
    expect(results.map((r) => r.completed)).toEqual([false, false, false, true]);
    const expected = friends.map((f) => bondScore(bondBasis(me), bondBasis(f)).score);
    expect(results.map((r) => r.score)).toEqual(expected);
    const view = await ownerView(repo, t0 + 10, "o1");
    // the next sign started by itself, empty
    expect(view.filling?.row.sign).toBe("taurus");
    expect(view.filling?.stars).toEqual([]);
    expect(view.completed[0]).toMatchObject({ sign: "aries", status: "complete", total: expected.reduce((a, b) => a + b, 0) });
    await expect(switchSign(repo, t0, "o1", "aries")).rejects.toMatchObject({ code: "SIGN_COMPLETED" });
  });

  it("explains the score to the friend from the friend's side, and to the owner from the owner's side", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const r = await join(repo, t0, code, 0);
    expect(r.parts).toEqual(bondScore(bondBasis(friends[0]!), bondBasis(me)).parts);
    expect(r.star.parts).toEqual(bondScore(bondBasis(me), bondBasis(friends[0]!)).parts);
    expect(r.bondLine).toMatch(/두 사람 사이/);
    expect(r.card.cardId).toBe(r.star.cardId);
  });

  it("gives the same friend the same score every time and never stores their birth date", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "leo");
    const a = await join(repo, t0, code, 0);
    await switchSign(repo, t0 + 1, "o1", "virgo");
    const b = await join(repo, t0 + 2, code, 0);
    expect(b.score).toBe(a.score);
    expect(JSON.stringify(await repo.starsOf(b.star.constellationId))).not.toContain("1991");
  });

  it("switching mid-way clears the stars and starts the new sign at zero", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "leo");
    await join(repo, t0, code, 0);
    await expect(chooseSign(repo, t0, "o1", "virgo")).rejects.toMatchObject({ code: "FILLING_EXISTS" });
    await switchSign(repo, t0 + 1, "o1", "virgo");
    const view = await ownerView(repo, t0 + 2, "o1");
    expect(view.filling?.row.sign).toBe("virgo");
    expect(view.filling?.stars).toEqual([]);
  });

  it("switching needs a sign in progress", async () => {
    const { repo, t0 } = await setup();
    await expect(switchSign(repo, t0, "o1", "virgo")).rejects.toMatchObject({ code: "NO_FILLING" });
  });

  it("새로 채우기 restarts a completed sign, clears any filling one, and has a 1-hour cooldown", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    for (let i = 0; i < 4; i++) await join(repo, t0, code, i);
    await switchSign(repo, t0, "o1", "libra"); // taurus started by itself; switching it while empty
    await join(repo, t0, code, 0);
    await refill(repo, t0 + 1, "o1", "aries");
    let view = await ownerView(repo, t0 + 2, "o1");
    expect(view.completed).toEqual([]);
    expect(view.filling?.row.sign).toBe("aries");
    expect(view.filling?.stars).toEqual([]);
    // complete aries again with new friends, then try again inside the hour
    for (let i = 0; i < 4; i++) {
      await joinStar(repo, t0 + 3, { code, friendKey: `g${i}`, nickname: `새친구${i}`, birth: friends[i]!, pick: i, message: null });
    }
    await expect(refill(repo, t0 + HOUR / 2, "o1", "aries")).rejects.toMatchObject({ code: "COOLDOWN" });
    await refill(repo, t0 + HOUR + 2, "o1", "aries");
    view = await ownerView(repo, t0 + HOUR + 3, "o1");
    expect(view.filling?.row.sign).toBe("aries");
  });

  it("새로 채우기 only works on a completed sign", async () => {
    const { repo, t0 } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    await expect(refill(repo, t0 + 1, "o1", "aries")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects self-joins, repeat joins and revoked codes", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    await expect(joinStar(repo, t0, { code, friendKey: "x", joinerOwnerId: "o1", nickname: "나야", birth: me, pick: 0, message: null }))
      .rejects.toMatchObject({ code: "SELF_JOIN" });
    await join(repo, t0, code, 0);
    await expect(join(repo, t0, code, 0)).rejects.toMatchObject({ code: "ALREADY_JOINED" });
    const { code: next } = await regenerateInvite(repo, t0, "o1");
    await expect(resolveInvite(repo, code)).rejects.toMatchObject({ code: "BAD_CODE" });
    await expect(resolveInvite(repo, "ZZZZZZ")).rejects.toMatchObject({ code: "BAD_CODE" });
    await expect(resolveInvite(repo, "nope")).rejects.toMatchObject({ code: "BAD_CODE" });
    expect(await resolveInvite(repo, next.toLowerCase())).toMatchObject({ ownerNickname: "용우", sign: "aries", filled: 1, slots: 4 });
  });

  it("checks the friend's input", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const base = { code, friendKey: "k", nickname: "친구", birth: friends[0]!, pick: 0, message: null };
    await expect(joinStar(repo, t0, { ...base, nickname: "가" })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(joinStar(repo, t0, { ...base, message: "가".repeat(41) })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(joinStar(repo, t0, { ...base, pick: 21 })).rejects.toMatchObject({ code: "BAD_INPUT" });
    await expect(joinStar(repo, t0, { ...base, birth: { calendar: "solar", year: 1990, month: 2, day: 30 } })).rejects.toMatchObject({ code: "BAD_INPUT" });
    expect(await repo.starsOf((await repo.fillingOf("o1"))!.id)).toEqual([]);
  });

  it("removing a star from a completed sign makes it incomplete again", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const joined = [];
    for (let i = 0; i < 4; i++) joined.push(await join(repo, t0, code, i));
    await removeStar(repo, t0 + 1, "o1", joined[1]!.star.id);
    const view = await ownerView(repo, t0 + 2, "o1");
    expect(view.completed).toEqual([]);
    expect(view.filling?.stars.map((s) => s.slot)).toEqual([0, 2, 3]);
    expect(view.filling?.row).toMatchObject({ status: "filling", completedAt: null, total: joined[0]!.score + joined[2]!.score + joined[3]!.score });
    // the next friend takes the emptied slot
    const next = await joinStar(repo, t0 + 3, { code, friendKey: "n", nickname: "다시", birth: friends[1]!, pick: 5, message: null });
    expect(next.star.slot).toBe(1);
    expect(next.completed).toBe(true);
  });

  it("removing a star from a completed sign clears the sign being filled (one at a time)", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const joined = [];
    for (let i = 0; i < 4; i++) joined.push(await join(repo, t0, code, i));
    await switchSign(repo, t0, "o1", "libra");
    await joinStar(repo, t0, { code, friendKey: "z", nickname: "천칭", birth: friends[0]!, pick: 0, message: null });
    await removeStar(repo, t0 + 1, "o1", joined[0]!.star.id);
    const view = await ownerView(repo, t0 + 2, "o1");
    expect(view.filling?.row.sign).toBe("aries");
    expect(view.filling?.stars).toHaveLength(3);
    expect(view.completed).toEqual([]);
  });

  it("only lets the owner remove their own stars", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const r = await join(repo, t0, code, 0);
    await saveOwner(repo, t0, "o2", { nickname: "다른사람", birth: friends[1]! });
    await expect(removeStar(repo, t0, "o2", r.star.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shows one all-time ranking with my card, and it never restarts (not on a KST Monday, not weeks later)", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    for (let i = 0; i < 4; i++) await join(repo, t0, code, i);
    const view = await rankingView(repo, t0 + 1, "aries", "o1");
    expect(view.all[0]).toMatchObject({ rank: 1, nickname: "용우", mine: true });
    expect(view.mine?.allRank).toBe(1);
    expect(view.mine?.stars).toHaveLength(4);
    // no weekly board is built any more
    expect(view).not.toHaveProperty("week");
    expect(view.mine).not.toHaveProperty("weekRank");
    // t0 is Thursday 2026-10-01 (KST); one, three and ten weeks later the same record is still on the list
    for (const weeks of [1, 3, 10]) {
      const later = await rankingView(repo, t0 + weeks * 7 * 24 * HOUR, "aries", null);
      expect(later.all[0]).toMatchObject({ rank: 1, nickname: "용우", mine: false });
    }
    // the owner's own rank holds across the Monday 00:00 KST turn too (Sunday 2026-10-04 23:59 → Monday 00:00)
    const sunday = Date.parse("2026-10-04T23:59:00+09:00");
    const monday = Date.parse("2026-10-05T00:00:00+09:00");
    expect((await rankingView(repo, sunday, "aries", "o1")).mine?.allRank).toBe(1);
    expect((await rankingView(repo, monday, "aries", "o1")).mine?.allRank).toBe(1);
    expect((await ownerView(repo, monday, "o1")).ranks).toEqual({ aries: { all: 1 } });
  });

  it("leaves a private owner out of the ranking but still shows them their card", async () => {
    const { repo, t0, code } = await setup();
    await saveOwner(repo, t0, "o1", { nickname: "용우", rankingPublic: false });
    await chooseSign(repo, t0, "o1", "aries");
    for (let i = 0; i < 4; i++) await join(repo, t0, code, i);
    const view = await rankingView(repo, t0 + 1, "aries", "o1");
    expect(view.all).toEqual([]);
    expect(view.mine).toMatchObject({ allRank: null });
  });

  it("gives the home row's light view the latest completion's ranks too, and still skips TOP 5", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    for (let i = 0; i < 4; i++) await join(repo, t0 + i, code, i);
    const rankOf = vi.spyOn(repo, "rankOf");
    const light = await ownerView(repo, t0 + 10, "o1", { light: true });
    expect(light.ranks).toEqual({ aries: { all: 1 } });
    expect(rankOf).toHaveBeenCalledTimes(1); // the all-time rank, indexed
    expect(light.top5).toEqual([]);
    const full = await ownerView(repo, t0 + 10, "o1");
    expect(full.ranks).toEqual(light.ranks);
    expect(full.top5).toHaveLength(4);
  });

  it("looks up no ranks for a light view without a completion, and ranks only the latest completion when there are several", async () => {
    const { repo, t0 } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const rankOf = vi.spyOn(repo, "rankOf");
    expect(await ownerView(repo, t0 + 1, "o1", { light: true })).toMatchObject({ filling: { row: { sign: "aries" } }, completed: [], ranks: {}, top5: [] });
    expect(rankOf).not.toHaveBeenCalled();
    // two completed signs: only the later one is looked up (the same one the full view ranks)
    await repo.insertConstellation({ id: "done-leo", ownerId: "o1", sign: "leo", status: "complete", total: 300, startedAt: t0, completedAt: t0 + 1 });
    await repo.insertConstellation({ id: "done-virgo", ownerId: "o1", sign: "virgo", status: "complete", total: 280, startedAt: t0, completedAt: t0 + 2 });
    const light = await ownerView(repo, t0 + 3, "o1", { light: true });
    expect(light.ranks).toEqual({ virgo: { all: 1 } });
    expect(rankOf).toHaveBeenCalledTimes(1);
    expect((await ownerView(repo, t0 + 3, "o1")).ranks).toEqual(light.ranks);
  });

  it("gives a hidden owner's light view no rank, as the full view does", async () => {
    const { repo, t0, code } = await setup();
    await saveOwner(repo, t0, "o1", { nickname: "용우", rankingPublic: false });
    await chooseSign(repo, t0, "o1", "aries");
    for (let i = 0; i < 4; i++) await join(repo, t0, code, i);
    const light = await ownerView(repo, t0 + 1, "o1", { light: true });
    expect(light.owner.rankingPublic).toBe(false);
    expect(light.ranks).toEqual({ aries: { all: null } });
  });

  it("caps join events per owner per KST day (removed stars still count)", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "pisces");
    const real = repo.getOwner.bind(repo);
    repo.getOwner = async (id) => {
      const row = await real(id);
      return row ? { ...row, joinsDay: "2026-10-01", joinsCount: 20 } : row;
    };
    await expect(join(repo, t0, code, 0)).rejects.toMatchObject({ code: "DAILY_STAR_LIMIT" });
    await expect(join(repo, t0, code, 0)).rejects.toBeInstanceOf(BondsError);
    // the next KST day opens again
    expect((await join(repo, t0 + 24 * HOUR, code, 0)).star.slot).toBe(0);
  });

  it("counts every join event, so remove-and-rejoin cannot dodge the cap", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "pisces");
    const first = await join(repo, t0, code, 0);
    await removeStar(repo, t0, "o1", first.star.id);
    await join(repo, t0, code, 0);
    expect(await repo.getOwner("o1")).toMatchObject({ joinsDay: "2026-10-01", joinsCount: 2 });
  });

  it("fills every slot exactly once when friends join at the same moment", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const birth = friends[0]!;
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => joinStar(repo, t0, { code, friendKey: `c${i}`, nickname: `동시${i}`, birth, pick: i, message: null })),
    );
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof joinStar>>> => r.status === "fulfilled");
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(refused).toEqual([]);
    // four fill 양자리; the two who arrive after it is full go into 황소자리, which started by itself
    const aries = ok.filter((r) => r.value.sign === "aries");
    expect(aries.map((r) => r.value.star.slot).sort()).toEqual([0, 1, 2, 3]);
    expect(ok.filter((r) => r.value.sign === "taurus").map((r) => r.value.star.slot).sort()).toEqual([0, 1]);
    expect(ok.filter((r) => r.value.completed)).toHaveLength(1);
    const view = await ownerView(repo, t0 + 1, "o1");
    expect(view.completed[0]).toMatchObject({ sign: "aries", status: "complete", total: aries.reduce((n, r) => n + r.value.score, 0) });
    expect(view.filling?.row.sign).toBe("taurus");
  });

  it("leaves nothing behind when the join step fails", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const failing = { ...repo, joinStar: async () => Promise.reject(new Error("D1_ERROR: second statement failed")) };
    await expect(join(failing, t0, code, 0)).rejects.toThrow("D1_ERROR");
    const filling = (await repo.fillingOf("o1"))!;
    expect(await repo.starsOf(filling.id)).toEqual([]);
    expect(filling).toMatchObject({ status: "filling", total: 0 });
    expect(await repo.getOwner("o1")).toMatchObject({ joinsCount: 0 });
    expect((await join(repo, t0, code, 0)).star.slot).toBe(0);
  });

  it("completes a constellation that is full but still marked as filling, instead of leaving it stuck", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "libra");
    const filling = (await repo.fillingOf("o1"))!;
    for (let i = 0; i < 4; i++) {
      await repo.insertStar({
        id: `raw${i}`, constellationId: filling.id, slot: i, nickname: `별${i}`, message: null, cardId: "wands-01", orientation: "upright",
        score: 70 + i, parts: [], friendKey: `raw${i}`, createdAt: t0,
      });
    }
    // the friend is not turned away: the stuck sign completes, the next one starts, and they join that
    const joined = await join(repo, t0 + 5, code, 0);
    expect(await repo.getConstellation(filling.id)).toMatchObject({ status: "complete", total: 70 + 71 + 72 + 73, completedAt: t0 + 5 });
    expect(joined).toMatchObject({ sign: "scorpio", completed: false });
    expect(joined.star.slot).toBe(0);
  });

  it("starts the next sign by itself (zodiac order, skipping completed ones, wrapping) so a friend never waits", async () => {
    expect(nextSignAfter("aries", new Set(["aries"]))).toBe("taurus");
    expect(nextSignAfter("aries", new Set(["aries", "taurus", "gemini"]))).toBe("cancer");
    expect(nextSignAfter("pisces", new Set(["pisces"]))).toBe("aries");
    expect(nextSignAfter("leo", new Set(CONSTELLATIONS.map((c) => c.id)))).toBeNull();

    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    for (let i = 0; i < 4; i++) await join(repo, t0, code, i);
    expect(await resolveInvite(repo, code)).toMatchObject({ sign: "taurus", filled: 0, slots: 5, allDone: false });
    // the same friends can be stars again in the new round
    const again = await join(repo, t0 + 1, code, 0);
    expect(again).toMatchObject({ sign: "taurus" });
    expect(again.star.slot).toBe(0);
  });

  it("lets the owner swap the auto-started sign while it is empty", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    for (let i = 0; i < 4; i++) await join(repo, t0, code, i);
    await switchSign(repo, t0 + 1, "o1", "leo");
    const view = await ownerView(repo, t0 + 2, "o1");
    expect(view.filling?.row.sign).toBe("leo");
    expect(view.completed.map((c) => c.sign)).toEqual(["aries"]);
  });

  it("says so when all twelve signs are done", async () => {
    const { repo, t0, code } = await setup();
    // eleven signs completed directly in storage, then the twelfth through joins
    for (const c of CONSTELLATIONS.slice(1)) {
      await repo.insertConstellation({ id: `done-${c.id}`, ownerId: "o1", sign: c.id, status: "complete", total: 300, startedAt: 1, completedAt: 2 });
    }
    await chooseSign(repo, t0, "o1", "aries");
    for (let i = 0; i < 4; i++) await join(repo, t0, code, i);
    const view = await ownerView(repo, t0 + 1, "o1");
    expect(view.filling).toBeNull();
    expect(view.completed).toHaveLength(12);
    expect(await resolveInvite(repo, code)).toMatchObject({ sign: null, allDone: true });
    await expect(joinStar(repo, t0 + 2, { code, friendKey: "late", nickname: "늦은친구", birth: friends[0]!, pick: 0, message: null }))
      .rejects.toMatchObject({ code: "ALL_DONE" });
  });

  it("answers FILLING_EXISTS, not a server error, to a double tap on choose", async () => {
    const { repo, t0 } = await setup();
    const results = await Promise.allSettled([chooseSign(repo, t0, "o1", "aries"), chooseSign(repo, t0, "o1", "aries")]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "FILLING_EXISTS" });
  });

  it("caps star removals and sign switches per owner per day", async () => {
    const { repo, t0 } = await setup();
    await chooseSign(repo, t0, "o1", "leo");
    for (let i = 0; i < 20; i++) await switchSign(repo, t0, "o1", i % 2 ? "leo" : "virgo");
    await expect(switchSign(repo, t0, "o1", "aries")).rejects.toMatchObject({ code: "DAILY_ACTION_LIMIT" });
    await switchSign(repo, t0 + 24 * HOUR, "o1", "aries");
  });

  it("lets an owner make at most 5 new codes an hour", async () => {
    const { repo, t0 } = await setup(); // the first code counts
    for (let i = 0; i < 4; i++) await regenerateInvite(repo, t0 + i, "o1");
    await expect(regenerateInvite(repo, t0 + 10, "o1")).rejects.toMatchObject({ code: "INVITE_COOLDOWN" });
    expect((await regenerateInvite(repo, t0 + HOUR + 1, "o1")).code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it("draws the same 오늘의 인연 카드 all day and a new one the next KST day, without touching the score", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const r = await join(repo, t0, code, 0);
    const a = await todayBondCard(repo, t0, "o1", r.star.id);
    expect(await todayBondCard(repo, t0 + 5 * HOUR, "o1", r.star.id)).toEqual(a);
    const days = await Promise.all([1, 2, 3, 4, 5].map((d) => todayBondCard(repo, t0 + d * 24 * HOUR, "o1", r.star.id)));
    expect(days.map((x) => x.day)).not.toContain(a.day);
    expect(new Set([a, ...days].map((x) => `${x.cardId}:${x.orientation}`)).size).toBeGreaterThan(1);
    expect((await repo.starsOf(r.star.constellationId))[0]?.score).toBe(r.score);
    await expect(todayBondCard(repo, t0, "o1", "nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shows the friend page as this visitor sees it: own link, a past join, or the form with an earlier star", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    expect(await invitePage(repo, code, { ownerId: "o1", friendKey: null })).toMatchObject({ kind: "self", sign: "aries", filled: 0, slots: 4 });
    expect(await invitePage(repo, code, { ownerId: null, friendKey: null })).toMatchObject({ kind: "open", sign: "aries", earlier: null });

    const joined = await join(repo, t0, code, 0);
    const again = await invitePage(repo, code, { ownerId: null, friendKey: "f0" });
    expect(again).toMatchObject({ kind: "joined", result: { nickname: "친구0", score: joined.score, sign: "aries", slot: 0, completed: false } });
    // the reasons are the friend's own side, the same as right after joining
    expect(again.kind === "joined" && again.result.parts).toEqual(joined.parts);

    for (let i = 1; i < 4; i++) await join(repo, t0, code, i);
    const later = await invitePage(repo, code, { ownerId: null, friendKey: "f0" });
    expect(later).toMatchObject({ kind: "open", sign: "taurus", earlier: { sign: "aries", completed: true } });
    await expect(invitePage(repo, "ZZZZZZ", { ownerId: null, friendKey: null })).rejects.toMatchObject({ code: "BAD_CODE" });
  });

  it("marks a star whose friend saw the score notice (owner 2026-10-23): only those scores may show on the owner's public link", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const seen = await joinStar(repo, t0, { code, friendKey: "f0", nickname: "친구0", birth: friends[0]!, pick: 0, message: null, scoreNotice: true });
    const before = await joinStar(repo, t0, { code, friendKey: "f1", nickname: "친구1", birth: friends[1]!, pick: 1, message: null });
    const stars = await repo.starsOf(seen.star.constellationId);
    expect(stars.find((s) => s.id === seen.star.id)?.scorePublic).toBe(true);
    expect(stars.find((s) => s.id === before.star.id)?.scorePublic ?? false).toBe(false);
  });

  it("tells the form whether this constellation's scores can show: not once a star joined without the notice, even after it is removed (review 2026-10-23)", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    expect(await invitePage(repo, code, { ownerId: null, friendKey: null })).toMatchObject({ kind: "open", scoresPrivate: false });
    await joinStar(repo, t0, { code, friendKey: "f0", nickname: "친구0", birth: friends[0]!, pick: 0, message: null, scoreNotice: true });
    expect(await invitePage(repo, code, { ownerId: null, friendKey: null })).toMatchObject({ kind: "open", scoresPrivate: false });
    const earlier = await joinStar(repo, t0, { code, friendKey: "f1", nickname: "친구1", birth: friends[1]!, pick: 1, message: null });
    expect(await invitePage(repo, code, { ownerId: null, friendKey: null })).toMatchObject({ kind: "open", scoresPrivate: true });
    await removeStar(repo, t0, "o1", earlier.star.id);
    expect(await invitePage(repo, code, { ownerId: null, friendKey: null })).toMatchObject({ kind: "open", scoresPrivate: true });
  });

  it("gives the form the nickname this device already used (an owner here, or a friend elsewhere), so joining takes fewer steps (owner 2026-10-23)", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    expect(await invitePage(repo, code, { ownerId: null, friendKey: null })).toMatchObject({ kind: "open", myNickname: null });
    // an owner of another constellation on this device
    await saveOwner(repo, t0, "o2", { nickname: "하늘별", birth: me });
    expect(await invitePage(repo, code, { ownerId: "o2", friendKey: null })).toMatchObject({ kind: "open", myNickname: "하늘별" });
    // a friend who joined someone else's constellation from this device
    await saveOwner(repo, t0, "o3", { nickname: "민지", birth: me });
    await chooseSign(repo, t0, "o3", "leo");
    const other = await inviteOf(repo, t0, "o3");
    await joinStar(repo, t0, { code: other.code, friendKey: "f9", nickname: "바다별", birth: friends[0]!, pick: 0, message: null });
    expect(await invitePage(repo, code, { ownerId: null, friendKey: "f9" })).toMatchObject({ kind: "open", myNickname: "바다별" });
  });

  it("lists the top 50 and still gives a viewer further down their own rank", async () => {
    const { repo, t0 } = await setup();
    expect(RANKING_LIMIT).toBe(50);
    for (let i = 0; i < 55; i++) {
      await repo.upsertOwner({ id: `r${i}`, nickname: `주인${i}`, rankingPublic: true, basis: (await repo.getOwner("o1"))!.basis, lastRefillAt: null, createdAt: 1, joinsDay: null, joinsCount: 0 });
      await repo.insertConstellation({ id: `rc${i}`, ownerId: `r${i}`, sign: "aries", status: "complete", total: 400 - i, startedAt: t0, completedAt: t0 + i });
    }
    const top = await rankingView(repo, t0 + 100, "aries", null);
    expect(top.all).toHaveLength(50);
    expect(top.all.map((r) => r.rank)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    // outside the list (51st and 55th): no row of their own, but their rank and total are looked up
    const far = await rankingView(repo, t0 + 100, "aries", "r54");
    expect(far.mine).toMatchObject({ allRank: 55, row: { total: 346 } });
    expect(far.all.some((r) => r.mine)).toBe(false);
    const edge = await rankingView(repo, t0 + 100, "aries", "r50");
    expect(edge.mine).toMatchObject({ allRank: 51 });
    expect(edge.all.some((r) => r.mine)).toBe(false);
    // the 50th is the last row of the list, marked as mine
    const last = await rankingView(repo, t0 + 100, "aries", "r49");
    expect(last.all.at(-1)).toMatchObject({ rank: 50, nickname: "주인49", mine: true });
    const near = await rankingView(repo, t0 + 100, "aries", "r2");
    expect(near.all.find((r) => r.mine)).toMatchObject({ rank: 3, nickname: "주인2" });
  });

  it("lists the constellations this device joined, newest first: owner, sign, progress and the members in slot order with 나 (owner 2026-10-14)", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    await saveOwner(repo, t0, "o2", { nickname: "민지", birth: friends[3]! });
    const other = (await inviteOf(repo, t0, "o2")).code;
    await chooseSign(repo, t0, "o2", "aquarius");
    await join(repo, t0 + 1, code, 0); // f0 = 친구0 in 용우's 양자리
    await join(repo, t0 + 2, code, 1); // f1 = 친구1
    await joinStar(repo, t0 + 3, { code: other, friendKey: "f1", nickname: "친구1", birth: friends[1]!, pick: 1, message: "비밀 메시지" });
    await joinStar(repo, t0 + 4, { code: other, friendKey: "f2", nickname: "친구2", birth: friends[2]!, pick: 2, message: null });

    const joined = await joinedView(repo, "f1", null);
    expect(joined.map((j) => [j.ownerNickname, j.sign])).toEqual([["민지", "aquarius"], ["용우", "aries"]]);
    expect(joined[0]).toMatchObject({ status: "filling", filled: 2 });
    expect(joined[0]!.members).toEqual([{ nickname: "친구1", me: true }, { nickname: "친구2", me: false }]);
    expect(joined[1]!.members).toEqual([{ nickname: "친구0", me: false }, { nickname: "친구1", me: true }]);
    expect(JSON.stringify(joined)).not.toContain("비밀 메시지");
    expect(await joinedView(repo, "nobody", null)).toEqual([]);
  });

  it("leaves out a constellation this device's owner owns, and one whose star was removed", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const { star } = await join(repo, t0 + 1, code, 0);
    expect(await joinedView(repo, "f0", "o1")).toEqual([]);
    expect(await joinedView(repo, "f0", null)).toHaveLength(1);
    await removeStar(repo, t0 + 2, "o1", star.id);
    expect(await joinedView(repo, "f0", null)).toEqual([]);
  });
});

