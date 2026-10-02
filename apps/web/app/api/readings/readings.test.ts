import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret } from "@/lib/account/secrets";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { insertReadingStatement, listReadings, newReadingId, type ServerChapter } from "@/lib/readings/store";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, loginAs, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as followup } from "../followup/route";
import { POST as draw } from "../tarot/draw/route";
import { POST as reading } from "../tarot/reading/route";
import { DELETE as remove, GET as list } from "./route";

const T0 = Date.parse("2026-10-01T03:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  resetMemoryLimiter();
  resetDailyStore();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const userIdOf = async (db: D1Binding, nth = 0) => (await db.prepare("SELECT id FROM users ORDER BY created_at, id LIMIT 1 OFFSET ?").bind(nth).first<{ id: string }>())!.id;

const chapterOf = (question: string): ServerChapter => ({
  kind: "tarot", question, conditions: [], note: "", cards: [], reading: { verdict: `${question}의 결론` }, chapterToken: "t", createdAt: T0, turns: [], followUpsLeft: 3,
});

async function saveFor(db: D1Binding, userId: string, question: string, now: number): Promise<string> {
  const id = newReadingId();
  await (await insertReadingStatement(db, accountSecret()!, { id, userId, productId: "tarot", source: "paid", unlockId: null, chapter: chapterOf(question), now })).run();
  return id;
}

type Page = { readings: Array<{ id: string; chapter: ServerChapter }>; next: string | null };
const page = async (b: Browser, query = "") => (await (await b.send(list, `/api/readings${query}`)).json()) as Page;

describe("readings in the account", () => {
  it("lists only my saved readings, newest first, a page at a time", async () => {
    const db = useTestDb();
    const alice = browser("192.0.2.21");
    await loginAs(alice, "alice");
    vi.setSystemTime(T0 + 1_000); // bob signs up later, so alice is the first user
    const bob = browser("192.0.2.22");
    await loginAs(bob, "bob");
    const aliceId = await userIdOf(db);
    for (const [i, question] of ["하나", "둘", "셋"].entries()) await saveFor(db, aliceId, question, T0 + i);
    const first = await page(alice, "?limit=2");
    expect(first.readings.map((r) => r.chapter.question)).toEqual(["셋", "둘"]);
    expect(first.next).not.toBeNull();
    const second = await page(alice, `?limit=2&before=${encodeURIComponent(first.next!)}`);
    expect(second).toMatchObject({ readings: [{ chapter: { question: "하나" } }], next: null });
    expect(await page(bob)).toEqual({ readings: [], next: null });
    expect((await browser("192.0.2.23").send(list, "/api/readings")).status).toBe(401);
    expect((await alice.send(list, "/api/readings?before=not-a-cursor")).status).toBe(200);
  });

  it("deletes my saved readings, one or all, never someone else's", async () => {
    const db = useTestDb();
    const alice = browser("192.0.2.27");
    await loginAs(alice, "alice");
    vi.setSystemTime(T0 + 1_000);
    const bob = browser("192.0.2.28");
    await loginAs(bob, "bob");
    const aliceId = await userIdOf(db);
    const one = await saveFor(db, aliceId, "하나", T0);
    await saveFor(db, aliceId, "둘", T0 + 1);
    const del = (b: Browser, query: string, origin = true) => b.send(remove, `/api/readings?${query}`, { method: "DELETE", origin });
    expect((await del(alice, `id=${one}`, false)).status).toBe(403);
    expect(await (await del(bob, `id=${one}`)).json()).toEqual({ deleted: 0 });
    expect(await (await del(alice, `id=${one}`)).json()).toEqual({ deleted: 1 });
    expect(await (await del(alice, "all=1")).json()).toEqual({ deleted: 1 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM readings").first()).toEqual({ n: 0 });
  });

  it("writes a follow-up answer into the saved reading", async () => {
    const db = useTestDb();
    const b = browser("192.0.2.29");
    await loginAs(b);
    const { drawToken } = (await (await b.send(draw, "/api/tarot/draw", { body: { templateId: "self-flow", picks: [3, 30, 60] } })).json()) as { drawToken: string };
    const input = { topicId: "money", whoId: "me", whenId: "week", question: "이번 주 재물 흐름은", conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }] };
    const opened = (await (await b.send(reading, "/api/tarot/reading", { body: { drawToken, input, unlock: { method: "free" } } })).json()) as { reading: unknown; chapterToken: string; readingId: string };
    const answer = await b.send(followup, "/api/followup", { body: { chapterToken: opened.chapterToken, reading: opened.reading, question: "조금 더 알려 주세요", readingId: opened.readingId } });
    expect(answer.status).toBe(200);
    const { chapterToken, remaining } = (await answer.json()) as { chapterToken: string; remaining: number };
    const { readings } = await listReadings(db, accountSecret()!, await userIdOf(db));
    expect(readings[0]?.chapter.turns).toHaveLength(1);
    expect(readings[0]?.chapter).toMatchObject({ chapterToken, followUpsLeft: remaining });
  });
});
