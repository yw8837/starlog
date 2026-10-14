import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { isReviewAccount } from "@/lib/account/review";
import { PREMIUM, isPremiumId } from "@/lib/premium/products";
import { readingForUser } from "@/lib/readings/store";
import { isSajuTopicId, topicLabel } from "@/lib/sajuTopics";
import { maskNickname } from "./text";

/**
 * 풀이 후기 in D1 (spec §5): one review per saved reading, written by its owner; the helpful count is
 * counted, never stored, so a deleted account's marks cannot leave it wrong.
 *
 * A hidden review its writer deletes stays as a tombstone (no text, no nickname, still hidden): the
 * reading keeps its slot, so deleting and posting again cannot undo the owner's hide.
 */

export interface PublicReview {
  id: string;
  product: string;
  /** "타로", "사주 · 연애운", "심층 타로" */
  label: string;
  rating: number;
  body: string | null;
  nickname: string;
  createdAt: number;
  edited: boolean;
  helpful: number;
  /** The signed-in viewer marked it 도움돼요 (false for a visitor, and in lists that are not for a viewer). */
  helpfulByMe: boolean;
}

export interface MyReview extends PublicReview {
  hidden: boolean;
}

/** The average shows only from this many reviews on (a smaller sample would mislead). */
export const AVERAGE_FROM = 5;
export const REVIEWS_PAGE = 20;

const PRODUCT_LABEL: Record<string, string> = { tarot: "타로", saju: "사주" };

export const productLabel = (product: string): string => PRODUCT_LABEL[product] ?? (isPremiumId(product) ? PREMIUM[product].name : product);

interface Row {
  id: string;
  product: string;
  topic_label: string | null;
  rating: number;
  body: string | null;
  nickname: string;
  status: string;
  created_at: number;
  edited_at: number | null;
  helpful: number;
  marked?: number;
}

const toPublic = (row: Row): PublicReview => ({
  id: row.id,
  product: row.product,
  label: row.topic_label ? `${productLabel(row.product)} · ${row.topic_label}` : productLabel(row.product),
  rating: row.rating,
  body: row.body,
  nickname: row.nickname,
  createdAt: row.created_at,
  edited: row.edited_at !== null,
  helpful: row.helpful,
  helpfulByMe: Boolean(row.marked),
});

/** The first `?` is the viewer whose 도움돼요 mark `helpfulByMe` reports (null: none). */
const SELECT = `SELECT r.id, r.product, r.topic_label, r.rating, r.body, r.nickname, r.status, r.created_at, r.edited_at,
  (SELECT COUNT(*) FROM review_helpful h WHERE h.review_id = r.id) AS helpful,
  (SELECT COUNT(*) FROM review_helpful m WHERE m.review_id = r.id AND m.user_id = ?) AS marked FROM reviews r`;

/** A review its writer deleted after the owner hid it: only the hidden slot is left (a nickname is never empty otherwise). */
const isTombstone = (row: Pick<Row, "nickname">): boolean => row.nickname === "";

export function newReviewId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

export type WriteResult =
  | { ok: true; review: MyReview }
  | { ok: false; reason: "not-yours" | "owner-pass" | "review-account" | "test-payment" | "removed" };

/**
 * Writes or rewrites the review of one of my saved readings. Reviews must come from real readers: a
 * reading opened with the owner pass, one bought with a Toss test payment (nobody was charged), and
 * any reading of the card-company review account take none (the business reviewing itself would be
 * deceptive, 표시광고법). A reading whose hidden review its writer deleted takes none either ("removed").
 */
