import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount } from "@/lib/account/deletion";
import { setTestDb } from "@/lib/db";
import type { TestD1 } from "@/lib/db/testing/sqliteD1";
import { OWNER_REPORTS_PAGE } from "@/lib/readings/report";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, loginAs, useTestDb } from "@/lib/testing/p4";
import { POST as reportPost } from "../../readings/report/route";
import { POST as ownerPost } from "../route";
import { GET, POST } from "./route";

const OWNER_CODE = "owner-code-for-tests-0001";
const T0 = Date.parse("2026-11-13T03:00:00Z");
let n = 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_OWNER_CODE", OWNER_CODE);
  resetMemoryLimiter();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function ownerBrowser() {
  const b = browser(`198.51.100.${200 + (++n % 50)}`);
  expect((await b.send(ownerPost, "/api/owner", { body: { code: OWNER_CODE }, origin: true })).status).toBe(200);
  return b;
}

type Row = { id: string; createdAt: number; userId?: string | null; readingId?: string | null; kind?: string; reason?: string; note?: string | null };
const insert = (db: TestD1, row: Row) =>
  db
    .prepare("INSERT INTO reading_reports (id, user_id, reading_id, kind, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.userId ?? null, row.readingId ?? null, row.kind ?? "tarot", row.reason ?? "offensive", row.note ?? null, row.createdAt);

const handledAt = async (db: TestD1, id: string) => (await db.prepare("SELECT handled_at FROM reading_reports WHERE id = ?").bind(id).first<{ handled_at: number | null }>())?.handled_at;

describe("GET/POST /api/owner/reading-reports (the owner pass only)", () => {
  it("refuses a visitor, a logged-in person, and the owner's write from another site", async () => {
    const db = useTestDb();
    await insert(db, { id: "rep_a", createdAt: T0 }).run();
    const visitor = browser("198.51.100.10");
    expect((await visitor.send(GET, "/api/owner/reading-reports")).status).toBe(403);
    expect((await visitor.send(POST, "/api/owner/reading-reports", { body: { id: "rep_a", handled: true }, origin: true })).status).toBe(403);
    const person = browser("198.51.100.11");
    await loginAs(person, "alice");
    const refused = await person.send(GET, "/api/owner/reading-reports");
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "FORBIDDEN" });
    const owner = await ownerBrowser();
    expect((await owner.send(POST, "/api/owner/reading-reports", { body: { id: "rep_a", handled: true } })).status).toBe(403);
    expect(await handledAt(db, "rep_a")).toBeNull();
  });

  it("lists reports newest first, a page at a time, never with the reporter, and links only a share link", async () => {
    const db = useTestDb();
    const older = Array.from({ length: OWNER_REPORTS_PAGE }, (_, i) => insert(db, { id: `rep_old_${String(i).padStart(2, "0")}`, createdAt: T0 - 60_000 * (i + 10) }));
    await db.batch([
      ...older,
      insert(db, { id: "rep_shared", createdAt: T0 - 1_000, userId: "u_reporter", readingId: "abc123def456", kind: "shared", reason: "misleading", note: "이상해요" }),
      insert(db, { id: "rep_teaser", createdAt: T0 - 2_000, kind: "teaser", reason: "harmful" }),
      // the same time as rep_teaser: the id breaks the tie
      insert(db, { id: "rep_saved", createdAt: T0 - 2_000, userId: "u_reporter", readingId: "abcdefghij0123456789", kind: "tarot", reason: "other" }),
    ]);
    const owner = await ownerBrowser();
    const first = (await (await owner.send(GET, "/api/owner/reading-reports")).json()) as { reports: Array<Record<string, unknown>>; next: string | null };
    expect(first.reports).toHaveLength(OWNER_REPORTS_PAGE);
    expect(first.reports.slice(0, 3)).toEqual([
      { id: "rep_shared", kind: "shared", readingId: "abc123def456", link: "/s/abc123def456", reason: "misleading", note: "이상해요", createdAt: T0 - 1_000, handledAt: null },
      { id: "rep_teaser", kind: "teaser", readingId: null, link: null, reason: "harmful", note: null, createdAt: T0 - 2_000, handledAt: null },
      { id: "rep_saved", kind: "tarot", readingId: "abcdefghij0123456789", link: null, reason: "other", note: null, createdAt: T0 - 2_000, handledAt: null },
    ]);
    expect(JSON.stringify(first)).not.toContain("u_reporter");
    expect(first.next).not.toBeNull();

    const second = (await (await owner.send(GET, `/api/owner/reading-reports?before=${encodeURIComponent(first.next!)}`)).json()) as typeof first;
    const all = [...first.reports, ...second.reports];
    expect(all).toHaveLength(OWNER_REPORTS_PAGE + 3);
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
    const times = all.map((r) => r.createdAt as number);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(second.next).toBeNull();

    expect((await owner.send(GET, "/api/owner/reading-reports?before=nonsense")).status).toBe(400);
  });

  it("marks a report handled (keeping the first time) and back, and says when there is no such report", async () => {
    const db = useTestDb();
    expect((await browser("198.51.100.30").send(reportPost, "/api/readings/report", { body: { kind: "daily", reason: "offensive" }, origin: true })).status).toBe(200);
    const owner = await ownerBrowser();
    const listed = (await (await owner.send(GET, "/api/owner/reading-reports")).json()) as { reports: Array<{ id: string; handledAt: number | null }> };
    const id = listed.reports[0]!.id;
    expect(listed.reports[0]!.handledAt).toBeNull();

    const mark = (body: unknown) => owner.send(POST, "/api/owner/reading-reports", { body, origin: true });
    expect(await (await mark({ id, handled: true })).json()).toEqual({ ok: true, handledAt: T0 });
    expect(await handledAt(db, id)).toBe(T0);
    vi.setSystemTime(T0 + 60_000);
    expect(await (await mark({ id, handled: true })).json()).toEqual({ ok: true, handledAt: T0 });
    expect(((await (await owner.send(GET, "/api/owner/reading-reports")).json()) as typeof listed).reports[0]!.handledAt).toBe(T0);
    expect(await (await mark({ id, handled: false })).json()).toEqual({ ok: true, handledAt: null });
    expect(await handledAt(db, id)).toBeNull();

    expect(await (await mark({ id: "no_such_report_0000000", handled: true })).json()).toEqual({ ok: false, handledAt: null });
    for (const body of [{ id: "../etc", handled: true }, { id: "a".repeat(65), handled: true }, { id }, { handled: true }, { id, handled: "yes" }]) {
      expect((await mark(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("a handled report still loses its reporter and note when the account is erased", async () => {
    const db = useTestDb();
    const b = browser("198.51.100.40");
    await loginAs(b, "alice");
    await b.send(reportPost, "/api/readings/report", { body: { kind: "saju", readingId: "abcdefghij0123456789", reason: "misleading", note: "메모" }, origin: true });
    const { id: reportId } = (await db.prepare("SELECT id FROM reading_reports").first<{ id: string }>())!;
    const owner = await ownerBrowser();
    expect((await owner.send(POST, "/api/owner/reading-reports", { body: { id: reportId, handled: true }, origin: true })).status).toBe(200);
    const { id: userId } = (await db.prepare("SELECT id FROM users").first<{ id: string }>())!;
    expect((await deleteAccount(db, null, { userId, now: T0 })).ok).toBe(true);
    expect(await db.prepare("SELECT user_id, note, reading_id, handled_at FROM reading_reports").first()).toEqual({ user_id: null, note: null, reading_id: "abcdefghij0123456789", handled_at: T0 });
  });
});
