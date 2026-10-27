import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret } from "@/lib/account/secrets";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { resetSpendState } from "@/lib/api/spend";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import type { TestD1 } from "@/lib/db/testing/sqliteD1";
import { listReadings } from "@/lib/readings/store";
import { issueChapter } from "@/lib/security/chapterToken";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { browser, loginAs, useTestDb, type Browser } from "@/lib/testing/p4";
import { GET as callback } from "../auth/kakao/callback/route";
import { GET as start } from "../auth/kakao/start/route";
import { POST as deleteIntent } from "../account/delete-intent/route";
import { POST as review } from "../reviews/route";
import { POST as draw } from "../tarot/draw/route";
import { POST as reading } from "../tarot/reading/route";
import { POST as move } from "./move/route";
import { DELETE as remove, GET as list } from "./route";

/**
 * Account sync (owner 2026-10-23 "웹이랑 모바일에서 각각 로그인하면 내결과가 공유안됨"), from the privacy revision of
 * 2026-10-31 00:00 KST (lib/legal.ts SYNC_REVISION_DATE): a 오픈 기념 무료 reading opened while logged in is kept in the
 * account, and a reading a device kept moves in when its user asks, only when the server can vouch for it.
 */

/** 2026-10-31 12:00 KST: the revision in force, 오픈 기념 무료 still on (it ends 12/01 00:00 KST). */
const SYNCED = Date.parse("2026-10-31T03:00:00Z");
/** The minute before the revision. */
const BEFORE = Date.parse("2026-10-30T23:59:00+09:00");

const INPUT = {
  topicId: "money", whoId: "me" as const, whenId: "week" as const,
  question: "이번 주, 나의 재물 흐름은 어떨까",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }],
  note: "카드값이 많이 나왔어요",
  deck: "starlog" as const,
};

let ipSeq = 0;
const nextIp = () => `198.51.100.${++ipSeq}`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(SYNCED);
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  resetMemoryLimiter();
  resetDailyStore();
  resetSpendState();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function loggedIn(name = "alice"): Promise<Browser> {
  const b = browser(nextIp());
  await loginAs(b, name);
  return b;
}

type Opened = { reading: Record<string, unknown>; chapterToken: string; readingId?: string };

/** 오픈 기념 무료 (no `unlock`): the device's one free tarot reading. */
async function openFree(b: Browser): Promise<Opened> {
  const { drawToken } = (await (await b.send(draw, "/api/tarot/draw", { body: { templateId: "self-flow", picks: [3, 30, 60] } })).json()) as { drawToken: string };
  const res = await b.send(reading, "/api/tarot/reading", { body: { drawToken, input: INPUT } });
  expect(res.status).toBe(200);
  return (await res.json()) as Opened;
}

type Page = { readings: Array<{ id: string; createdAt: number; chapter: Record<string, unknown> }>; next: string | null };
const accountOf = async (b: Browser) => (await (await b.send(list, "/api/readings")).json()) as Page;
const count = async (db: D1Binding) => (await db.prepare("SELECT COUNT(*) AS n FROM readings").first<{ n: number }>())!.n;
const rowOf = (db: D1Binding, id: string) => db.prepare("SELECT kind, product_id, source, origin, unlock_id FROM readings WHERE id = ?").bind(id).first();

type MoveItem = { id: string; chapterToken: string; reading: unknown; title?: string; summary?: string };
type MoveAnswer = { moved: Array<{ id: string; readingId: string }>; kept: Array<{ id: string; reason: string }> };
const moveAs = (b: Browser, chapters: MoveItem[], origin = true) => b.send(move, "/api/readings/move", { body: { chapters }, origin });

