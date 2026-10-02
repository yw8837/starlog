import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { secretCheckValue } from "./secrets";

export const SECRET_CHECK_KEY = "account_secret_check";

/** The secret that matched in this isolate (one check per isolate, not per request). */
let confirmed: string | null = null;

/**
 * True when `secret` is the account secret this database was first used with (M8). The first call
 * on a fresh database records the check value. After that, a different secret is refused: a typo, a
 * rotation, or a dev secret against production data. Callers answer 503 instead of missing every
 * Kakao lookup (fresh accounts and gifts for returning users) and failing to open every saved reading.
 */
export async function accountSecretMatches(db: D1Binding, secret: string, now: number): Promise<boolean> {
  if (confirmed === secret) return true;
  const value = await secretCheckValue(secret);
  await db.prepare("INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO NOTHING").bind(SECRET_CHECK_KEY, value, now).run();
  const row = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(SECRET_CHECK_KEY).first<{ value: string }>();
  if (row?.value !== value) return false;
  confirmed = secret;
  return true;
}

/** Tests only: forget the isolate's confirmed secret. */
export function resetSecretCheck(): void {
  confirmed = null;
}
