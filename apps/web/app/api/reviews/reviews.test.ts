import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret } from "@/lib/account/secrets";
import { eraseDeletedAccount } from "@/lib/account/deletion";
import { setTestDb } from "@/lib/db";
import { insertReadingStatement } from "@/lib/readings/store";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, loginAs, useTestDb, type Browser } from "@/lib/testing/p4";
import type { TestD1 } from "@/lib/db/testing/sqliteD1";
import { POST as ownerPost } from "../owner/route";
import { GET as deskGet, POST as deskPost } from "../owner/reviews/route";
import { POST as helpfulPost } from "./helpful/route";
import { GET as mineGet } from "./mine/route";
import { POST as reportPost } from "./report/route";
import { DELETE as reviewDelete, GET as listGet, POST as reviewPost } from "./route";

const OWNER_CODE = "owner-code-for-tests-0001";
let n = 0;

beforeEach(() => {
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_OWNER_CODE", OWNER_CODE);
  resetMemoryLimiter();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

/** A logged-in person (mock Kakao) and their user id. */
async function person(db: TestD1, name: string): Promise<{ b: Browser; id: string }> {
  const b = browser(`198.51.100.${++n}`);
  await loginAs(b, name);
  const row = await db.prepare("SELECT id FROM users ORDER BY created_at DESC, rowid DESC LIMIT 1").first<{ id: string }>();
  return { b, id: row!.id };
}

/** A reading saved in the account, as a paid or free opening (or the owner pass) leaves it. */
async function savedReading(
  db: TestD1,
  userId: string,
  kind: "tarot" | "saju",
  source: "paid" | "free" | "owner" = "paid",
  topic?: string,
  unlockId: string | null = null,
): Promise<string> {
  const id = `reading${String(++n).padStart(13, "0")}`;
  const chapter = { kind, reading: {}, chapterToken: "t", createdAt: Date.now(), turns: [], followUpsLeft: 3, ...(topic ? { topic } : {}) };
  await (await insertReadingStatement(db, accountSecret() as string, { id, userId, productId: kind, source, unlockId, chapter, now: Date.now() })).run();
  return id;
}

const write = (b: Browser, body: unknown) => b.send(reviewPost, "/api/reviews", { body, origin: true });

/** A paid reading as a purchase leaves it: order, payment (made in `mode`), credit lot, unlock, and the reading itself. */
async function paidReading(db: TestD1, userId: string, mode: "test" | "live" | "mock"): Promise<string> {
  const k = ++n;
  const orderId = `order${k}`;
  const lotId = `lot${k}`;
  const unlockId = `ul_${k}`;
  await db.batch([
    db
      .prepare("INSERT INTO orders (id, user_id, product_id, amount_krw, order_name, status, return_to, withdrawal_ack_at, created_at, updated_at) VALUES (?, ?, 'tarot', 3900, '타로', 'paid', '/', 0, 0, 0)")
      .bind(orderId, userId),
    db.prepare("INSERT INTO payments (payment_key, order_id, total_amount, status, mode, updated_at) VALUES (?, ?, 3900, 'DONE', ?, 0)").bind(`pay${k}`, orderId, mode),
    db
      .prepare("INSERT INTO credit_lots (id, user_id, currency, source, order_id, units_total, units_left, status, created_at) VALUES (?, ?, 'paid', 'order', ?, 1, 0, 'active', 0)")
      .bind(lotId, userId, orderId),
    db
      .prepare("INSERT INTO unlocks (id, user_id, product_id, currency, allocations, status, reserved_until, created_at) VALUES (?, ?, 'tarot', 'paid', ?, 'delivered', 0, 0)")
      .bind(unlockId, userId, JSON.stringify([[lotId, 1]])),
  ]);
  return savedReading(db, userId, "tarot", "paid", undefined, unlockId);
}

/** The owner-pass browser (/owner), for the desk. */
async function ownerBrowser(): Promise<Browser> {
  const owner = browser("198.51.100.200");
  await owner.send(ownerPost, "/api/owner", { body: { code: OWNER_CODE }, origin: true });
  return owner;
}

describe("writing a review", () => {
  it("lets the owner of a saved reading leave stars and a line, shown with the product and a masked nickname", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const readingId = await savedReading(db, alice.id, "saju", "paid", "love");
    const res = await write(alice.b, { readingId, rating: 5, body: "생각보다 구체적이라 놀랐어요." });
    expect(res.status).toBe(200);
    expect((await json(res)).review).toMatchObject({ rating: 5, label: "사주 · 연애운", body: "생각보다 구체적이라 놀랐어요.", edited: false, hidden: false });
    const list = await json(await browser().send(listGet, "/api/reviews"));
    expect(list.reviews).toEqual([expect.objectContaining({ rating: 5, label: "사주 · 연애운", nickname: expect.stringMatching(/\*/) })]);
    expect(JSON.stringify(list)).not.toContain(readingId);
  });

  it("keeps one review per reading: writing again rewrites it", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const readingId = await savedReading(db, alice.id, "tarot");
    await write(alice.b, { readingId, rating: 3 });
    const again = await json(await write(alice.b, { readingId, rating: 4, body: "다시 읽어 보니 맞는 말이었어요." }));
    expect(again.review).toMatchObject({ rating: 4, edited: true, label: "타로" });
    const list = await json(await browser().send(listGet, "/api/reviews"));
    expect((list.reviews as unknown[]).length).toBe(1);
  });

  it("refuses someone else's reading, a reading opened with the owner pass, and a visitor who is not logged in", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const bob = await person(db, "bob");
    const alices = await savedReading(db, alice.id, "tarot");
    expect((await json(await write(bob.b, { readingId: alices, rating: 5 }))).code).toBe("FORBIDDEN");
    const ownerPass = await savedReading(db, alice.id, "tarot", "owner");
    expect((await json(await write(alice.b, { readingId: ownerPass, rating: 5 }))).code).toBe("NOT_AVAILABLE");
    expect((await json(await write(browser(), { readingId: alices, rating: 5 }))).code).toBe("LOGIN_REQUIRED");
  });

  it("does not save a line with contact details, and says why", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const readingId = await savedReading(db, alice.id, "tarot");
    const res = await json(await write(alice.b, { readingId, rating: 5, body: "상담 원하시면 010-1234-5678 로 연락 주세요" }));
    expect(res).toMatchObject({ code: "BAD_REQUEST", field: "body", message: "전화번호는 쓸 수 없어요." });
    expect((await json(await alice.b.send(mineGet, `/api/reviews/mine?readingId=${readingId}`))).review).toBeNull();
  });

  it("lets the writer delete it", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const readingId = await savedReading(db, alice.id, "tarot");
    const { review } = (await json(await write(alice.b, { readingId, rating: 2 }))) as { review: { id: string } };
    expect(await json(await alice.b.send(reviewDelete, `/api/reviews?id=${review.id}`, { method: "DELETE", origin: true }))).toEqual({ deleted: true });
    expect((await json(await browser().send(listGet, "/api/reviews"))).reviews).toEqual([]);
  });
});