describe("a 오픈 기념 무료 reading opened while logged in (account sync)", () => {
  it("is kept in the account from 2026-10-31 and shows on another device logged in to the same account", async () => {
    const db = useTestDb();
    const web = await loggedIn("alice");
    const opened = await openFree(web);
    expect(opened.readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(await rowOf(db, opened.readingId!)).toEqual({ kind: "tarot", product_id: "tarot", source: "free", origin: "opening", unlock_id: null });

    const phone = await loggedIn("alice");
    const { readings } = await accountOf(phone);
    expect(readings).toHaveLength(1);
    expect(readings[0]!.id).toBe(opened.readingId);
    // What the device keeps: the question and cards it was opened with, no follow-ups (the record shows no follow-up box).
    expect(readings[0]!.chapter).toMatchObject({
      kind: "tarot", question: INPUT.question, note: INPUT.note, deck: "starlog", opening: true, chapterToken: opened.chapterToken, reading: opened.reading, turns: [],
    });
    expect(readings[0]!.chapter.cards).toHaveLength(3);
    // Another account sees nothing of it.
    expect((await accountOf(await loggedIn("bob"))).readings).toEqual([]);
  });

  it("stays on the device before 2026-10-31 00:00 KST; a visitor who is not logged in is sent to log in (owner 2026-10-27)", async () => {
    const db = useTestDb();
    vi.setSystemTime(BEFORE);
    const before = await openFree(await loggedIn("alice"));
    expect(before.readingId).toBeUndefined();
    vi.setSystemTime(SYNCED);
    const guest = browser(nextIp());
    const { drawToken } = (await (await guest.send(draw, "/api/tarot/draw", { body: { templateId: "self-flow", picks: [3, 30, 60] } })).json()) as { drawToken: string };
    const refused = await guest.send(reading, "/api/tarot/reading", { body: { drawToken, input: INPUT } });
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({ code: "LOGIN_REQUIRED", reason: "opening" });
    expect(await count(db)).toBe(0);
  });

  it("never fails the reading when the account copy cannot be written: it stays on the device", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    (db as TestD1).exec("DROP TABLE reviews; DROP TABLE readings;");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const opened = await openFree(b);
    expect(opened.readingId).toBeUndefined();
    expect(opened.chapterToken).toBeTruthy();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("opening.keep_failed"));
  });

  it("refuses 오픈 기념 무료 when the account cannot be read at all (D1 throws): its claim cannot be checked, so it fails closed, never a 500", async () => {
    useTestDb();
    const b = await loggedIn("alice");
    const down = () => {
      throw new Error("D1_ERROR: storage unavailable");
    };
    setTestDb({ prepare: down, batch: down, exec: down } as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { drawToken } = (await (await b.send(draw, "/api/tarot/draw", { body: { templateId: "self-flow", picks: [3, 30, 60] } })).json()) as { drawToken: string };
    const refused = await b.send(reading, "/api/tarot/reading", { body: { drawToken, input: INPUT } });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "NOT_AVAILABLE", reason: "opening" });
    expect(b.jar.has("sl_first")).toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("opening.account_failed"));
  });

  it("takes no review: free readings never took one, and reviews sit by the paid prices", async () => {
    useTestDb();
    const b = await loggedIn("alice");
    const opened = await openFree(b);
    const res = await b.send(review, "/api/reviews", { body: { readingId: opened.readingId, rating: 5 }, origin: true });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "NOT_AVAILABLE", message: "오픈 기념 무료로 연 풀이에는 후기를 남길 수 없어요." });
  });
});

