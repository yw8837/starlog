import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { parseSharePayload, type SharePayload } from "./payload";

/** A share's address: /s/<12 characters a-z0-9>. */
export const SHARE_ID = /^[a-z0-9]{12}$/;

/**
 * SHARE-3: a share link lives this long from when it was made (created_at), then answers 404 and the
 * maintenance cron deletes it (app/privacy states the period). Shared again before that, it keeps its
 * time; shared again after it, it starts over.
 */
export const SHARE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export function newShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/**
 * The link for a reading: one per chapter (`chapterKey`), so sharing the same reading again hands
 * back the same address. A second share refreshes the stored copy (the card design it is shown with,
 * a newer way of hiding the user's words) and keeps the address, and its time unless it is past
 * SHARE_TTL_MS (not purged yet). `userId`: the signed-in sharer, whose account deletion takes the share
 * down (null when not signed in; a later signed-in share sets it).
 */
export async function saveShare(db: D1Binding, chapterKey: string, payload: SharePayload, now: number, userId: string | null = null): Promise<string> {
  await db
    .prepare(
      `INSERT INTO shares (id, kind, chapter_key, payload, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(chapter_key) DO UPDATE SET payload = excluded.payload, user_id = COALESCE(excluded.user_id, shares.user_id),
         created_at = CASE WHEN shares.created_at <= ? THEN excluded.created_at ELSE shares.created_at END`,
    )
    .bind(newShareId(), payload.kind, chapterKey, JSON.stringify(payload), now, userId, now - SHARE_TTL_MS)
    .run();
  const row = await db.prepare("SELECT id FROM shares WHERE chapter_key = ?").bind(chapterKey).first<{ id: string }>();
  if (!row) throw new Error("the share was not saved");
  return row.id;
}

export interface StoredShare {
  id: string;
  payload: SharePayload;
  createdAt: number;
}

/** A share by its address, or null when there is none (never shared, stopped, past SHARE_TTL_MS, or unreadable). */
export async function findShare(db: D1Binding, id: string, now: number = Date.now()): Promise<StoredShare | null> {
  if (!SHARE_ID.test(id)) return null;
  const row = await db
    .prepare("SELECT id, payload, created_at FROM shares WHERE id = ? AND created_at > ?")
    .bind(id, now - SHARE_TTL_MS)
    .first<{ id: string; payload: string; created_at: number }>();
  const payload = row ? parseSharePayload(row.payload) : null;
  return row && payload ? { id: row.id, payload, createdAt: row.created_at } : null;
}

/** The maintenance cron: deletes shares past SHARE_TTL_MS, at most `limit`. */
export async function purgeExpiredShares(db: D1Binding, now: number, limit = 500): Promise<number> {
  const result = await db
    .prepare("DELETE FROM shares WHERE id IN (SELECT id FROM shares WHERE created_at <= ? LIMIT ?)")
    .bind(now - SHARE_TTL_MS, limit)
    .run();
  return result.meta?.changes ?? 0;
}

/** Stops sharing a reading: its link answers 404 from now on. */
export async function deleteShare(db: D1Binding, chapterKey: string): Promise<boolean> {
  const result = await db.prepare("DELETE FROM shares WHERE chapter_key = ?").bind(chapterKey).run();
  return (result.meta?.changes ?? 0) > 0;
}