describe("the list", () => {
  it("shows the average only from five reviews on, and never filters by stars", async () => {
    const db = useTestDb();
    const ratings = [5, 1, 4, 2, 3];
    for (const [i, rating] of ratings.entries()) {
      const p = await person(db, `p${i}`);
      await write(p.b, { readingId: await savedReading(db, p.id, "tarot"), rating });
      const list = await json(await browser().send(listGet, "/api/reviews?product=tarot"));
      expect(list.summary).toEqual({ count: i + 1, average: i + 1 >= 5 ? 3 : null });
    }
    const list = await json(await browser().send(listGet, "/api/reviews?product=tarot"));
    expect((list.reviews as Array<{ rating: number }>).map((r) => r.rating).sort()).toEqual([1, 2, 3, 4, 5]);
    expect((await json(await browser().send(listGet, "/api/reviews?product=saju"))).summary).toEqual({ count: 0, average: null });
  });
});

describe("도움돼요, reports and the owner's desk", () => {
  it("counts 도움돼요 from other people only; a report hides nothing until the owner hides it for a rule reason", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const bob = await person(db, "bob");
    const { review } = (await json(await write(alice.b, { readingId: await savedReading(db, alice.id, "tarot"), rating: 5, body: "도움이 많이 됐어요" }))) as { review: { id: string } };
    expect((await json(await alice.b.send(helpfulPost, "/api/reviews/helpful", { body: { id: review.id, on: true }, origin: true }))).code).toBe("NOT_AVAILABLE");
    expect((await bob.b.send(helpfulPost, "/api/reviews/helpful", { body: { id: review.id, on: true }, origin: true })).status).toBe(200);
    expect((await json(await browser().send(listGet, "/api/reviews"))).reviews).toEqual([expect.objectContaining({ helpful: 1 })]);

    expect((await bob.b.send(reportPost, "/api/reviews/report", { body: { id: review.id, reason: "광고·홍보" }, origin: true })).status).toBe(200);
    expect(((await json(await browser().send(listGet, "/api/reviews"))).reviews as unknown[]).length).toBe(1);

    const owner = browser("198.51.100.200");
    await owner.send(ownerPost, "/api/owner", { body: { code: OWNER_CODE }, origin: true });
    expect((await json(await owner.send(deskGet, "/api/owner/reviews"))).reviews).toEqual([expect.objectContaining({ id: review.id, reports: 1, reasons: "광고·홍보" })]);
    expect((await owner.send(deskPost, "/api/owner/reviews", { body: { id: review.id, hidden: true }, origin: true })).status).toBe(400);
    expect((await owner.send(deskPost, "/api/owner/reviews", { body: { id: review.id, hidden: true, reason: "광고·홍보" }, origin: true })).status).toBe(200);
    expect((await json(await browser().send(listGet, "/api/reviews"))).reviews).toEqual([]);
    expect((await bob.b.send(deskGet, "/api/owner/reviews")).status).toBe(403);
  });
});

