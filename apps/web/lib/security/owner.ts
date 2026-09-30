import "server-only";
import { signToken, verifyToken, type SignedPayload } from "./sign";

/** Owner pass (`sl_owner`): a signed cookie that skips every beta quota. */

export const OWNER_COOKIE = "sl_owner";
export const OWNER_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

interface OwnerPayload extends SignedPayload {
  k: "owner";
  exp: number;
}

export async function ownerCookie(secret: string, now: number): Promise<string> {
  const payload: OwnerPayload = { k: "owner", exp: now + OWNER_COOKIE_MAX_AGE * 1000 };
  return signToken(payload, secret);
}

export async function isOwner(cookie: string | undefined, secret: string, now: number): Promise<boolean> {
  return (await verifyToken<OwnerPayload>(cookie, "owner", secret, now)) !== null;
}