export async function writeReview(
  db: D1Binding,
  accountSecret: string,
  input: { userId: string; nickname: string | null; readingId: string; rating: number; body: string; now: number },
): Promise<WriteResult> {
  const row = await db
    .prepare(
      `SELECT rd.kind, rd.source, u.kakao_key,
        EXISTS (SELECT 1 FROM unlocks k JOIN credit_lots l ON l.id = json_extract(k.allocations, '$[0][0]') JOIN payments p ON p.order_id = l.order_id
          WHERE k.id = rd.unlock_id AND p.mode = 'test') AS test_paid
       FROM readings rd JOIN users u ON u.id = rd.user_id WHERE rd.id = ? AND rd.user_id = ?`,
    )
    .bind(input.readingId, input.userId)
    .first<{ kind: string; source: string; kakao_key: string | null; test_paid: number }>();
  if (!row) return { ok: false, reason: "not-yours" };
  if (row.source === "owner") return { ok: false, reason: "owner-pass" };
  if (isReviewAccount(row)) return { ok: false, reason: "review-account" };
  if (row.test_paid) return { ok: false, reason: "test-payment" };
  // The topic comes from the saved reading itself, never from what the browser says.
  const saved = row.kind === "saju" ? await readingForUser(db, accountSecret, input.userId, input.readingId) : null;
  const topic = saved?.chapter.topic;
  const topicName = isSajuTopicId(topic) ? topicLabel(topic) : null;
  const body = input.body.trim() || null;
  await db
    .prepare(
      `INSERT INTO reviews (id, reading_id, user_id, product, topic_label, rating, body, nickname, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(reading_id) DO UPDATE SET rating = excluded.rating, body = excluded.body, edited_at = ?
       WHERE reviews.user_id = excluded.user_id AND reviews.nickname <> ''`,
    )
    .bind(newReviewId(), input.readingId, input.userId, row.kind, topicName, input.rating, body, maskNickname(input.nickname), input.now, input.now)
    .run();
  const stored = await reviewRow(db, input.userId, input.readingId);
  if (!stored) return { ok: false, reason: "not-yours" };
  return isTombstone(stored) ? { ok: false, reason: "removed" } : { ok: true, review: toMine(stored) };
}

const toMine = (row: Row): MyReview => ({ ...toPublic(row), hidden: row.status === "hidden" });

const reviewRow = (db: D1Binding, userId: string, readingId: string) =>
  db.prepare(`${SELECT} WHERE r.reading_id = ? AND r.user_id = ?`).bind(userId, readingId, userId).first<Row>();

/** My review of a saved reading, hidden or not (a tombstone is no review). */
export async function myReview(db: D1Binding, userId: string, readingId: string): Promise<MyReview | null> {
  const row = await reviewRow(db, userId, readingId);
  return row && !isTombstone(row) ? toMine(row) : null;
}

/**
 * Deletes my review. A visible one goes for good; a hidden one keeps its slot as a tombstone (text and
 * nickname emptied, still hidden), so the owner's hide cannot be undone by posting again.
 */
export async function deleteMyReview(db: D1Binding, userId: string, id: string): Promise<boolean> {
  const [emptied, removed] = await db.batch([
    db.prepare("UPDATE reviews SET body = NULL, nickname = '' WHERE id = ? AND user_id = ? AND status = 'hidden'").bind(id, userId),
    db.prepare("DELETE FROM reviews WHERE id = ? AND user_id = ? AND status = 'visible'").bind(id, userId),
  ]);
  return (emptied?.meta?.changes ?? 0) + (removed?.meta?.changes ?? 0) > 0;
}

export interface ReviewPage {
  reviews: PublicReview[];
  next: string | null;
  /** Count and average of the visible reviews; the average only from AVERAGE_FROM reviews on. */
  summary: { count: number; average: number | null };
}

/**
 * Visible reviews, newest first (or the most helpful first), a page at a time. Never filtered by stars:
 * a list of only the good ones would be deceptive.
 */
