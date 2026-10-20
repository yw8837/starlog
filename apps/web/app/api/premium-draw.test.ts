import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { positionHint, kbCard } from "@/lib/kb";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { POST as draw } from "./tarot/draw/route";
import { POST as reading } from "./tarot/reading/route";

const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  resetMemoryLimiter();
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("premium draws", () => {
  it("deals ten cards for deep-tarot, and none for the 궁합: it reads no cards since 2026-10-17 (owner)", async () => {
    const deep = await post(draw, { templateId: "deep-tarot", picks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
    expect(deep.status).toBe(200);
    expect(((await deep.json()) as { cards: unknown[] }).cards).toHaveLength(10);
    expect((await post(draw, { templateId: "match", picks: [10, 20, 30, 40, 50] })).status).toBe(400);
  });

  it("refuses a pick count the spread cannot take", async () => {
    expect((await post(draw, { templateId: "deep-tarot", picks: [0, 1, 2] })).status).toBe(400);
  });

  it("does not open a standard reading with a premium draw", async () => {
    const { drawToken } = (await (await post(draw, { templateId: "deep-tarot", picks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] })).json()) as { drawToken: string };
    const res = await post(reading, { drawToken, input: { topicId: "money", whoId: "me", whenId: "week", question: "", conditions: [] } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "BAD_TOKEN" });
  });

  it("gives every new position a KB lens through positionFallback", () => {
    const card = kbCard("cups-02");
    for (const position of ["가로막는 것", "바탕", "지나온 것", "바라는 것", "다가올 것", "나의 태도", "주변", "바람과 걱정", "결과의 방향", "그 사람 쪽 흐름", "엇갈리는 지점", "함께 가꿀 방향"]) {
      expect(positionHint(card, position, "upright"), position).toBeTruthy();
    }
  });
});
