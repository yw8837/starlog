import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREMIUM_CHAPTER_TTL_MS } from "@/lib/premium/products";
import type { ChapterContext } from "@/lib/security/chapterToken";
import { issueChapter } from "@/lib/security/chapterToken";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { POST as followup } from "./route";

const T0 = Date.parse("2026-10-20T03:00:00Z");
const DAY = 24 * 3_600_000;
const reading = { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" } };
const tarotCtx = {
  kind: "tarot",
  templateId: "self-flow",
  input: { topicId: "money", whoId: "me", question: "이번 주 재물 흐름은?", conditions: [], note: "" },
  cards: [["major-00-fool", "upright"], ["cups-03", "upright"], ["swords-02", "reversed"]],
} as unknown as ChapterContext;

async function ask(chapterToken: string) {
  const response = await followup(
    new Request("http://localhost/api/followup", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost", "cf-connecting-ip": "203.0.113.40" },
      body: JSON.stringify({ chapterToken, reading, question: "하나 더 물어봐도 될까요?" }),
    }),
  );
  return { status: response.status, data: (await response.json()) as { code?: string; message?: string } };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  resetMemoryLimiter();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("a follow-up on a chapter whose token cannot be opened", () => {
  it("says the asking period is over without naming 7 days, which a 30-day premium chapter does not have", async () => {
    // A standard chapter past its 7 days: refused as before (400 BAD_TOKEN), in words that fit both kinds.
    const token = await issueChapter(tarotCtx, reading, [], signingSecret()!, T0);
    vi.setSystemTime(T0 + 8 * DAY);
    const late = await ask(token);
    expect(late.status).toBe(400);
    expect(late.data.code).toBe("BAD_TOKEN");
    expect(late.data.message).toBe("후속 질문을 이어 갈 수 없는 풀이예요. 물어볼 수 있는 기간이 지났거나 내용이 달라졌어요.");
    expect(late.data.message).not.toMatch(/7일|30일/);
  });

  it("says the same for a premium chapter past its 30 days and for a forged token", async () => {
    const premiumCtx = { kind: "match" } as unknown as ChapterContext;
    const token = await issueChapter(premiumCtx, reading, [], signingSecret()!, T0, T0 + PREMIUM_CHAPTER_TTL_MS);
    vi.setSystemTime(T0 + PREMIUM_CHAPTER_TTL_MS + 1);
    const late = await ask(token);
    expect(late.data.code).toBe("BAD_TOKEN");
    expect(late.data.message).toContain("물어볼 수 있는 기간이 지났거나");
    const forged = await ask("not-a-token");
    expect(forged.data.message).toContain("물어볼 수 있는 기간이 지났거나");
  });
});
