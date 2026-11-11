import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount } from "@/lib/account/deletion";
import { setTestDb } from "@/lib/db";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, loginAs, useTestDb } from "@/lib/testing/p4";
import { POST } from "./route";

const T0 = Date.parse("2026-11-11T03:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  resetMemoryLimiter();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const NOTE = "이 문장이 불편했어요: 너는 쓸모없다";

describe("POST /api/readings/report", () => {
  it("records a visitor's report (kind, reason, note, no user) and logs kind and reason only, never the note", async () => {
    const db = useTestDb();
    const res = await browser().send(POST, "/api/readings/report", { body: { kind: "teaser", reason: "offensive", note: NOTE }, origin: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const row = await db.prepare("SELECT * FROM reading_reports").first<Record<string, unknown>>();
    expect(row).toMatchObject({ user_id: null, reading_id: null, kind: "teaser", reason: "offensive", note: NOTE, created_at: T0 });
    expect(row!.id).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(console.info).toHaveBeenCalledWith(JSON.stringify({ evt: "report.reading", kind: "teaser", reason: "offensive" }));
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("쓸모없다");
  });

  it("keeps the reporter and the reading id when logged in, and stores no reading text", async () => {
    const db = useTestDb();
    const b = browser();
    await loginAs(b, "alice");
    const res = await b.send(POST, "/api/readings/report", { body: { kind: "tarot", readingId: "abcdefghij0123456789", reason: "harmful" }, origin: true });
    expect(await res.json()).toEqual({ ok: true });
    const user = await db.prepare("SELECT id FROM users").first<{ id: string }>();
    expect(await db.prepare("SELECT user_id, reading_id, kind, reason, note FROM reading_reports").first()).toEqual({
      user_id: user!.id, reading_id: "abcdefghij0123456789", kind: "tarot", reason: "harmful", note: null,
    });
  });

  it("refuses what is not one of the fixed kinds and reasons, an odd reading id, a note over 500 characters, and other sites", async () => {
    const db = useTestDb();
    const send = (body: unknown, origin = true) => browser().send(POST, "/api/readings/report", { body, origin });
    for (const body of [
      { kind: "poem", reason: "offensive" },
      { kind: "tarot", reason: "boring" },
      { kind: "tarot", reason: "other", readingId: "../etc" },
      { kind: "tarot", reason: "other", readingId: "a".repeat(65) },
      { kind: "tarot", reason: "other", note: "가".repeat(501) },
      { kind: "tarot" },
    ]) expect((await send(body)).status, JSON.stringify(body)).toBe(400);
    expect((await send({ kind: "tarot", reason: "other" }, false)).status).toBe(403);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM reading_reports").first()).toEqual({ n: 0 });
    expect((await send({ kind: "shared", readingId: "abc123def456", reason: "other", note: "가".repeat(500) })).status).toBe(200);
  });

  it("keeps a deleted account's reports without the account (user_id NULL)", async () => {
    const db = useTestDb();
    const b = browser();
    await loginAs(b, "alice");
    await b.send(POST, "/api/readings/report", { body: { kind: "saju", reason: "misleading" }, origin: true });
    const { id } = (await db.prepare("SELECT id FROM users").first<{ id: string }>())!;
    // deleteAccount erases the account (eraseDeletedAccount) once it is marked deleted
    expect((await deleteAccount(db, null, { userId: id, now: T0 })).ok).toBe(true);
    expect(await db.prepare("SELECT user_id, kind, reason FROM reading_reports").first()).toEqual({ user_id: null, kind: "saju", reason: "misleading" });
  });
});
