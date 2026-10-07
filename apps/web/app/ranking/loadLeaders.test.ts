import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryBondsRepo } from "@/lib/db/memoryBondsRepo";
import { chooseSign, inviteOf, joinStar, saveOwner } from "@/lib/bonds/service";
import { bestRecord, loadLeaders } from "./loadLeaders";

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

  it("gives the all-time top entries per sign from one query, and no completion ever drops out", async () => {
    const repo = createMemoryBondsRepo();
    const now = Date.UTC(2026, 9, 1, 3);
    await completeAries(repo, "o1", "용우", now);
    await completeAries(repo, "o2", "하늘", now + 1);
    const spy = vi.spyOn(repo, "topsBySign");
    const leaders = await loadLeaders(() => repo);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(null, 3); // no start time: the ranking never restarts
    expect(leaders?.aries?.map((l) => [l.rank, l.nickname])).toEqual([[1, "용우"], [2, "하늘"]]);
    expect(leaders?.leo).toBeUndefined();
  });

  it("keeps a completion from weeks ago on the board next to a new one", async () => {
    const repo = createMemoryBondsRepo();
    const long = Date.UTC(2026, 7, 3, 3); // 2026-08-03, two months before
    await completeAries(repo, "o1", "용우", long);
    await completeAries(repo, "o2", "하늘", Date.UTC(2026, 9, 6, 3));
    const leaders = await loadLeaders(() => repo);
    expect(leaders?.aries?.map((l) => l.nickname).sort()).toEqual(["용우", "하늘"]);
  });

  it("fails soft (null) when the database cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = () => {
      throw new Error("DB binding missing");
    };
    expect(await loadLeaders(broken)).toBeNull();
  });

  it("picks the best record over all signs (1위 totals; a tie goes to the earlier sign)", () => {
    expect(bestRecord({})).toBeNull();
    const leaders = {
      leo: [{ rank: 1, nickname: "민지", total: 501 }, { rank: 2, nickname: "하늘", total: 510 }],
      aries: [{ rank: 1, nickname: "용우", total: 422 }],
      pisces: [{ rank: 1, nickname: "별", total: 501 }],
    };
    expect(bestRecord(leaders)).toEqual({ sign: "leo", total: 501 });
  });
});