export async function listReviews(
  db: D1Binding,
  options: { product?: string; sort?: "recent" | "helpful"; before?: string; limit?: number; viewer?: string | null } = {},
): Promise<ReviewPage> {
  const limit = Math.min(Math.max(options.limit ?? REVIEWS_PAGE, 1), REVIEWS_PAGE);
  const where = ["r.status = 'visible'"];
  const binds: unknown[] = [];
  if (options.product) {
    where.push("r.product = ?");
    binds.push(options.product);
  }
  const cursor = options.sort === "helpful" ? null : /^(\d{1,16})\.([a-z0-9]{16})$/.exec(options.before ?? "");
  if (cursor) {
    where.push("(r.created_at < ? OR (r.created_at = ? AND r.id < ?))");
    binds.push(Number(cursor[1]), Number(cursor[1]), cursor[2]);
  }
  const order = options.sort === "helpful" ? "helpful DESC, r.created_at DESC, r.id DESC" : "r.created_at DESC, r.id DESC";
  const { results } = await db.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?`).bind(options.viewer ?? null, ...binds, limit + 1).all<Row>();
  const page = results.slice(0, limit);
  const last = page[page.length - 1];
  const totals = await db
    .prepare(`SELECT COUNT(*) AS count, AVG(rating) AS average FROM reviews WHERE status = 'visible'${options.product ? " AND product = ?" : ""}`)
    .bind(...(options.product ? [options.product] : []))
    .first<{ count: number; average: number | null }>();
  const count = totals?.count ?? 0;
  return {
    reviews: page.map(toPublic),
    next: options.sort !== "helpful" && results.length > limit && last ? `${last.created_at}.${last.id}` : null,
    summary: { count, average: count >= AVERAGE_FROM && totals?.average != null ? Math.round(totals.average * 10) / 10 : null },
  };
}

/**
 * 도움돼요 on or off; never on my own review. Null when the review is not there or is mine. Otherwise the
 * state it is in now and its count, for the screen to show as they are (turning on twice counts once).
 */
export async function setHelpful(db: D1Binding, userId: string, id: string, on: boolean, now: number): Promise<{ on: boolean; helpful: number } | null> {
  const review = await db.prepare("SELECT user_id FROM reviews WHERE id = ? AND status = 'visible'").bind(id).first<{ user_id: string }>();
  if (!review || review.user_id === userId) return null;
  await (on
    ? db.prepare("INSERT INTO review_helpful (review_id, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").bind(id, userId, now)
    : db.prepare("DELETE FROM review_helpful WHERE review_id = ? AND user_id = ?").bind(id, userId)
  ).run();
  const counted = await db.prepare("SELECT COUNT(*) AS helpful FROM review_helpful WHERE review_id = ?").bind(id).first<{ helpful: number }>();
  return { on, helpful: counted?.helpful ?? 0 };
}

export const REPORT_REASONS = ["욕설·비하", "개인정보", "광고·홍보", "풀이와 관계없는 글"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** One report per person per review; the owner decides (a report alone hides nothing). */
export async function reportReview(db: D1Binding, userId: string, id: string, reason: ReportReason, now: number): Promise<boolean> {
  const exists = await db.prepare("SELECT 1 AS x FROM reviews WHERE id = ?").bind(id).first();
  if (!exists) return false;
  await db.prepare("INSERT INTO review_reports (review_id, user_id, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING").bind(id, userId, reason, now).run();
  return true;
}

/**
 * The owner's hide or restore; hiding needs one of the rule reasons (never "it was a bad review").
 * A tombstone (its writer deleted it) has nothing left to show, so it stays as it is.
 */
export async function setHidden(db: D1Binding, id: string, hidden: boolean, reason: ReportReason | null): Promise<boolean> {
  const result = await db
    .prepare("UPDATE reviews SET status = ?, hidden_reason = ? WHERE id = ? AND nickname <> ''")
    .bind(hidden ? "hidden" : "visible", hidden ? reason : null, id)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Reviews with reports, newest first, for /owner (a tombstone has nothing to decide on and is left out). */
export async function reportedReviews(
  db: D1Binding,
): Promise<Array<PublicReview & { status: string; hiddenReason: string | null; reports: number; reasons: string }>> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.product, r.topic_label, r.rating, r.body, r.nickname, r.status, r.hidden_reason, r.created_at, r.edited_at,
        (SELECT COUNT(*) FROM review_helpful h WHERE h.review_id = r.id) AS helpful,
        COUNT(p.user_id) AS reports, GROUP_CONCAT(p.reason, ', ') AS reasons
       FROM reviews r JOIN review_reports p ON p.review_id = r.id
       WHERE r.nickname <> ''
       GROUP BY r.id ORDER BY r.created_at DESC, r.id DESC LIMIT 100`,
    )
    .all<Row & { hidden_reason: string | null; reports: number; reasons: string }>();
  return results.map((row) => ({ ...toPublic(row), status: row.status, hiddenReason: row.hidden_reason, reports: row.reports, reasons: row.reasons }));
}

/**
 * 회원 탈퇴: the account's reviews, its 도움돼요 and its reports, only once the account is marked
 * deleted (lib/account/deletion.ts runs these in its erase batch, before the readings go).
 */
export function eraseReviewStatements(db: D1Binding, userId: string) {
  const deleted = "EXISTS (SELECT 1 FROM users WHERE id = ? AND deleted_at IS NOT NULL)";
  return [
    db.prepare(`DELETE FROM review_helpful WHERE user_id = ? AND ${deleted}`).bind(userId, userId),
    db.prepare(`DELETE FROM review_reports WHERE user_id = ? AND ${deleted}`).bind(userId, userId),
    db.prepare(`DELETE FROM reviews WHERE user_id = ? AND ${deleted}`).bind(userId, userId),
  ];
}
