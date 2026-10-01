import "server-only";
import { setCookie } from "@/lib/api/http";
import { randomId, sha256, signToken, verifyToken, type SignedPayload } from "@/lib/security/sign";

/**
 * Who is calling, without an account: signed device cookies (httpOnly, SameSite=Lax, 365 days).
 * - `sl_uid`: the constellation owner on this device (owners.id).
 * - `sl_fid`: a friend's device; only its hash reaches storage (stars.friend_key), so one device
 *   joins one constellation round once.
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

/** The owner id on this device, minting one (and the cookie to set) when there is none. */
export async function ensureOwnerId(cookies: Record<string, string>, secret: string): Promise<{ id: string; setCookie: string | null }> {
  const existing = await readOwnerId(cookies, secret);
  if (existing) return { id: existing, setCookie: null };
  const id = randomId();
  return { id, setCookie: await idCookie(OWNER_ID_COOKIE, "uid", id, secret) };
}

/** This device's friend key when it already has a device id (never mints one): to recognise a past join. */
export async function existingFriendKey(cookies: Record<string, string>, secret: string): Promise<string | null> {
  const id = await readId(cookies, FRIEND_ID_COOKIE, "fid", secret);
  return id ? sha256(`fid:${id}`) : null;
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
