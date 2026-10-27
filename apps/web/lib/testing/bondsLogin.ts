import { createSession } from "@/lib/account/session";
import { accountDb, setTestDb } from "@/lib/db";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import { signingSecret } from "@/lib/security/sign";

/**
 * Logs `jar` into the account `userId` (made when missing) on the test D1, setting one when none is: a 별자리 인연 owner
 * starts logged in (owner 2026-10-27). Returns the account id. Tests that use it reset the D1 with setTestDb(null).
 */
export async function signIn(jar: Map<string, string>, userId = `user-${Math.random().toString(36).slice(2, 12)}`): Promise<string> {
  let db = accountDb();
  if (!db) {
    db = migratedTestD1();
    setTestDb(db);
  }
  await db
    .prepare("INSERT OR IGNORE INTO users (id, nickname, customer_key, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)")
    .bind(userId, "테스트", `ck_${userId}`, 1, 1)
    .run();
  const { cookie } = await createSession(db, userId, signingSecret()!, Date.now());
  jar.set(cookie.name, cookie.value);
  return userId;
}
