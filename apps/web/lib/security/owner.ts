import "server-only";
import { keyedHash, safeEqual, signToken, verifyToken, type SignedPayload } from "./sign";

/**
 * Owner pass (`sl_owner`): a signed cookie that skips every beta quota. It carries a fingerprint of
 * the owner code it was issued under (a keyed hash, never the code), so changing STARLOG_OWNER_CODE
 * revokes every pass handed out before.
 */

export const OWNER_COOKIE = "sl_owner";
export const OWNER_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

interface OwnerPayload extends SignedPayload {
  k: "owner";
  exp: number;
  /** fingerprint of the owner code it was issued under */
  cf: string;
}

/** The deploy's owner code, or null when none is set (then nobody is the owner). */
export const ownerCode = (env: NodeJS.ProcessEnv = process.env): string | null => env.STARLOG_OWNER_CODE?.trim() || null;

const fingerprint = (code: string, secret: string) => keyedHash(code, secret, "starlog/owner/v1");

export async function ownerCookie(secret: string, now: number, code: string): Promise<string> {
  const payload: OwnerPayload = { k: "owner", exp: now + OWNER_COOKIE_MAX_AGE * 1000, cf: await fingerprint(code, secret) };
  return signToken(payload, secret);
}

/** A valid, unexpired pass issued under the current owner code. */
export async function isOwner(cookie: string | undefined, secret: string, now: number, code: string | null = ownerCode()): Promise<boolean> {
  if (!cookie || !code) return false;
  const payload = await verifyToken<OwnerPayload>(cookie, "owner", secret, now);
  if (!payload || typeof payload.cf !== "string") return false;
  return safeEqual(payload.cf, await fingerprint(code, secret), secret);
}