describe("a writer cannot undo the owner's hide", () => {
  it("keeps the slot of a hidden review as an empty tombstone when its writer deletes it, and refuses a new review for that reading", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const readingId = await savedReading(db, alice.id, "tarot");
    const { review } = (await json(await write(alice.b, { readingId, rating: 1, body: "여기로 오시면 더 알려 드려요" }))) as { review: { id: string } };
    const owner = await ownerBrowser();
    expect((await owner.send(deskPost, "/api/owner/reviews", { body: { id: review.id, hidden: true, reason: "광고·홍보" }, origin: true })).status).toBe(200);

    expect(await json(await alice.b.send(reviewDelete, `/api/reviews?id=${review.id}`, { method: "DELETE", origin: true }))).toEqual({ deleted: true });
    expect(await db.prepare("SELECT body, nickname, status, hidden_reason FROM reviews WHERE id = ?").bind(review.id).first()).toEqual({ body: null, nickname: "", status: "hidden", hidden_reason: "광고·홍보" });
    expect((await json(await alice.b.send(mineGet, `/api/reviews/mine?readingId=${readingId}`))).review).toBeNull();

    const again = await write(alice.b, { readingId, rating: 5, body: "다시 남기는 후기예요" });
    expect(again.status).toBe(409);
    expect(await json(again)).toMatchObject({ code: "NOT_AVAILABLE", message: "운영 원칙에 따라 숨긴 후기가 있는 풀이에는 후기를 다시 남길 수 없어요." });
    expect((await json(await browser().send(listGet, "/api/reviews"))).reviews).toEqual([]);
    expect(await db.prepare("SELECT status, body FROM reviews WHERE reading_id = ?").bind(readingId).first()).toEqual({ status: "hidden", body: null });
  });

  it("does not let the owner restore a tombstone, and does not list it on the desk", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const bob = await person(db, "bob");
    const { review } = (await json(await write(alice.b, { readingId: await savedReading(db, alice.id, "tarot"), rating: 1, body: "여기로 오시면 더 알려 드려요" }))) as { review: { id: string } };
    await bob.b.send(reportPost, "/api/reviews/report", { body: { id: review.id, reason: "광고·홍보" }, origin: true });
    const owner = await ownerBrowser();
    await owner.send(deskPost, "/api/owner/reviews", { body: { id: review.id, hidden: true, reason: "광고·홍보" }, origin: true });
    await alice.b.send(reviewDelete, `/api/reviews?id=${review.id}`, { method: "DELETE", origin: true });
    expect((await json(await owner.send(deskGet, "/api/owner/reviews"))).reviews).toEqual([]);
    expect((await json(await owner.send(deskPost, "/api/owner/reviews", { body: { id: review.id, hidden: false }, origin: true }))).ok).toBe(false);
    expect((await json(await browser().send(listGet, "/api/reviews"))).reviews).toEqual([]);
  });

  it("still lets a writer delete a visible review for good, and write again", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const readingId = await savedReading(db, alice.id, "tarot");
    const { review } = (await json(await write(alice.b, { readingId, rating: 2 }))) as { review: { id: string } };
    await alice.b.send(reviewDelete, `/api/reviews?id=${review.id}`, { method: "DELETE", origin: true });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM reviews").first()).toEqual({ n: 0 });
    expect((await write(alice.b, { readingId, rating: 4 })).status).toBe(200);
  });

  it("still lets a writer rewrite a hidden review, which stays hidden", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const readingId = await savedReading(db, alice.id, "tarot");
    const { review } = (await json(await write(alice.b, { readingId, rating: 2, body: "별로였어요 정말로" }))) as { review: { id: string } };
    const owner = await ownerBrowser();
    await owner.send(deskPost, "/api/owner/reviews", { body: { id: review.id, hidden: true, reason: "풀이와 관계없는 글" }, origin: true });
    const res = await json(await write(alice.b, { readingId, rating: 3, body: "고쳐 썼어요 다시 보세요" }));
    expect(res.review).toMatchObject({ rating: 3, hidden: true, edited: true });
    expect((await json(await browser().send(listGet, "/api/reviews"))).reviews).toEqual([]);
  });
});

