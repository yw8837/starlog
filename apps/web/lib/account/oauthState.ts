import "server-only";
import type { CookieSpec } from "@/lib/api/http";
import { randomId, safeEqual, signToken, verifyToken, type SignedPayload } from "@/lib/security/sign";
import { safeReturnTo } from "./returnTo";

/**
 * The OAuth `state`: a random value in a signed, 10-minute, httpOnly SameSite=Lax cookie. The
 * callback must bring the same value back (constant-time compare). This is the CSRF guard of the
 * Kakao flow. The cookie also carries where to return, why we went (login, or the account deletion
 * re-check) and whether the 만 14세 box was ticked.
 */

export const OAUTH_COOKIE = "sl_oauth";
export const OAUTH_TTL_MS = 10 * 60 * 1000;

export type OAuthPurpose = "login" | "delete";

export interface OAuthIntent {
  returnTo: string;
  purpose: OAuthPurpose;
  age: boolean;
  /** delete: the session that asked (Task 12) */
  sid?: string;
}

interface OAuthPayload extends SignedPayload, OAuthIntent {
  k: "oauth";
  state: string;
  exp: number;
}

export async function issueOAuthState(intent: OAuthIntent, secret: string, now: number): Promise<{ state: string; cookie: CookieSpec }> {
  const state = randomId(24);
  const payload: OAuthPayload = { k: "oauth", state, ...intent, exp: now + OAUTH_TTL_MS };
  return { state, cookie: { name: OAUTH_COOKIE, value: await signToken(payload, secret), maxAge: OAUTH_TTL_MS / 1000 } };
}

/** The intent behind a callback, or null when the state is missing, forged, expired or not this browser's. */
export async function openOAuthState(cookie: string | undefined, state: string | null, secret: string, now: number): Promise<OAuthIntent | null> {
  if (!state) return null;
  const payload = await verifyToken<OAuthPayload>(cookie, "oauth", secret, now);
  if (!payload || typeof payload.state !== "string" || !(await safeEqual(payload.state, state, secret))) return null;
  return {
    returnTo: safeReturnTo(payload.returnTo),
    purpose: payload.purpose === "delete" ? "delete" : "login",
    age: payload.age === true,
    ...(typeof payload.sid === "string" ? { sid: payload.sid } : {}),
  };
}

export const CLEAR_OAUTH: CookieSpec = { name: OAUTH_COOKIE, value: "", maxAge: 0 };
