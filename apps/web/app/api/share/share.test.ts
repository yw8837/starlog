import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount } from "@/lib/account/deletion";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import { issueChapter, type ChapterContext } from "@/lib/security/chapterToken";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { buildSharePayload } from "@/lib/share/payload";
import { SHARE_TTL_MS, findShare, purgeExpiredShares, saveShare } from "@/lib/share/store";
import { browser, loginAs, useTestDb, type Browser } from "@/lib/testing/p4";
import { DELETE, POST } from "./route";

const secret = signingSecret() as string;
const reading = TAROT_SAMPLE.paid;
const ctx: ChapterContext = {
  kind: "tarot",
  templateId: "relationship-contact",
  input: { topicId: "love", whoId: "us", question: "그 사람에게 먼저 연락해도 될까요?", conditions: [], note: "비밀 메모예요" },
  cards: [
    ["major-09-hermit", "upright"],
    ["major-17-star", "reversed"],
    ["cups-03", "upright"],
  ],
};

const DAY = 24 * 3_600_000;

beforeEach(() => {
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  resetMemoryLimiter();
});
afterEach(() => {
  setTestDb(null);
  vi.unstubAllEnvs();
});

/** Making a link needs a session (owner 2026-11-04, code review 2026-11-05). */
async function member(ip = "203.0.113.70"): Promise<Browser> {
  const b = browser(ip);
  await loginAs(b, "sharer");
  return b;
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/share", () => {
  it("answers the login without a session: no link is made from a device-held token, and no share is saved", async () => {
    const db = useTestDb();
    const chapterToken = await issueChapter(ctx, reading, [], secret, Date.now());
    const res = await browser("203.0.113.71").send(POST, "/api/share", { body: { chapterToken, reading }, origin: true });
    expect(res.status).toBe(401);
    expect(await json(res)).toMatchObject({ code: "LOGIN_REQUIRED", reason: "share", message: "공유 링크는 로그인하고 만들 수 있어요." });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM shares").first()).toEqual({ n: 0 });
  });

  it("makes one public link per reading, without the question or the note", async () => {
    const db = useTestDb();
    const b = await member();
    const chapterToken = await issueChapter(ctx, reading, [], secret, Date.now());
    const first = await b.send(POST, "/api/share", { body: { chapterToken, reading, deck: "starlog" }, origin: true });
    expect(first.status).toBe(200);
    const { id, path } = await json(first);
    expect(path).toBe(`/s/${id}`);
    const again = await json(await b.send(POST, "/api/share", { body: { chapterToken, reading }, origin: true }));
    expect(again.id).toBe(id);
    const share = await findShare(db, id as string);
    expect(share?.payload.kind).toBe("tarot");
    const stored = JSON.stringify(share?.payload);
    expect(stored).not.toContain("먼저 연락해도");
    expect(stored).not.toContain("비밀 메모");
  });

  it("still shares a reading whose follow-ups have ended (its token is past 7 days)", async () => {
    useTestDb();
    const now = Date.now();
    const chapterToken = await issueChapter(ctx, reading, [], secret, now - 10 * DAY, now - 3 * DAY);
    const res = await (await member()).send(POST, "/api/share", { body: { chapterToken, reading }, origin: true });
    expect(res.status).toBe(200);
  });

  it("refuses a reading the server did not write and another site's page; a premium reading shares its image's fields only (owner 2026-10-23)", async () => {
    useTestDb();
    const chapterToken = await issueChapter(ctx, reading, [], secret, Date.now());
    const edited = { ...reading, verdict: "스타로그가 쓰지 않은 말" };
    const forged = await (await member()).send(POST, "/api/share", { body: { chapterToken, reading: edited }, origin: true });
    expect(forged.status).not.toBe(200);
    expect((await json(forged)).code).toBe("BAD_TOKEN");
    const crossSite = await (await member()).send(POST, "/api/share", { body: { chapterToken, reading } });
    expect(crossSite.status).toBe(403);
    const db = useTestDb();
    const deep = await issueChapter({ kind: "tarot-deep", input: ctx.input, cards: ctx.cards } as ChapterContext, reading, [], secret, Date.now());
    const premium = await (await member()).send(POST, "/api/share", { body: { chapterToken: deep, reading }, origin: true });
    expect(premium.status).toBe(200);
    const shared = await findShare(db, (await json(premium)).id as string);
    expect(shared?.payload).toEqual({ kind: "premium", v: 1, product: "tarot-deep", deck: "rws1909", cards: ctx.cards.map(([cardId, orientation]) => ({ cardId, orientation })) });
    expect(JSON.stringify(shared?.payload)).not.toContain(reading.verdict);
  });

  it("answers a kind it does not share with NOT_AVAILABLE, not a crash (review 2026-10-23)", async () => {
    useTestDb();
    const chapterToken = await issueChapter({ kind: "someday-kind", input: ctx.input } as unknown as ChapterContext, reading, [], secret, Date.now());
    const res = await (await member()).send(POST, "/api/share", { body: { chapterToken, reading }, origin: true });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect((await json(res)).code).toBe("NOT_AVAILABLE");
  });

  it("shares a 오픈 기념 무료 reading too (owner 2026-10-23), without the question or the note", async () => {
    const db = useTestDb();
    const chapterToken = await issueChapter({ ...ctx, opening: true } as ChapterContext, reading, [], secret, Date.now());
    const res = await (await member()).send(POST, "/api/share", { body: { chapterToken, reading }, origin: true });
    expect(res.status).toBe(200);
    const { id, path } = await json(res);
    expect(path).toBe(`/s/${id}`);
    const stored = JSON.stringify((await findShare(db, id as string))?.payload);
    expect(stored).not.toContain("먼저 연락해도");
    expect(stored).not.toContain("비밀 메모");
  });
});

