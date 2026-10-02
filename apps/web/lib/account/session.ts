import "server-only";
import { hostCookieName, type CookieSpec } from "@/lib/api/http";
import type { D1Binding } from "@/lib/db/d1";
import { randomId, signToken, verifyToken, type SignedPayload } from "@/lib/security/sign";
import type { UserRow } from "./users";

/**
 * The login session: a signed httpOnly cookie naming a D1 session row, so one can be revoked
 * (logout, account deletion). 30 days, not extended (spec 14, default 3). It lives next to P3's
 * device cookies (sl_uid, sl_fid) and changes nothing about them.
 */

/** `__Host-sl_sid` in production, `sl_sid` on localhost (http.ts hostCookieName): every reader and writer uses this. */
export const sessionCookieName = (env: NodeJS.ProcessEnv = process.env) => hostCookieName("sl_sid", env);
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionPayload extends SignedPayload {
  k: "session";
  sid: string;
  exp: number;
}

export interface Session {
  id: string;
  user: UserRow;
}

export async function createSession(db: D1Binding, userId: string, secret: string, now: number): Promise<{ id: string; cookie: CookieSpec }> {
  const id = randomId(24);
  const exp = now + SESSION_TTL_MS;
  await db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(id, userId, now, exp).run();
  const payload: SessionPayload = { k: "session", sid: id, exp };
  return { id, cookie: { name: sessionCookieName(), value: await signToken(payload, secret), maxAge: SESSION_TTL_MS / 1000 } };
}

/** The session behind a cookie value, or null (missing, forged, expired, revoked, account deleted). */
export async function readSession(db: D1Binding, cookie: string | undefined, secret: string, now: number): Promise<Session | null> {
  const payload = await verifyToken<SessionPayload>(cookie, "session", secret, now);
  if (!payload || typeof payload.sid !== "string") return null;
  const user = await db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.deleted_at IS NULL`,
    )
    .bind(payload.sid, now)
    .first<UserRow>();
  return user ? { id: payload.sid, user } : null;
}

export async function revokeSession(db: D1Binding, id: string, now: number): Promise<void> {
  await db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(now, id).run();
}

export const clearSession = (): CookieSpec => ({ name: sessionCookieName(), value: "", maxAge: 0 });
