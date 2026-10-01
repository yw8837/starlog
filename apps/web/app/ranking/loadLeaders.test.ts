import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryBondsRepo } from "@/lib/db/memoryBondsRepo";
import { chooseSign, inviteOf, joinStar, saveOwner } from "@/lib/bonds/service";
import { loadLeaders, weekTop } from "./loadLeaders";

const FRIENDS = [
  { calendar: "solar" as const, year: 1991, month: 5, day: 12 },
  { calendar: "solar" as const, year: 1992, month: 8, day: 3 },
  { calendar: "solar" as const, year: 1988, month: 11, day: 20 },
  { calendar: "solar" as const, year: 1995, month: 2, day: 28 },
];

async function completeAries(repo: ReturnType<typeof createMemoryBondsRepo>, ownerId: string, nickname: string, now: number) {
  await saveOwner(repo, now, ownerId, { nickname, birth: { calendar: "solar", year: 1990, month: 1, day: 1 } });
  const { code } = await inviteOf(repo, now, ownerId);
  await chooseSign(repo, now, ownerId, "aries");
  for (const [i, birth] of FRIENDS.entries()) {
    await joinStar(repo, now, { code, friendKey: `${ownerId}-${i}`, nickname: `친구${i}`, birth, pick: i, message: null });
  }
}

describe("loadLeaders", () => {
  afterEach(() => vi.restoreAllMocks());

  it("gives this week's top entries per sign from one query", async () => {
    const repo = createMemoryBondsRepo();
    const now = Date.UTC(2026, 9, 1, 3);
    await completeAries(repo, "o1", "용우", now);
    await completeAries(repo, "o2", "하늘", now + 1);
    const spy = vi.spyOn(repo, "topsBySign");
    const leaders = await loadLeaders(now + 10, () => repo);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(leaders?.aries?.map((l) => [l.rank, l.nickname])).toEqual([[1, "용우"], [2, "하늘"]]);
    expect(leaders?.leo).toBeUndefined();
    // next week: a fresh board
    expect(await loadLeaders(now + 8 * 24 * 3_600_000, () => repo)).toEqual({});
  });

  it("fails soft (null) when the database cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = () => {
      throw new Error("DB binding missing");
    };
    expect(await loadLeaders(Date.now(), broken)).toBeNull();
  });

  it("picks this week's best record over all signs (1위 totals; a tie goes to the earlier sign)", () => {
    expect(weekTop({})).toBeNull();
    const leaders = {
      leo: [{ rank: 1, nickname: "민지", total: 501 }, { rank: 2, nickname: "하늘", total: 510 }],
      aries: [{ rank: 1, nickname: "용우", total: 422 }],
      pisces: [{ rank: 1, nickname: "별", total: 501 }],
    };
    expect(weekTop(leaders)).toEqual({ sign: "leo", total: 501 });
  });
});