describe("moving this device's readings into the account (account sync)", () => {
  /**
   * A 오픈 기념 무료 reading this device kept alone: opened logged in before account sync (2026-10-31), as it was then (a
   * visitor opens none since owner 2026-10-27). The browser stays logged in; the clock moves to the revision.
   */
  async function openedBeforeSync(name = "alice") {
    vi.setSystemTime(BEFORE);
    const b = await loggedIn(name);
    const opened = await openFree(b);
    expect(opened.readingId).toBeUndefined();
    vi.setSystemTime(SYNCED);
    return { b, opened };
  }

  it("moves a reading the server can vouch for (signed token, unchanged reading), from the token's own fields, and shows it on another device", async () => {
    const db = useTestDb();
    const { b, opened } = await openedBeforeSync();
    const res = await moveAs(b, [{ id: "localabc123", chapterToken: opened.chapterToken, reading: opened.reading }]);
    expect(res.status).toBe(200);
    const answer = (await res.json()) as MoveAnswer;
    expect(answer.kept).toEqual([]);
    expect(answer.moved).toEqual([{ id: "localabc123", readingId: expect.stringMatching(/^[a-z0-9]{20}$/) }]);
    const readingId = answer.moved[0]!.readingId;
    expect(await rowOf(db, readingId)).toEqual({ kind: "tarot", product_id: "tarot", source: "free", origin: "moved", unlock_id: null });

    const phone = await loggedIn("alice");
    const { readings } = await accountOf(phone);
    expect(readings.map((r) => r.id)).toEqual([readingId]);
    // `moved`: every device shows it takes no review (writeReview refuses origin 'moved').
    expect(readings[0]!.chapter).toMatchObject({ kind: "tarot", question: INPUT.question, opening: true, moved: true, reading: opened.reading, chapterToken: opened.chapterToken });
    // Dated when the server wrote it (the token's), not when the device says.
    expect(readings[0]!.createdAt).toBe(BEFORE);
  });

  it("is idempotent: the same reading moved again, from a retry or a reading already kept, is the same row", async () => {
    const db = useTestDb();
    const { b, opened } = await openedBeforeSync();
    const item = { id: "localabc123", chapterToken: opened.chapterToken, reading: opened.reading };
    const first = (await (await moveAs(b, [item])).json()) as MoveAnswer;
    const again = (await (await moveAs(b, [item, { ...item, id: "localdup999" }])).json()) as MoveAnswer;
    expect(again.moved.map((m) => m.readingId)).toEqual([first.moved[0]!.readingId, first.moved[0]!.readingId]);
    expect(await count(db)).toBe(1);
    // A 오픈 기념 무료 reading opened logged in is kept under the same id, so moving its device copy adds nothing.
    vi.setSystemTime(SYNCED + 60_000);
    const member = await loggedIn("carol");
    const kept = await openFree(member);
    const moved = (await (await moveAs(member, [{ id: "localkept01", chapterToken: kept.chapterToken, reading: kept.reading }])).json()) as MoveAnswer;
    expect(moved.moved).toEqual([{ id: "localkept01", readingId: kept.readingId }]);
    expect(await count(db)).toBe(2);
  });

  it("keeps on the device what it cannot vouch for: a changed reading, a forged or emptied token, a premium reading", async () => {
    const db = useTestDb();
    const { b, opened } = await openedBeforeSync();
    const secret = signingSecret()!;
    const premiumReading = { verdict: "깊게 본 결론" };
    const premiumToken = await issueChapter(
      { kind: "tarot-deep", input: { topicId: "money", question: "깊게", conditions: [] }, cards: [["major-00", "upright"]] }, premiumReading, [], secret, Date.now(),
    );
    const forged = await issueChapter({ kind: "tarot", templateId: "self-flow", input: { ...INPUT, conditions: [...INPUT.conditions] }, cards: [["major-00", "upright"]] }, opened.reading, [], "not-the-server-secret-0123456789abcdef", Date.now());
    const answer = (await (
      await moveAs(b, [
        { id: "changed0001", chapterToken: opened.chapterToken, reading: { ...opened.reading, verdict: "고쳐 쓴 결론" } },
        { id: "forged00001", chapterToken: forged, reading: opened.reading },
        { id: "emptied0001", chapterToken: "", reading: opened.reading },
        { id: "premium0001", chapterToken: premiumToken, reading: premiumReading },
      ])
    ).json()) as MoveAnswer;
    expect(answer.moved).toEqual([]);
    expect(answer.kept).toEqual([
      { id: "changed0001", reason: "unverified" },
      { id: "forged00001", reason: "unverified" },
      { id: "emptied0001", reason: "unverified" },
      { id: "premium0001", reason: "kind" },
    ]);
    expect(await count(db)).toBe(0);
  });

  it("moves a saju reading with its birth and status chips from the token, and the teaser's labels cut to size as a paid one keeps them", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const birth = { calendar: "solar", year: 1992, month: 8, day: 3, isLeapMonth: false, timeKnown: false, hour: null, minute: null, gender: "male", placeId: "seoul" };
    const sajuReading = { sections: [{ heading: "타고난 기운", body: "단단한 흙의 기운" }] };
    const token = await issueChapter({ kind: "saju", birth: birth as never, profile: { loveStatus: "솔로", workStatus: "직장인" } }, sajuReading, [], signingSecret()!, SYNCED - 3 * 86_400_000);
    const answer = (await (await moveAs(b, [{ id: "sajulocal01", chapterToken: token, reading: sajuReading, title: "흙".repeat(100), summary: "요약" }])).json()) as MoveAnswer;
    const { readings } = await listReadings(db, accountSecret()!, (await db.prepare("SELECT id FROM users").first<{ id: string }>())!.id);
    expect(readings.map((r) => r.id)).toEqual([answer.moved[0]!.readingId]);
    expect(readings[0]!.chapter).toMatchObject({ kind: "saju", birth, context: { loveStatus: "single", workStatus: "employee" }, summary: "요약", reading: sajuReading });
    expect(readings[0]!.chapter.title).toBe("흙".repeat(80));
    expect(readings[0]!.createdAt).toBe(SYNCED - 3 * 86_400_000);
  });

  it("takes no review for a moved reading: who opened it is not known (an owner-pass reading must never review itself)", async () => {
    useTestDb();
    const { b, opened } = await openedBeforeSync();
    const { moved } = (await (await moveAs(b, [{ id: "localabc123", chapterToken: opened.chapterToken, reading: opened.reading }])).json()) as MoveAnswer;
    const res = await b.send(review, "/api/reviews", { body: { readingId: moved[0]!.readingId, rating: 5 }, origin: true });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "NOT_AVAILABLE", message: "이 기기에서 옮긴 풀이에는 후기를 남길 수 없어요." });
  });

  it("asks for a login, our own page and the revision's date, and refuses a body that is not a list of readings", async () => {
    useTestDb();
    const { b, opened } = await openedBeforeSync();
    const item = { id: "localabc123", chapterToken: opened.chapterToken, reading: opened.reading };
    expect((await moveAs(browser(nextIp()), [item])).status).toBe(401);
    expect((await moveAs(b, [item], false)).status).toBe(403);
    expect((await b.send(move, "/api/readings/move", { body: { chapters: [] }, origin: true })).status).toBe(400);
    expect((await b.send(move, "/api/readings/move", { body: { chapters: Array.from({ length: 6 }, (_, i) => ({ ...item, id: `local00000${i}` })) }, origin: true })).status).toBe(400);
    vi.setSystemTime(BEFORE);
    const early = await moveAs(b, [item]);
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ code: "NOT_AVAILABLE", reason: "not-yet" });
  });

  it("is erased with the rest: 계정에 보관한 풀이 모두 지우기 and 회원 탈퇴 remove moved and kept readings alike", async () => {
    const db = useTestDb();
    // dave's reading on a shared browser, moved by alice there: alice's own 오픈 기념 무료 is still hers to keep.
    const { b, opened } = await openedBeforeSync("dave");
    await loginAs(b, "alice");
    await moveAs(b, [{ id: "localabc123", chapterToken: opened.chapterToken, reading: opened.reading }]);
    expect(await (await b.send(remove, "/api/readings?all=1", { method: "DELETE", origin: true })).json()).toEqual({ deleted: 1 });
    await moveAs(b, [{ id: "localabc123", chapterToken: opened.chapterToken, reading: opened.reading }]);
    vi.setSystemTime(SYNCED + 60_000);
    // 오픈 기념 무료 is one per device: alice's auto-kept one comes from another browser of hers.
    await openFree(await loggedIn("alice"));
    expect(await count(db)).toBe(2);
    const { url } = (await (await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
    const started = await b.send(start, `${url}&mockUser=alice`);
    expect((await b.send(callback, started.headers.get("location")!)).headers.get("location")).toBe("http://localhost/me?account=deleted");
    expect(await count(db)).toBe(0);
  });
});
