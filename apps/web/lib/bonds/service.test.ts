import { describe, expect, it } from "vitest";
import { bondBasis, bondScore } from "@starlog/core";
import { createMemoryBondsRepo } from "@/lib/db/memoryBondsRepo";
import {
  BondsError, chooseSign, inviteOf, joinStar, ownerView, rankingView, refill, regenerateInvite, removeStar, resolveInvite, saveOwner, switchSign,
  todayBondCard,
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
    expect(view.filling).toBeNull();
    expect(view.completed[0]).toMatchObject({ sign: "aries", status: "complete", total: expected.reduce((a, b) => a + b, 0) });
    await expect(chooseSign(repo, t0, "o1", "aries")).rejects.toMatchObject({ code: "SIGN_COMPLETED" });
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
    await chooseSign(repo, t0, "o1", "libra");
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
    await chooseSign(repo, t0, "o1", "libra");
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

  it("shows this week's and all-time ranking with my card", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    for (let i = 0; i < 4; i++) await join(repo, t0, code, i);
    const view = await rankingView(repo, t0 + 1, "aries", "o1");
    expect(view.week[0]).toMatchObject({ rank: 1, nickname: "용우", mine: true });
    expect(view.mine?.allRank).toBe(1);
    expect(view.mine?.stars).toHaveLength(4);
    // next week: gone from the weekly list, still in the hall of fame
    const later = await rankingView(repo, t0 + 8 * 24 * HOUR, "aries", null);
    expect(later.week).toEqual([]);
    expect(later.all[0]).toMatchObject({ nickname: "용우", mine: false });
    expect(later.mine).toBeNull();
  });

  it("leaves a private owner out of the ranking but still shows them their card", async () => {
    const { repo, t0, code } = await setup();
    await saveOwner(repo, t0, "o1", { nickname: "용우", rankingPublic: false });
    await chooseSign(repo, t0, "o1", "aries");
    for (let i = 0; i < 4; i++) await join(repo, t0, code, i);
    const view = await rankingView(repo, t0 + 1, "aries", "o1");
    expect(view.all).toEqual([]);
    expect(view.mine).toMatchObject({ weekRank: null, allRank: null });
  });

  it("caps new stars per owner per KST day", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "pisces");
    const repoAny = repo as unknown as { starsSince: (o: string, s: number) => Promise<number> };
    repoAny.starsSince = async () => 20;
    await expect(join(repo, t0, code, 0)).rejects.toMatchObject({ code: "DAILY_STAR_LIMIT" });
    await expect(join(repo, t0, code, 0)).rejects.toBeInstanceOf(BondsError);
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
});
