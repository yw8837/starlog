import "server-only";
import { hostCookieName, type CookieSpec } from "@/lib/api/http";
import { randomId, safeEqual, signToken, verifyToken, type SignedPayload } from "@/lib/security/sign";
import { safeReturnTo } from "./returnTo";

/**
 * The OAuth `state`: a random value in a signed, 10-minute, httpOnly SameSite=Lax cookie. The
 * callback must bring the same value back (constant-time compare). This is the CSRF guard of the
 * Kakao and Google flows. The cookie also carries where to return, why we went (login, or the account
 * deletion re-check) and whether the 만 14세 box was ticked; for Google, the OpenID nonce and the PKCE
 * verifier too (only this browser and the server ever see the verifier: Google gets its S256 hash).
 */

/** `__Host-sl_oauth` in production, `sl_oauth` on localhost (http.ts hostCookieName). */
export const oauthCookieName = (env: NodeJS.ProcessEnv = process.env) => hostCookieName("sl_oauth", env);
export const OAUTH_TTL_MS = 10 * 60 * 1000;

export type OAuthPurpose = "login" | "delete";

export interface OAuthIntent {
  returnTo: string;
  purpose: OAuthPurpose;
  age: boolean;
  /** delete: the session that asked (Task 12) */
  sid?: string;
  /** Google: the nonce its ID token must carry back */
  nonce?: string;
  /** Google: the PKCE code verifier the token request sends */
  verifier?: string;
}

interface OAuthPayload extends SignedPayload, OAuthIntent {
  k: "oauth";
  state: string;
  exp: number;
}

export async function issueOAuthState(intent: OAuthIntent, secret: string, now: number): Promise<{ state: string; cookie: CookieSpec }> {
  const state = randomId(24);
  const payload: OAuthPayload = { k: "oauth", state, ...intent, exp: now + OAUTH_TTL_MS };
  return { state, cookie: { name: oauthCookieName(), value: await signToken(payload, secret), maxAge: OAUTH_TTL_MS / 1000 } };
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
    ...(typeof payload.nonce === "string" ? { nonce: payload.nonce } : {}),
    ...(typeof payload.verifier === "string" ? { verifier: payload.verifier } : {}),
  };
}

export const clearOAuth = (): CookieSpec => ({ name: oauthCookieName(), value: "", maxAge: 0 });

/** How long the 만 14세 check from /login is good for. */
export const AGE_CHECK_TTL_MS = 5 * 60 * 1000;

interface AgeCheckPayload extends SignedPayload {
  k: "age";
  exp: number;
}

/** The 만 14세 check as a signed 5-minute token: only a same-origin POST from /login hands one out (api/auth/age). */
export function issueAgeCheck(secret: string, now: number): Promise<string> {
  const payload: AgeCheckPayload = { k: "age", exp: now + AGE_CHECK_TTL_MS };
  return signToken(payload, secret);
}

/** The token from issueAgeCheck, unexpired and unaltered. `?age=1` or anything else is no check. */
export async function ageChecked(token: string | null, secret: string, now: number): Promise<boolean> {
  return (await verifyToken<AgeCheckPayload>(token, "age", secret, now)) !== null;
}
