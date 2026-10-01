import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dailyStore } from "@/lib/api/dailyStore";
import { todayCardLine } from "./bondCardText";
import { AI_PER_OWNER_PER_DAY, todayLine, validateTodayLine } from "./todayLine";

describe("오늘의 인연 카드 line", () => {
  beforeEach(() => {
    vi.stubEnv("STARLOG_AI", "mock");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a plain 해요체 line and rejects guarantees, romance verdicts, formatting and 반말", () => {
    expect(validateTodayLine("손을 맞잡은 두 사람처럼 오늘은 가볍게 안부를 건네기 좋은 흐름이에요. 사진 하나 보내 보세요.")).toEqual([]);
    expect(validateTodayLine("오늘 두 사람은 반드시 가까워지는 흐름이에요. 연락해 보세요.")).not.toEqual([]);
    expect(validateTodayLine("오늘 두 사람은 재회의 기운이 가득한 하루예요. 연락해 보세요.")).not.toEqual([]);
    expect(validateTodayLine("오늘 두 사람 사이엔 웃음이 많아요 ✨ 사진을 보내 보세요.")).not.toEqual([]);
    expect(validateTodayLine("오늘 두 사람 사이엔 웃음이 많은 흐름이다. 사진을 보내 봐.")).not.toEqual([]);
    expect(validateTodayLine("짧아요.")).not.toEqual([]);
  });

  it("the rule-based lines pass the same rules", () => {
    for (const id of ["cups-02", "major-16-tower", "major-00-fool", "pentacles-14"]) {
      for (const o of ["upright", "reversed"] as const) expect(validateTodayLine(todayCardLine(id, o))).toEqual([]);
    }
  });

  it("stores the day's line per star and counts at most 5 generations per owner per day", async () => {
    const day = "2026-10-01";
    const base = { ownerId: "owner-line-test", day, cardId: "cups-02", orientation: "upright" as const, now: Date.UTC(2026, 9, 1, 3) };
    const first = await todayLine({ ...base, starId: "s0" });
    expect(await todayLine({ ...base, starId: "s0" })).toBe(first);
    for (let i = 1; i < AI_PER_OWNER_PER_DAY + 3; i++) await todayLine({ ...base, starId: `s${i}` });
    expect(await dailyStore().get(`bond-gen:${base.ownerId}:${day}`)).toBe(AI_PER_OWNER_PER_DAY);
  });
});
