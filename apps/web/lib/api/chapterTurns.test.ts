import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { chapterTurns as kvTurns, recordChapterTurns } from "@/lib/api/spend";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import type { TestD1 } from "@/lib/db/testing/sqliteD1";
import { answeredTurns, giveBackTurn, holdTurn, purgeChapterTurns } from "./chapterTurns";

const NOW = Date.parse("2026-10-22T03:00:00Z");
const UNTIL = NOW + 8 * 86_400_000;

let db: TestD1;

beforeEach(() => {
  resetDailyStore();
  db = migratedTestD1();
  setTestDb(db);
});

afterEach(() => {
  setTestDb(null);
});

describe("follow-up turns per chapter in D1 (G1)", () => {
  it("lets follow-ups sent together pass the cap of 3 only three times", async () => {
    const held = await Promise.all(Array.from({ length: 6 }, () => holdTurn("ch_1", { answered: 0, cap: 3, until: UNTIL })));
    expect(held.filter((n) => n === "capped")).toHaveLength(3);
    expect(held.filter((n) => typeof n === "number").sort()).toEqual([1, 2, 3]);
    expect(await answeredTurns("ch_1")).toBe(3);
  });

  it("starts from the turns a chapter already had (its token, or the KV count from before D1), never below the count on record", async () => {
    expect(await holdTurn("ch_2", { answered: 2, cap: 3, until: UNTIL })).toBe(3);
    // An older token of the same chapter (fewer turns) cannot start it over.
    expect(await holdTurn("ch_2", { answered: 0, cap: 3, until: UNTIL })).toBe("capped");
    await recordChapterTurns("ch_3", 2);
    expect(await answeredTurns("ch_3")).toBe(2);
    expect(await holdTurn("ch_4", { answered: 3, cap: 3, until: UNTIL })).toBe("capped");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM chapter_turns WHERE chapter_id = 'ch_4'").first()).toEqual({ n: 0 });
  });

  it("gives a held turn back after a failed answer, never below what another request holds", async () => {
    expect(await holdTurn("ch_5", { answered: 0, cap: 1, until: UNTIL })).toBe(1);
    await giveBackTurn("ch_5", 1);
    expect(await answeredTurns("ch_5")).toBe(0);
    expect(await holdTurn("ch_5", { answered: 0, cap: 2, until: UNTIL })).toBe(1);
    expect(await holdTurn("ch_5", { answered: 0, cap: 2, until: UNTIL })).toBe(2);
    await giveBackTurn("ch_5", 1); // the first request failed after the second held its turn
    expect(await answeredTurns("ch_5")).toBe(1);
  });

  it("writes nothing to KV any more, and the cron purges a chapter's row a day after its token died", async () => {
    expect(await holdTurn("ch_6", { answered: 0, cap: 3, until: NOW + 1000 })).toBe(1);
    expect(await kvTurns("ch_6")).toBe(0);
    expect(await purgeChapterTurns(db, NOW + 1000)).toBe(0);
    expect(await purgeChapterTurns(db, NOW + 1001)).toBe(1);
    expect(await answeredTurns("ch_6")).toBe(0);
  });

  it("answers null (no new answer) when D1 cannot be read or written", async () => {
    const down = () => {
      throw new Error("D1 down");
    };
    setTestDb({ prepare: down, batch: down } as unknown as D1Binding);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await answeredTurns("ch_7")).toBeNull();
    expect(await holdTurn("ch_7", { answered: 0, cap: 3, until: UNTIL })).toBeNull();
    expect(errors).toHaveBeenCalledTimes(2);
    errors.mockRestore();
  });
});

describe("follow-up turns without D1 (next dev without the Workers bindings)", () => {
  it("keeps counting in KV as before", async () => {
    setTestDb(null);
    expect(await holdTurn("ch_8", { answered: 0, cap: 2, until: UNTIL })).toBe(1);
    expect(await kvTurns("ch_8")).toBe(1);
    expect(await holdTurn("ch_8", { answered: 1, cap: 2, until: UNTIL })).toBe(2);
    expect(await holdTurn("ch_8", { answered: 2, cap: 2, until: UNTIL })).toBe("capped");
    await giveBackTurn("ch_8", 2);
    expect(await answeredTurns("ch_8")).toBe(1);
  });
});