describe("reviews come from real readers", () => {
  it("refuses a reading paid with Toss test keys, but takes one paid for real", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const test = await json(await write(alice.b, { readingId: await paidReading(db, alice.id, "test"), rating: 5 }));
    expect(test).toMatchObject({ code: "NOT_AVAILABLE", message: "시험 결제로 연 풀이에는 후기를 남길 수 없어요." });
    expect((await write(alice.b, { readingId: await paidReading(db, alice.id, "live"), rating: 5 })).status).toBe(200);
    expect((await write(alice.b, { readingId: await paidReading(db, alice.id, "mock"), rating: 5 })).status).toBe(200);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM reviews").first()).toEqual({ n: 2 });
  });

  it("refuses every reading of the card-company review account, bought or free", async () => {
    const db = useTestDb();
    const reviewer = await person(db, "reviewer");
    await db.prepare("UPDATE users SET kakao_key = 'review:abc' WHERE id = ?").bind(reviewer.id).run();
    for (const readingId of [await savedReading(db, reviewer.id, "tarot", "paid"), await savedReading(db, reviewer.id, "tarot", "free"), await paidReading(db, reviewer.id, "live")]) {
      expect(await json(await write(reviewer.b, { readingId, rating: 5 }))).toMatchObject({ code: "NOT_AVAILABLE", message: "심사용 계정의 풀이에는 후기를 남길 수 없어요." });
    }
    expect(await db.prepare("SELECT COUNT(*) AS n FROM reviews").first()).toEqual({ n: 0 });
  });
});

