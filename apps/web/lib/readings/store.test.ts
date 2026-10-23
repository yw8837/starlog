import { describe, expect, it, vi } from "vitest";
import type { D1Binding } from "@/lib/db/d1";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import {
  chapterReadingId,
  deleteAllReadings,
  deleteReading,
  insertReadingStatement,
  listReadings,
  newReadingId,
  readingExists,
  readingForUser,
  updateReadingChapter,
  type ServerChapter,
} from "./store";

const SECRET = "account-secret-for-tests-0123456789abcdef";

const chapter = (question: string): ServerChapter => ({
  kind: "tarot",
  question,
  conditions: [],
  note: "",
  cards: [],
  reading: { verdict: `${question}의 결론` },
  chapterToken: "token",
  createdAt: 1,
  turns: [],
  followUpsLeft: 3,
});

async function setup() {
  const db = migratedTestD1();
  for (const id of ["u_1", "u_2"]) {
    await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES (?, ?, '별', ?, 0, 0)").bind(id, `k_${id}`, `c_${id}`).run();
  }
  return db;
}

async function save(db: D1Binding, userId: string, c: ServerChapter, now = 10, unlockId: string | null = null) {
  const id = newReadingId();
  await (await insertReadingStatement(db, SECRET, { id, userId, productId: "tarot", source: "paid", unlockId, chapter: c, now })).run();
  return id;
}

const count = async (db: D1Binding) => (await db.prepare("SELECT COUNT(*) AS n FROM readings").first<{ n: number }>())!.n;

