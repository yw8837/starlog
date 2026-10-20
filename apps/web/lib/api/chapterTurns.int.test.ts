import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { openLocalD1 } from "@/lib/db/testing/localD1";
import { answeredTurns, giveBackTurn, holdTurn } from "./chapterTurns";

const UNTIL = Date.parse("2026-10-30T03:00:00Z");

/** The conditional upsert on real local D1 (workerd): RETURNING gives no row past the cap. Skipped with CI_NO_WORKERD=1. */
describe.skipIf(process.env.CI_NO_WORKERD === "1")("follow-up turns (local D1)", () => {
  let db: D1Binding;
  let dispose: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    ({ db, dispose } = await openLocalD1());
    setTestDb(db);
  }, 120_000);

  afterAll(async () => {
    setTestDb(null);
    await dispose?.();
  });

  it("lets follow-ups sent together pass the cap of 3 only three times, and gives a failed one back", async () => {
    const held = await Promise.all(Array.from({ length: 6 }, () => holdTurn("ch_int", { answered: 0, cap: 3, until: UNTIL })));
    expect(held.filter((n) => n === "capped")).toHaveLength(3);
    expect(held.filter((n) => typeof n === "number").sort()).toEqual([1, 2, 3]);
    await giveBackTurn("ch_int", 3);
    expect(await answeredTurns("ch_int")).toBe(2);
    expect(await holdTurn("ch_int", { answered: 0, cap: 3, until: UNTIL })).toBe(3);
  });
});
