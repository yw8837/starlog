import { describe, expect, it } from "vitest";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import { writeReview } from "@/lib/reviews/store";
import { insertReadingStatement, listReadings, newReadingId, type ServerChapter } from "./store";

/**
 * Account sync's readings.origin comes with its own migration (*_reading_origin.sql). A deploy that runs ahead of it must
 * not break what worked before: a paid reading is saved, listed and reviewed as it was. Only account sync's own writes
 * (origin 'opening' or 'moved') need the column.
 */

const SECRET = "account-secret-for-tests-0123456789abcdef";
const chapter: ServerChapter = { kind: "tarot", question: "결제한 질문", reading: { verdict: "결론" }, chapterToken: "t", createdAt: 1, turns: [], followUpsLeft: 3 };

async function setup() {
  const db = migratedTestD1({ without: "reading_origin" });
  expect((await db.prepare("SELECT name FROM pragma_table_info('readings') WHERE name = 'origin'").all()).results).toEqual([]);
  await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_1', 'k_1', '별손님', 'c_1', 0, 0)").run();
  return db;
}

describe("before the origin migration", () => {
  it("saves, lists and reviews a paid reading as before", async () => {
    const db = await setup();
    const id = newReadingId();
    const saved = await (await insertReadingStatement(db, SECRET, { id, userId: "u_1", productId: "tarot", source: "paid", unlockId: null, chapter, now: 10 })).run();
    expect(saved.meta?.changes).toBe(1);
    expect((await listReadings(db, SECRET, "u_1")).readings.map((r) => r.chapter.question)).toEqual(["결제한 질문"]);
    const review = await writeReview(db, SECRET, { userId: "u_1", nickname: "별손님", readingId: id, rating: 5, body: "좋았어요", now: 20 });
    expect(review).toMatchObject({ ok: true, review: { rating: 5 } });
  });

  it("refuses only account sync's own writes, which need the column", async () => {
    const db = await setup();
    const keep = insertReadingStatement(db, SECRET, { id: newReadingId(), userId: "u_1", productId: "tarot", source: "free", origin: "opening", unlockId: null, chapter, now: 10 });
    await expect((await keep).run()).rejects.toThrow(/origin/);
  });
});
