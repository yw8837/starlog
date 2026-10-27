import "server-only";
import type { D1Binding } from "@/lib/db/d1";

/**
 * 오픈 기념 무료, once per Kakao or Google account (owner 2026-10-27; migrations/0018_opening_claims.sql). The claim is held
 * before the reading is written, so two requests of one account at once open one reading; a failed generation gives it
 * back, a written one keeps it. A hold older than this (a run that never settled; a generation stops at 240 s) is taken again.
 */
export const OPENING_HOLD_MS = 10 * 60_000;

export interface OpeningClaim {
  db: D1Binding;
  /** users.kakao_key */
  key: string;
  /** when it was held: the hold's own mark, so a run only settles its own */
  at: number;
}

/** The claim held for this account, "taken" when it was claimed (or is held by a run in flight), "missing" before the migration. */
export async function holdOpeningClaim(db: D1Binding, key: string, now: number): Promise<OpeningClaim | "taken" | "missing"> {
  try {
    const result = await db
      .prepare(
        `INSERT INTO opening_claims (user_key, claimed_at, opened) VALUES (?, ?, 0)
         ON CONFLICT (user_key) DO UPDATE SET claimed_at = excluded.claimed_at
         WHERE opening_claims.opened = 0 AND opening_claims.claimed_at <= ?`,
      )
      .bind(key, now, now - OPENING_HOLD_MS)
      .run();
    return result.meta?.changes === 1 ? { db, key, at: now } : "taken";
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message)) return "missing";
    throw error;
  }
}

/** The reading was written: the claim is kept for good. A failed write leaves the hold, which lapses (logged). */
export async function keepOpeningClaim(claim: OpeningClaim): Promise<void> {
  try {
    await claim.db.prepare("UPDATE opening_claims SET opened = 1 WHERE user_key = ? AND claimed_at = ?").bind(claim.key, claim.at).run();
  } catch (error) {
    console.error(JSON.stringify({ evt: "opening.claim_keep_failed", error: error instanceof Error ? error.constructor.name : typeof error }));
  }
}

/** The reading was not written: the account may open it again. A failed delete leaves the hold, which lapses (logged). */
export async function releaseOpeningClaim(claim: OpeningClaim): Promise<void> {
  try {
    await claim.db.prepare("DELETE FROM opening_claims WHERE user_key = ? AND claimed_at = ? AND opened = 0").bind(claim.key, claim.at).run();
  } catch (error) {
    console.error(JSON.stringify({ evt: "opening.claim_release_failed", error: error instanceof Error ? error.constructor.name : typeof error }));
  }
}

/** Once 오픈 기념 무료 ended the claims serve nothing: up to `limit` of them are deleted. */
export async function purgeOpeningClaims(db: D1Binding, limit: number): Promise<number> {
  const result = await db.prepare("DELETE FROM opening_claims WHERE user_key IN (SELECT user_key FROM opening_claims LIMIT ?)").bind(limit).run();
  return result.meta?.changes ?? 0;
}
