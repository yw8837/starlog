import { afterEach, describe, expect, it } from "vitest";
import { setTestDb } from "@/lib/db";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import { issueChapter, type ChapterContext } from "@/lib/security/chapterToken";
import { signingSecret } from "@/lib/security/sign";
import { findShare } from "@/lib/share/store";
import { browser, useTestDb } from "@/lib/testing/p4";
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

  it("falls back to the sharer's design for a reading opened before chapters carried one", async () => {
    const db = useTestDb();
    const chapterToken = await issueChapter(ctx, reading, [], secret, Date.now());
    const { id } = await json(await browser().send(POST, "/api/share", { body: { chapterToken, reading, deck: "rws1909" }, origin: true }));
    const share = await findShare(db, id as string);
    expect(share?.payload.kind === "tarot" && share.payload.deck).toBe("rws1909");
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
