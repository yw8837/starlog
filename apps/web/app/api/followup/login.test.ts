import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { setTestDb } from "@/lib/db";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import { issueChapter, type ChapterContext } from "@/lib/security/chapterToken";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { browser, loginAs, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as followup } from "./route";

/** 이어서 물어보기 is an AI reading: it needs a login (owner 2026-11-04), with a device-held token or not; crisis care comes before it (owner 2026-10-31). */

const reading = TAROT_SAMPLE.paid;
const ctx: ChapterContext = {
  kind: "tarot",
  templateId: "relationship-contact",
  input: { topicId: "love", whoId: "us", question: "그 사람에게 먼저 연락해도 될까요?", conditions: [], note: "" },
  cards: [
    ["major-09-hermit", "upright"],
    ["major-17-star", "reversed"],
    ["cups-03", "upright"],
  ],
};
const ask = async (b: Browser, question: string) =>
  b.send(followup, "/api/followup", { body: { chapterToken: await issueChapter(ctx, reading, [], signingSecret()!, Date.now()), reading, question }, origin: true });

beforeEach(() => {
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  resetMemoryLimiter();
  resetDailyStore();
  useTestDb();
});
afterEach(() => {
  setTestDb(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/followup without a session", () => {
  it("answers the login with nothing generated and no cookie spent, whatever token the device holds", async () => {
    const generate = vi.spyOn(mockProvider, "generate");
    const res = await ask(browser("198.51.100.81"), "다음 주에 연락해도 될까요?");
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ code: "LOGIN_REQUIRED", reason: "followup", message: "이어서 물어보기는 로그인하고 할 수 있어요." });
    expect(body.answer).toBeUndefined();
    expect(body.chapterToken).toBeUndefined();
    expect(generate).not.toHaveBeenCalled();
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("gives words that state a thought of dying the care screen first, not the login", async () => {
    const generate = vi.spyOn(mockProvider, "generate");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await ask(browser("198.51.100.82"), "요즘 죽고 싶다는 생각이 들어요");
    expect(res.status).not.toBe(401);
    expect(await res.json()).toMatchObject({ code: "REFUSED", care: true });
    expect(generate).not.toHaveBeenCalled();
  });

  it("asks a passive wish to log in: an answer written with care is still an answer", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await ask(browser("198.51.100.83"), "요즘 너무 지쳐서 사라지고 싶어요");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/followup with a session", () => {
  // A logged-in reader's answers, turns and limits: app/api/routes.test.ts ("draws, teases, reads and answers follow-ups…").
  it("goes on to the chapter as before: a token that cannot open is that, not a login; crisis words get the care screen", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const b = browser("198.51.100.84");
    await loginAs(b, "followup-member");
    const forged = await b.send(followup, "/api/followup", { body: { chapterToken: "not-a-token", reading, question: "다음 주에 연락해도 될까요?" }, origin: true });
    expect(forged.status).toBe(400);
    expect(await forged.json()).toMatchObject({ code: "BAD_TOKEN" });
    expect(await (await ask(b, "요즘 죽고 싶다는 생각이 들어요")).json()).toMatchObject({ code: "REFUSED", care: true });
  });

  it("does not take a session that is no good for a login", async () => {
    const b = browser("198.51.100.85");
    b.jar.set("sl_sid", "not-a-real-session");
    expect((await ask(b, "다음 주에 연락해도 될까요?")).status).toBe(401);
  });
});
