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
import { browser, loginAs, useTestDb } from "@/lib/testing/p4";
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

afterEach(() => setTestDb(null));

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/share", () => {
  it("makes one public link per reading, without the question or the note", async () => {
    const db = useTestDb();
    const b = browser();
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
    const res = await browser().send(POST, "/api/share", { body: { chapterToken, reading }, origin: true });
    expect(res.status).toBe(200);
  });

  it("refuses a reading the server did not write, another site's page, and a premium reading for now", async () => {
    useTestDb();
    const chapterToken = await issueChapter(ctx, reading, [], secret, Date.now());
    const edited = { ...reading, verdict: "스타로그가 쓰지 않은 말" };
    const forged = await browser().send(POST, "/api/share", { body: { chapterToken, reading: edited }, origin: true });
    expect(forged.status).not.toBe(200);
    expect((await json(forged)).code).toBe("BAD_TOKEN");
    const crossSite = await browser().send(POST, "/api/share", { body: { chapterToken, reading } });
    expect(crossSite.status).toBe(403);
    const deep = await issueChapter({ kind: "tarot-deep", input: ctx.input, cards: ctx.cards } as ChapterContext, reading, [], secret, Date.now());
    const premium = await browser().send(POST, "/api/share", { body: { chapterToken: deep, reading }, origin: true });
    expect((await json(premium)).code).toBe("NOT_AVAILABLE");
  });

  it("refuses a 오픈 기념 무료 reading (read and kept on its device only), with a clear message and nothing saved", async () => {
    const db = useTestDb();
    const chapterToken = await issueChapter({ ...ctx, opening: true } as ChapterContext, reading, [], secret, Date.now());
    const res = await browser().send(POST, "/api/share", { body: { chapterToken, reading }, origin: true });
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body).toMatchObject({ code: "NOT_AVAILABLE", reason: "opening" });
    expect(body.message).toContain("오픈 기념 무료 풀이는 이 기기에서 보고 보관만 할 수 있어요");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM shares").first()).toEqual({ n: 0 });
  });
});

describe("the card design of a share", () => {
  it("is the one the reading was written for (signed in its chapter), whatever the sharer's screen shows now", async () => {
    const db = useTestDb();
    const signed = { ...ctx, input: { ...(ctx as { input: object }).input, deck: "rws1909" } } as ChapterContext;
    const chapterToken = await issueChapter(signed, reading, [], secret, Date.now());
    const { id } = await json(await browser().send(POST, "/api/share", { body: { chapterToken, reading, deck: "starlog" }, origin: true }));
    const share = await findShare(db, id as string);
    expect(share?.payload.kind === "tarot" && share.payload.deck).toBe("rws1909");
  });

  it("is the 1909 scans for a reading opened before chapters carried one (it was written for them), whatever the sharer's screen shows", async () => {
    const db = useTestDb();
    const chapterToken = await issueChapter(ctx, reading, [], secret, Date.now());
    const { id } = await json(await browser().send(POST, "/api/share", { body: { chapterToken, reading, deck: "starlog" }, origin: true }));
    const share = await findShare(db, id as string);
    expect(share?.payload.kind === "tarot" && share.payload.deck).toBe("rws1909");
  });
});

describe("the owner of a share", () => {
  beforeEach(() => {
    vi.stubEnv("STARLOG_PAYMENTS", "on");
    vi.stubEnv("STARLOG_KAKAO", "mock");
    resetMemoryLimiter();
  });
  afterEach(() => vi.unstubAllEnvs());

  const ownerOf = async (db: D1Binding, id: unknown) => (await db.prepare("SELECT user_id FROM shares WHERE id = ?").bind(id).first<{ user_id: string | null }>())?.user_id;

  it("is the signed-in account that made it, and its shares go when that account is deleted", async () => {
    const db = useTestDb();
    const signedIn = browser("198.51.100.7");
    await loginAs(signedIn, "alice");
    const mine = await json(await signedIn.send(POST, "/api/share", { body: { chapterToken: await issueChapter(ctx, reading, [], secret, Date.now()), reading }, origin: true }));
    const other = { ...reading, verdict: "다른 날의 풀이예요." };
    const anonymous = await json(await browser().send(POST, "/api/share", { body: { chapterToken: await issueChapter(ctx, other, [], secret, Date.now()), reading: other }, origin: true }));
    const userId = await ownerOf(db, mine.id);
    expect(userId).toEqual(expect.any(String));
    expect(await ownerOf(db, anonymous.id)).toBeNull();

    expect(await deleteAccount(db, null, { userId: userId as string, now: Date.now() })).toEqual({ ok: true, refunded: 0 });
    expect(await findShare(db, mine.id as string)).toBeNull();
    expect(await findShare(db, anonymous.id as string)).not.toBeNull();
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
  it("stops sharing: the link answers nothing afterwards, and sharing again makes a new one", async () => {
    const db = useTestDb();
    const b = browser();
    const chapterToken = await issueChapter(ctx, reading, [], secret, Date.now());
    const { id } = await json(await b.send(POST, "/api/share", { body: { chapterToken, reading }, origin: true }));
    const stopped = await b.send(DELETE, "/api/share", { method: "DELETE", body: { chapterToken, reading }, origin: true });
    expect(await json(stopped)).toEqual({ deleted: true });
    expect(await findShare(db, id as string)).toBeNull();
    const again = await json(await b.send(POST, "/api/share", { body: { chapterToken, reading }, origin: true }));
    expect(again.id).not.toBe(id);
  });
});
