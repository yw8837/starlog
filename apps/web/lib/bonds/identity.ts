import "server-only";
import { setCookie } from "@/lib/api/http";
import { keyedHash, randomId, sha256, signToken, verifyToken, type SignedPayload } from "@/lib/security/sign";

/**
 * Who is calling, without an account: signed device cookies (httpOnly, SameSite=Lax, 365 days).
 * - `sl_uid`: the constellation owner on this device (owners.id).
 * - `sl_fid`: a friend's device; only its hash reaches storage (stars.friend_key). Joins needed no login until 2026-11-10:
 *   a star made then is under it, and still found by it. A join now is under the account (accountFriendKey).
 */

export const OWNER_ID_COOKIE = "sl_uid";
export const FRIEND_ID_COOKIE = "sl_fid";
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

type IdKind = "uid" | "fid";

interface IdPayload extends SignedPayload {
  k: IdKind;
  id: string;
}

async function readId(cookies: Record<string, string>, name: string, kind: IdKind, secret: string): Promise<string | null> {
  const payload = await verifyToken<IdPayload>(cookies[name], kind, secret);
  return payload && typeof payload.id === "string" && ID_PATTERN.test(payload.id) ? payload.id : null;
}

async function idCookie(name: string, kind: IdKind, id: string, secret: string): Promise<string> {
  const payload: IdPayload = { k: kind, id };
  return setCookie(name, await signToken(payload, secret), MAX_AGE_SECONDS);
}

export function readOwnerId(cookies: Record<string, string>, secret: string): Promise<string | null> {
  return readId(cookies, OWNER_ID_COOKIE, "uid", secret);
}

/**
 * The cookie naming `id` this device's owner: only for an owner that cannot belong to an account yet (a database without
 * migration 0019). Owners belong to accounts now (lib/bonds/owner.ts); devices keep reading the cookies they have.
 */
export function ownerCookie(id: string, secret: string): Promise<string> {
  return idCookie(OWNER_ID_COOKIE, "uid", id, secret);
}

/** This device's friend key when it already has a device id (never mints one): to recognise a past join. */
export async function existingFriendKey(cookies: Record<string, string>, secret: string): Promise<string | null> {
  const id = await readId(cookies, FRIEND_ID_COOKIE, "fid", secret);
  return id ? sha256(`fid:${id}`) : null;
}

/**
 * A logged-in friend's key (owner 2026-11-10: a friend logs in to join): every star joined since is under it, so one account
 * is one star per constellation round on any of its devices (UNIQUE(constellation_id, friend_key)). A keyed hash of the
 * account id, never the id.
 */
export function accountFriendKey(userId: string, secret: string): Promise<string> {
  return keyedHash(userId, secret, "starlog/bond-friend/v1");
}

/** The keys this visitor's stars are under: the account's with a session, then this device's (a join before 2026-11-10). */
export async function friendKeysOf(userId: string | null, cookies: Record<string, string>, secret: string): Promise<string[]> {
  const keys = [userId ? await accountFriendKey(userId, secret) : null, await existingFriendKey(cookies, secret)];
  return keys.filter((key): key is string => key !== null);
}

/** The friend key of this device (a hash of its device id), minting the device id when there is none. */
export async function friendKey(cookies: Record<string, string>, secret: string): Promise<{ key: string; setCookie: string | null }> {
  const existing = await readId(cookies, FRIEND_ID_COOKIE, "fid", secret);
  const id = existing ?? randomId();
  return {
    key: await sha256(`fid:${id}`),
    setCookie: existing ? null : await idCookie(FRIEND_ID_COOKIE, "fid", id, secret),
  };
}