describe("도움돼요 as the viewer sees it", () => {
  it("tells each signed-in viewer which reviews they marked, and answers with the server's own count", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const bob = await person(db, "bob");
    const carol = await person(db, "carol");
    const { review } = (await json(await write(alice.b, { readingId: await savedReading(db, alice.id, "tarot"), rating: 5, body: "도움이 많이 됐어요" }))) as { review: { id: string } };
    const mark = (who: Browser, on: boolean) => who.send(helpfulPost, "/api/reviews/helpful", { body: { id: review.id, on }, origin: true });
    const listFor = async (who: Browser) => (await json(await who.send(listGet, "/api/reviews"))).reviews;

    expect(await json(await mark(bob.b, true))).toEqual({ ok: true, on: true, helpful: 1 });
    // The same tap again (after a reload the page did not know it was on): still one.
    expect(await json(await mark(bob.b, true))).toEqual({ ok: true, on: true, helpful: 1 });
    expect(await json(await mark(carol.b, true))).toEqual({ ok: true, on: true, helpful: 2 });

    expect(await listFor(bob.b)).toEqual([expect.objectContaining({ helpful: 2, helpfulByMe: true })]);
    expect(await listFor(alice.b)).toEqual([expect.objectContaining({ helpful: 2, helpfulByMe: false })]);
    expect(await listFor(browser())).toEqual([expect.objectContaining({ helpful: 2, helpfulByMe: false })]);

    expect(await json(await mark(bob.b, false))).toEqual({ ok: true, on: false, helpful: 1 });
    expect(await json(await mark(bob.b, false))).toEqual({ ok: true, on: false, helpful: 1 });
    expect(await listFor(bob.b)).toEqual([expect.objectContaining({ helpful: 1, helpfulByMe: false })]);
  });
});

describe("회원 탈퇴", () => {
  it("takes the account's reviews, 도움돼요 and reports with it", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const bob = await person(db, "bob");
    const { review } = (await json(await write(alice.b, { readingId: await savedReading(db, alice.id, "tarot"), rating: 4 }))) as { review: { id: string } };
    const bobs = (await json(await write(bob.b, { readingId: await savedReading(db, bob.id, "tarot"), rating: 5 }))) as { review: { id: string } };
    await alice.b.send(helpfulPost, "/api/reviews/helpful", { body: { id: bobs.review.id, on: true }, origin: true });
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = ?").bind(Date.now(), alice.id).run();
    expect(await eraseDeletedAccount(db, alice.id, Date.now())).toBe(true);
    const list = (await json(await browser().send(listGet, "/api/reviews"))).reviews as Array<{ id: string; helpful: number }>;
    expect(list.map((r) => r.id)).toEqual([bobs.review.id]);
    expect(list[0]?.helpful).toBe(0);
    expect(list.some((r) => r.id === review.id)).toBe(false);
  });

  it("takes a hidden review's text and its tombstone with it", async () => {
    const db = useTestDb();
    const alice = await person(db, "alice");
    const owner = await ownerBrowser();
    const hide = async (id: string) => owner.send(deskPost, "/api/owner/reviews", { body: { id, hidden: true, reason: "광고·홍보" }, origin: true });
    const kept = (await json(await write(alice.b, { readingId: await savedReading(db, alice.id, "tarot"), rating: 1, body: "숨겨진 채로 남은 글이에요" }))) as { review: { id: string } };
    const deleted = (await json(await write(alice.b, { readingId: await savedReading(db, alice.id, "tarot"), rating: 1, body: "지우고 남은 자리예요" }))) as { review: { id: string } };
    await hide(kept.review.id);
    await hide(deleted.review.id);
    await alice.b.send(reviewDelete, `/api/reviews?id=${deleted.review.id}`, { method: "DELETE", origin: true });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM reviews WHERE user_id = ?").bind(alice.id).first()).toEqual({ n: 2 });
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = ?").bind(Date.now(), alice.id).run();
    expect(await eraseDeletedAccount(db, alice.id, Date.now())).toBe(true);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM reviews WHERE user_id = ?").bind(alice.id).first()).toEqual({ n: 0 });
  });
});