describe("saved readings", () => {
  it("makes ids that are also valid device chapter ids", () => {
    for (let i = 0; i < 20; i++) expect(newReadingId()).toMatch(/^[a-z0-9]{20}$/);
  });

  it("stores readings sealed and gives them back only to their owner, newest first, a page at a time", async () => {
    const db = await setup();
    const first = await save(db, "u_1", chapter("첫 질문"), 10);
    await save(db, "u_1", chapter("둘째 질문"), 20);
    await save(db, "u_1", chapter("셋째 질문"), 20);
    const raw = await db.prepare("SELECT payload, key_version FROM readings WHERE id = ?").bind(first).first<{ payload: string; key_version: number }>();
    expect(raw!.payload).not.toContain("첫 질문");
    expect(raw!.key_version).toBe(1);
    const page = await listReadings(db, SECRET, "u_1", { limit: 2 });
    expect(page.readings).toHaveLength(2);
    expect(page.next).not.toBeNull();
    const rest = await listReadings(db, SECRET, "u_1", { before: page.next!, limit: 2 });
    expect(rest.next).toBeNull();
    const questions = [...page.readings, ...rest.readings].map((r) => r.chapter.question);
    expect(questions).toHaveLength(3);
    expect(new Set(questions)).toEqual(new Set(["첫 질문", "둘째 질문", "셋째 질문"]));
    expect(questions[2]).toBe("첫 질문");
    expect((await listReadings(db, SECRET, "u_2")).readings).toEqual([]);
    expect(await readingForUser(db, SECRET, "u_2", first)).toBeNull();
    expect((await readingForUser(db, SECRET, "u_1", first))?.chapter.question).toBe("첫 질문");
  });

  it("keeps two identical readings (two purchases), saves nothing twice for one unlock, and nothing for a deleted account", async () => {
    const db = await setup();
    await save(db, "u_1", chapter("같은 질문"));
    await save(db, "u_1", chapter("같은 질문"));
    expect(await count(db)).toBe(2);
    await save(db, "u_1", chapter("한 번"), 10, "ul_1");
    await save(db, "u_1", chapter("한 번"), 11, "ul_1");
    expect(await count(db)).toBe(3);
    await db.prepare("UPDATE users SET deleted_at = 1 WHERE id = 'u_2'").run();
    const id = await save(db, "u_2", chapter("탈퇴한 계정"));
    expect(await count(db)).toBe(3);
    expect(await readingExists(db, "u_2", id)).toBe(false);
  });

  it("updates a saved chapter and deletes one or all", async () => {
    const db = await setup();
    const id = await save(db, "u_1", chapter("질문"));
    expect(await readingExists(db, "u_1", id)).toBe(true);
    const turn = { question: "더 물어볼게요", answer: "답이에요" };
    expect(await updateReadingChapter(db, SECRET, "u_1", id, (c) => ({ ...c, turns: [...c.turns, turn], followUpsLeft: 2 }), 30)).toBe(true);
    expect((await readingForUser(db, SECRET, "u_1", id))?.chapter).toMatchObject({ turns: [turn], followUpsLeft: 2 });
    expect(await updateReadingChapter(db, SECRET, "u_2", id, (c) => c, 31)).toBe(false);
    expect(await deleteReading(db, "u_2", id)).toBe(false);
    expect(await deleteReading(db, "u_1", id)).toBe(true);
    await save(db, "u_1", chapter("하나"));
    await save(db, "u_1", chapter("둘"));
    expect(await deleteAllReadings(db, "u_1")).toBe(2);
  });

  it("binds each payload to its account and reading: copied or moved to another row, it does not open", async () => {
    const db = await setup();
    const mine = await save(db, "u_1", chapter("내 질문"));
    const theirs = await save(db, "u_2", chapter("남의 질문"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.prepare("UPDATE readings SET payload = (SELECT payload FROM readings WHERE id = ?) WHERE id = ?").bind(mine, theirs).run();
    expect(await readingForUser(db, SECRET, "u_2", theirs)).toBeNull();
    await db.prepare("UPDATE readings SET user_id = 'u_2' WHERE id = ?").bind(mine).run();
    expect(await readingForUser(db, SECRET, "u_2", mine)).toBeNull();
    await db.prepare("UPDATE readings SET user_id = 'u_1' WHERE id = ?").bind(mine).run();
    expect((await readingForUser(db, SECRET, "u_1", mine))?.chapter.question).toBe("내 질문");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("readings.unreadable"));
    error.mockRestore();
  });

  it("skips a payload that does not open (altered, or labelled with another key version), and says so in the log", async () => {
    const db = await setup();
    const altered = await save(db, "u_1", chapter("질문"));
    await db.prepare("UPDATE readings SET payload = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' WHERE id = ?").bind(altered).run();
    // Sealed with version 1 but labelled 2: open() asks for the row's own version, whose key differs.
    const relabelled = await save(db, "u_1", chapter("다른 키"));
    await db.prepare("UPDATE readings SET key_version = 2 WHERE id = ?").bind(relabelled).run();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await listReadings(db, SECRET, "u_1")).readings).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("readings.unreadable"));
    error.mockRestore();
  });

  it("gives a chapter kept from a device one id per account (account sync): the same chapter again finds the same row", async () => {
    const db = await setup();
    const id = await chapterReadingId(SECRET, "u_1", "1700000000000.abc");
    expect(id).toMatch(/^[a-z0-9]{20}$/);
    expect(await chapterReadingId(SECRET, "u_1", "1700000000000.abc")).toBe(id);
    expect(await chapterReadingId(SECRET, "u_2", "1700000000000.abc")).not.toBe(id);
    expect(await chapterReadingId(SECRET, "u_1", "1700000000000.abd")).not.toBe(id);
    expect(await chapterReadingId("another-secret-for-tests-0123456789abcd", "u_1", "1700000000000.abc")).not.toBe(id);
    const keep = async (question: string) =>
      (await insertReadingStatement(db, SECRET, { id, userId: "u_1", productId: "tarot", source: "free", origin: "moved", unlockId: null, chapter: chapter(question), now: 10 })).run();
    expect((await keep("처음")).meta?.changes).toBe(1);
    expect((await keep("다시")).meta?.changes).toBe(0);
    expect(await count(db)).toBe(1);
    expect((await readingForUser(db, SECRET, "u_1", id))?.chapter.question).toBe("처음");
    expect(await db.prepare("SELECT source, origin FROM readings WHERE id = ?").bind(id).first()).toEqual({ source: "free", origin: "moved" });
  });

  it("leaves origin empty for a reading opened with a purchase, the gift or the owner pass, and refuses an unknown origin", async () => {
    const db = await setup();
    const id = await save(db, "u_1", chapter("결제"));
    expect(await db.prepare("SELECT origin FROM readings WHERE id = ?").bind(id).first()).toEqual({ origin: null });
    await expect(db.prepare("UPDATE readings SET origin = 'pasted' WHERE id = ?").bind(id).run()).rejects.toThrow(/CHECK/);
  });
});
