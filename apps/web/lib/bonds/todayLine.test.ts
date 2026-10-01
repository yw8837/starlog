import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError, type GenerationHooks } from "@/lib/ai/provider";
import { dailyStore, resetDailyStore } from "@/lib/api/dailyStore";
import { clientCount, resetSpendState, spentTodayKrw } from "@/lib/api/spend";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { todayCardLine } from "./bondCardText";
import { AI_PER_OWNER_PER_DAY, todayLine, validateTodayLine } from "./todayLine";

/** 100k output tokens of Opus 5.5 at 1,400원/$: 2,800원. */
const BILLED = [{ model: "claude-opus-5-5", inputTokens: 0, outputTokens: 100_000, cacheReadTokens: 0, cacheWriteTokens: 0 }];

describe("오늘의 인연 카드 line", () => {
  beforeEach(() => {
    vi.stubEnv("STARLOG_AI", "mock");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("KRW_PER_USD", "1400");
    resetDailyStore();
    resetSpendState();
    resetMemoryLimiter();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("accepts a plain 해요체 line and rejects guarantees, romance verdicts, formatting and 반말", () => {
    expect(validateTodayLine("손을 맞잡은 두 사람처럼 오늘은 가볍게 안부를 건네기 좋은 흐름이에요. 사진 하나 보내 보세요.")).toEqual([]);
    expect(validateTodayLine("오늘 두 사람은 반드시 가까워지는 흐름이에요. 연락해 보세요.")).not.toEqual([]);
    expect(validateTodayLine("오늘 두 사람은 재회의 기운이 가득한 하루예요. 연락해 보세요.")).not.toEqual([]);
    expect(validateTodayLine("오늘 두 사람 사이엔 웃음이 많아요 ✨ 사진을 보내 보세요.")).not.toEqual([]);
    expect(validateTodayLine("오늘 두 사람 사이엔 웃음이 많은 흐름이다. 사진을 보내 봐.")).not.toEqual([]);
    expect(validateTodayLine("짧아요.")).not.toEqual([]);
    expect(validateTodayLine("Claude가 읽어 보면 오늘 두 사람 사이엔 웃음이 많은 흐름이에요. 사진을 보내 보세요.").join(" ")).toMatch(/모델·회사·기술 이름/);
  });

  const base = { ownerId: "owner-guard-test", starId: "s0", day: "2026-10-01", cardId: "cups-02", orientation: "upright" as const, now: Date.UTC(2026, 9, 1, 3) };

  it("carries the blinding rule in its system prompt", async () => {
    const spy = vi.spyOn(mockProvider, "generate");
    await todayLine(base);
    expect(spy.mock.calls[0]![0].system).toContain("# 풀이 도우미의 정체");
  });

  it("charges the caller's day count before the call and stops at the network limit", async () => {
    vi.stubEnv("BETA_IP_LINES_PER_DAY", "1");
    const spy = vi.spyOn(mockProvider, "generate");
    await todayLine({ ...base, client: "net-1" });
    expect(await clientCount("net-1", "line", base.now)).toBe(1);
    expect(await todayLine({ ...base, starId: "s1", client: "net-1" })).toBe(todayCardLine(base.cardId, base.orientation));
    expect(spy).toHaveBeenCalledTimes(1);
    await todayLine({ ...base, ownerId: "owner-no-client", starId: "s2" }); // the owner id stands in without a client
    expect(await clientCount("owner:owner-no-client", "line", base.now)).toBe(1);
  });

  it("records what a failed call billed and still answers with the rule-based line", async () => {
    vi.spyOn(mockProvider, "generate").mockImplementation(async (_task, _attempt, _feedback, hooks?: GenerationHooks) => {
      hooks?.onUsage?.(BILLED);
      throw new GenerationError("UPSTREAM", ["APIConnectionError"]);
    });
    expect(await todayLine({ ...base, ownerId: "owner-failed" })).toBe(todayCardLine(base.cardId, base.orientation));
    expect(Math.round((await spentTodayKrw(Date.now())) ?? -1)).toBe(2800);
  });

  it("calls no model once the day's budget is used up", async () => {
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0");
    const spy = vi.spyOn(mockProvider, "generate");
    expect(await todayLine({ ...base, ownerId: "owner-over-budget" })).toBe(todayCardLine(base.cardId, base.orientation));
    expect(spy).not.toHaveBeenCalled();
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