describe("the card design of a share", () => {
  it("is the one the reading was written for (signed in its chapter), whatever the sharer's screen shows now", async () => {
    const db = useTestDb();
    const signed = { ...ctx, input: { ...(ctx as { input: object }).input, deck: "rws1909" } } as ChapterContext;
    const chapterToken = await issueChapter(signed, reading, [], secret, Date.now());
    const { id } = await json(await (await member()).send(POST, "/api/share", { body: { chapterToken, reading, deck: "starlog" }, origin: true }));
    const share = await findShare(db, id as string);
    expect(share?.payload.kind === "tarot" && share.payload.deck).toBe("rws1909");
  });

  it("is the 1909 scans for a reading opened before chapters carried one (it was written for them), whatever the sharer's screen shows", async () => {
    const db = useTestDb();
    const chapterToken = await issueChapter(ctx, reading, [], secret, Date.now());
    const { id } = await json(await (await member()).send(POST, "/api/share", { body: { chapterToken, reading, deck: "starlog" }, origin: true }));
    const share = await findShare(db, id as string);
    expect(share?.payload.kind === "tarot" && share.payload.deck).toBe("rws1909");
  });
});

describe("the owner of a share", () => {
  const ownerOf = async (db: D1Binding, id: unknown) => (await db.prepare("SELECT user_id FROM shares WHERE id = ?").bind(id).first<{ user_id: string | null }>())?.user_id;

  it("is the signed-in account that made it, and its shares go when that account is deleted", async () => {
    const db = useTestDb();
    const signedIn = browser("198.51.100.7");
    await loginAs(signedIn, "alice");
    const mine = await json(await signedIn.send(POST, "/api/share", { body: { chapterToken: await issueChapter(ctx, reading, [], secret, Date.now()), reading }, origin: true }));
    const other = { ...reading, verdict: "다른 날의 풀이예요." };
    // Made before a link needed a session (owner 2026-11-04): it has no owner, and no account's deletion takes it down.
    const before = await saveShare(db, "key_before_the_login", buildSharePayload(ctx, other, "starlog"), Date.now());
    const userId = await ownerOf(db, mine.id);
    expect(userId).toEqual(expect.any(String));
    expect(await ownerOf(db, before)).toBeNull();

    expect(await deleteAccount(db, null, { userId: userId as string, now: Date.now() })).toEqual({ ok: true, refunded: 0 });
    expect(await findShare(db, mine.id as string)).toBeNull();
    expect(await findShare(db, before)).not.toBeNull();
  });
});

describe("the life of a share (SHARE-3)", () => {
  it("answers nothing 180 days after it was made and is purged then; shared again before the purge, it starts its 180 days over", async () => {
    expect(SHARE_TTL_MS).toBe(180 * DAY);
    const db = useTestDb();
    const T0 = Date.parse("2026-10-22T03:00:00Z");
    const payload = buildSharePayload(ctx, reading, "starlog");
    const id = await saveShare(db, "key_life", payload, T0);
    expect(await findShare(db, id, T0 + SHARE_TTL_MS - 1)).not.toBeNull();
    expect(await findShare(db, id, T0 + SHARE_TTL_MS)).toBeNull();
    // Sharing the same reading again keeps its address; one past its 180 days starts over.
    expect(await saveShare(db, "key_life", payload, T0 + 10 * DAY)).toBe(id);
    expect(await findShare(db, id, T0 + SHARE_TTL_MS)).toBeNull();
    expect(await saveShare(db, "key_life", payload, T0 + SHARE_TTL_MS + 5)).toBe(id);
    expect(await findShare(db, id, T0 + 2 * SHARE_TTL_MS)).not.toBeNull();
    expect(await purgeExpiredShares(db, T0 + 2 * SHARE_TTL_MS + 4)).toBe(0);
    expect(await purgeExpiredShares(db, T0 + 2 * SHARE_TTL_MS + 5)).toBe(1);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM shares").first()).toEqual({ n: 0 });
  });
});

describe("DELETE /api/share", () => {
  it("stops a share without a session: it exposes nothing, and it is the device's privacy action", async () => {
    useTestDb();
    const chapterToken = await issueChapter(ctx, reading, [], secret, Date.now());
    const { id } = await json(await (await member()).send(POST, "/api/share", { body: { chapterToken, reading }, origin: true }));
    expect(id).toEqual(expect.any(String));
    const stopped = await browser("203.0.113.72").send(DELETE, "/api/share", { method: "DELETE", body: { chapterToken, reading }, origin: true });
    expect(stopped.status).toBe(200);
    expect(await json(stopped)).toEqual({ deleted: true });
  });

  it("stops sharing: the link answers nothing afterwards, and sharing again makes a new one", async () => {
    const db = useTestDb();
    const b = await member();
    const chapterToken = await issueChapter(ctx, reading, [], secret, Date.now());
    const { id } = await json(await b.send(POST, "/api/share", { body: { chapterToken, reading }, origin: true }));
    const stopped = await b.send(DELETE, "/api/share", { method: "DELETE", body: { chapterToken, reading }, origin: true });
    expect(await json(stopped)).toEqual({ deleted: true });
    expect(await findShare(db, id as string)).toBeNull();
    const again = await json(await b.send(POST, "/api/share", { body: { chapterToken, reading }, origin: true }));
    expect(again.id).not.toBe(id);
  });
});
