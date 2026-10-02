import "server-only";
import type { D1Binding } from "@/lib/db/d1";
import { randomId } from "@/lib/security/sign";

export interface UserRow {
  id: string;
  /** HMAC of the Kakao id (secrets.ts kakaoKey); null once erased */
  kakao_key: string | null;
  nickname: string | null;
  /** Toss customerKey: random, 26 characters, includes "_" (Toss requires a special character) */
  customer_key: string;
  age_confirmed_at: number | null;
  created_at: number;
  last_login_at: number;
  /** 회원 탈퇴: from this moment nothing is granted, reserved or saved for the account */
  deleted_at: number | null;
  /** personal data erased (Task 12; the maintenance cron finishes an interrupted erase) */
  erased_at: number | null;
}

/** At most 20 characters, no control characters or angle brackets; "별손님" when Kakao gave none. */
export function cleanNickname(value: unknown): string {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim() : "";
  return [...text].slice(0, 20).join("") || "별손님";
}

/**
 * The account for a Kakao login, in one statement: an existing account gets its nickname and login
 * time updated, otherwise one is created. `created` is true only for a brand-new account.
 * Null when that Kakao key still belongs to a deleted account whose erase has not finished (the
 * maintenance cron finishes it within minutes); the callback answers login=failed.
 * A Kakao account that joins again takes its old gift claim back (no second signup gift, and the
 * claim is no longer purged a year after the old account's deletion).
 */
export async function loginKakaoUser(
  db: D1Binding,
  input: { key: string; nickname: string; ageConfirmed: boolean; now: number },
): Promise<{ user: UserRow; created: boolean } | null> {
  const id = `u_${randomId(12)}`;
  const user = await db
    .prepare(
      `INSERT INTO users (id, kakao_key, nickname, customer_key, age_confirmed_at, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (kakao_key) DO UPDATE SET
         nickname = excluded.nickname,
         last_login_at = excluded.last_login_at,
         age_confirmed_at = COALESCE(users.age_confirmed_at, excluded.age_confirmed_at)
       WHERE users.deleted_at IS NULL
       RETURNING *`,
    )
    .bind(id, input.key, cleanNickname(input.nickname), `c_${randomId(18)}`, input.ageConfirmed ? input.now : null, input.now, input.now)
    .first<UserRow>();
  if (!user) return null;
  await db.prepare("UPDATE gift_claims SET account_deleted_at = NULL WHERE kakao_key = ? AND account_deleted_at IS NOT NULL").bind(input.key).run();
  return { user, created: user.id === id };
}

/** A live (not deleted) account. */
export function userById(db: D1Binding, id: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL").bind(id).first<UserRow>();
}

/** The live account behind a Kakao key, if any (logins while sales are paused). */
export function userByKakaoKey(db: D1Binding, key: string): Promise<UserRow | null> {
  return db.prepare("SELECT * FROM users WHERE kakao_key = ? AND deleted_at IS NULL").bind(key).first<UserRow>();
}
