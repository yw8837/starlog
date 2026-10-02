import "server-only";
import { READING_KEY_VERSION, openJson, sealJson } from "@/lib/account/secrets";
import type { D1Binding, D1Statement } from "@/lib/db/d1";

/**
 * Readings kept in the account (spec 5.7). A reading opened with 결제, 별조각 or the owner pass
 * while logged in is saved automatically (device-only readings are not moved in P4).
 * - The payload is the chapter exactly as the device stores it (lib/storage/chapters.ts), sealed
 *   with AES-GCM under the row's key_version. It holds the question, note or birth data.
 * - Two identical readings are two rows: each is a purchase. One unlock saves at most one row.
 * - Nothing is saved for a deleted account.
 */

export type ReadingSource = "paid" | "free" | "owner";

/** A chapter as the device keeps it (StoredChapter) without its local id. */
export interface ServerChapter {
  kind: "tarot" | "saju";
  reading: Record<string, unknown>;
  chapterToken: string;
  createdAt: number;
  turns: Array<{ question: string; answer: string }>;
  followUpsLeft: number;
  [key: string]: unknown;
}

export interface SavedReading {
  id: string;
  createdAt: number;
  chapter: ServerChapter;
}

/** 20 characters of [a-z0-9]: also a valid device chapter id. */
export function newReadingId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/**
 * The INSERT for a reading, for a live account only (a deleted one gets nothing). A second insert
 * for the same unlock does nothing (ON CONFLICT DO NOTHING), so a retried delivery never fails on
 * its own first save.
 */
export async function insertReadingStatement(
  db: D1Binding,
  secret: string,
  input: { id: string; userId: string; productId: string; source: ReadingSource; unlockId: string | null; chapter: ServerChapter; now: number },
): Promise<D1Statement> {
  return db
    .prepare(
      `INSERT INTO readings (id, user_id, kind, product_id, source, unlock_id, payload, key_version, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL)
       ON CONFLICT DO NOTHING`,
    )
    .bind(
      input.id,
      input.userId,
      input.chapter.kind,
      input.productId,
      input.source,
      input.unlockId,
      await sealJson(input.chapter, secret),
      READING_KEY_VERSION,
      input.now,
      input.now,
      input.userId,
    );
}

interface Row {
  id: string;
  created_at: number;
  payload: string;
  key_version: number;
}

async function open(row: Row, secret: string): Promise<SavedReading | null> {
  const chapter = await openJson<ServerChapter>(row.payload, secret, row.key_version);
  if (!chapter) {
    console.error(JSON.stringify({ evt: "readings.unreadable", id: row.id, keyVersion: row.key_version }));
    return null;
  }
  return { id: row.id, createdAt: row.created_at, chapter };
}

/** Readings per page of GET /api/readings. */
export const READINGS_PAGE = 50;

const cursorOf = (row: Row) => `${row.created_at}.${row.id}`;

function parseCursor(cursor: string | undefined): [number, string] | null {
  const match = cursor ? /^(\d{1,16})\.([a-z0-9]{20})$/.exec(cursor) : null;
  return match ? [Number(match[1]), match[2]!] : null;
}

/** My readings, newest first, a page at a time: `next` continues after the last one (null at the end). */
export async function listReadings(
  db: D1Binding,
  secret: string,
  userId: string,
  options: { before?: string; limit?: number } = {},
): Promise<{ readings: SavedReading[]; next: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? READINGS_PAGE, 1), READINGS_PAGE);
  const after = parseCursor(options.before);
  const { results } = await (after
    ? db
        .prepare(
          `SELECT id, created_at, payload, key_version FROM readings
           WHERE user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .bind(userId, after[0], after[0], after[1], limit + 1)
    : db.prepare("SELECT id, created_at, payload, key_version FROM readings WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?").bind(userId, limit + 1)
  ).all<Row>();
  const page = results.slice(0, limit);
  const readings: SavedReading[] = [];
  for (const row of page) {
    const saved = await open(row, secret);
    if (saved) readings.push(saved);
  }
  return { readings, next: results.length > limit ? cursorOf(page[page.length - 1]!) : null };
}

export async function readingForUser(db: D1Binding, secret: string, userId: string, id: string): Promise<SavedReading | null> {
  const row = await db.prepare("SELECT id, created_at, payload, key_version FROM readings WHERE id = ? AND user_id = ?").bind(id, userId).first<Row>();
  return row ? open(row, secret) : null;
}

/** The row is there (the settlement's recover(): a save whose answer was lost). */
export async function readingExists(db: D1Binding, userId: string, id: string): Promise<boolean> {
  return Boolean(await db.prepare("SELECT 1 AS x FROM readings WHERE id = ? AND user_id = ?").bind(id, userId).first());
}

/** Rewrites a saved chapter (follow-up turns, the newer chapter token). False when it is not this user's. */
export async function updateReadingChapter(
  db: D1Binding,
  secret: string,
  userId: string,
  id: string,
  update: (chapter: ServerChapter) => ServerChapter,
  now: number,
): Promise<boolean> {
  const saved = await readingForUser(db, secret, userId, id);
  if (!saved) return false;
  const result = await db
    .prepare("UPDATE readings SET payload = ?, key_version = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(await sealJson(update(saved.chapter), secret), READING_KEY_VERSION, now, id, userId)
    .run();
  return result.meta?.changes === 1;
}

export async function deleteReading(db: D1Binding, userId: string, id: string): Promise<boolean> {
  const result = await db.prepare("DELETE FROM readings WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return result.meta?.changes === 1;
}

export async function deleteAllReadings(db: D1Binding, userId: string): Promise<number> {
  return (await db.prepare("DELETE FROM readings WHERE user_id = ?").bind(userId).run()).meta?.changes ?? 0;
}
