import "server-only";
import { cloudflareEnv } from "@/lib/cloudflare";
import { SITE } from "@/lib/config";
import { keyedHash } from "@/lib/security/sign";
import { MOCK_CODE_PREFIX } from "./kakao";
import type { OAuthPurpose } from "./oauthState";
import type { UserRow } from "./users";

/**
 * Google sign-in next to Kakao's (kakao.ts): the server-side authorization-code flow of OpenID Connect
 * (developers.google.com/identity/openid-connect/openid-connect).
 * - Scope `openid` only: Google answers with the account id (`sub`) and nothing else (no name, email
 *   or picture). Only a keyed hash of it is stored (googleUserKey); the tokens live inside one request.
 * - The ID token comes straight from Google's token endpoint over TLS, in exchange for the code, the
 *   client secret and the PKCE verifier, so its claims are checked (iss, aud, exp, nonce) and its
 *   signature is not, as Google's guide allows for this flow.
 * - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: on Workers the Worker's own secrets only, as for review
 *   login (review.ts); elsewhere (tests, plain `next dev`) process.env.
 * - STARLOG_GOOGLE=mock takes `mock:<name>` codes for tests and e2e, and is refused in production.
 */

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
/** Both spellings Google's ID tokens use. */
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
/** users.kakao_key of a Google account starts with this (a Kakao key is base64url, never ":"; review.ts uses "review:"). */
const KEY_PREFIX = "google:";

type SecretEnv = CloudflareEnv | NodeJS.ProcessEnv;

export type GoogleMode = "google" | "mock";

export function googleMode(env: NodeJS.ProcessEnv = process.env): GoogleMode {
  return env.STARLOG_GOOGLE?.trim().toLowerCase() === "mock" ? "mock" : "google";
}

/** Missing settings by name (never values). */
export function googleConfigProblems(env: NodeJS.ProcessEnv = process.env, secrets: SecretEnv = cloudflareEnv() ?? env): string[] {
  if (googleMode(env) === "mock") return env.NODE_ENV === "production" ? ["STARLOG_GOOGLE=mock in production"] : [];
  const problems: string[] = [];
  if (!secrets.GOOGLE_CLIENT_ID?.trim()) problems.push("GOOGLE_CLIENT_ID");
  if (!secrets.GOOGLE_CLIENT_SECRET?.trim()) problems.push("GOOGLE_CLIENT_SECRET");
  return problems;
}

/** The registered redirect URI: the production site, or localhost:3100 in development. */
export function googleRedirectUri(env: NodeJS.ProcessEnv = process.env): string {
  const origin = env.NODE_ENV === "production" ? SITE.url : "http://localhost:3100";
  return `${origin}/api/auth/google/callback`;
}

/**
 * Google's sign-in page. For an account deletion `prompt=select_account` makes the person pick the
 * account themselves instead of passing through the Google session the browser already has. It is the
 * closest Google comes to Kakao's prompt=login: `prompt` takes none, consent or select_account only,
 * and Google does not support re-authentication requests.
 */
export function googleAuthorizeUrl(
  request: { state: string; nonce: string; challenge: string; purpose: OAuthPurpose },
  env: NodeJS.ProcessEnv = process.env,
  secrets: SecretEnv = cloudflareEnv() ?? env,
): string {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", secrets.GOOGLE_CLIENT_ID?.trim() ?? "");
  url.searchParams.set("redirect_uri", googleRedirectUri(env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid");
  url.searchParams.set("state", request.state);
  url.searchParams.set("nonce", request.nonce);
  url.searchParams.set("code_challenge", request.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (request.purpose === "delete") url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export class GoogleError extends Error {
  constructor(
    readonly step: "token" | "id_token",
    readonly status: number,
  ) {
    super(`google ${step} ${status}`);
  }
}

/** The JSON in one base64url part of a JWT, or undefined. */
function jwtPart(part: string | undefined): unknown {
  if (!part || !/^[A-Za-z0-9_-]+$/.test(part)) return undefined;
  try {
    const binary = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch {
    return undefined;
  }
}

/** The ID token's `sub` when it is Google's answer to this sign-in (issuer, audience, expiry, nonce); null otherwise. */
function checkedSubject(idToken: string, expected: { clientId: string; nonce: string; now: number }): string | null {
  const parts = idToken.split(".");
  const claims = parts.length === 3 ? jwtPart(parts[1]) : undefined;
  if (typeof claims !== "object" || claims === null) return null;
  const { iss, aud, exp, nonce, sub } = claims as Record<string, unknown>;
  if (typeof iss !== "string" || !ISSUERS.has(iss)) return null;
  if (aud !== expected.clientId) return null;
  if (typeof exp !== "number" || exp * 1000 <= expected.now) return null;
  if (nonce !== expected.nonce) return null;
  return typeof sub === "string" && sub.length > 0 && sub.length <= 255 ? sub : null;
}

/** Code → tokens (with the client secret and the PKCE verifier) → the checked ID token's `sub`, and the access token for googleRevoke. */
export async function googleLogin(
  code: string,
  expected: { nonce: string; verifier: string; now: number },
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  secrets: SecretEnv = cloudflareEnv() ?? env,
): Promise<{ sub: string; accessToken: string }> {
  if (googleMode(env) === "mock") {
    if (!code.startsWith(MOCK_CODE_PREFIX)) throw new GoogleError("token", 400);
    const name = code.slice(MOCK_CODE_PREFIX.length).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "e2e";
    return { sub: `mock-${name}`, accessToken: "mock" };
  }
  const clientId = secrets.GOOGLE_CLIENT_ID?.trim() ?? "";
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: secrets.GOOGLE_CLIENT_SECRET?.trim() ?? "",
      redirect_uri: googleRedirectUri(env),
      code_verifier: expected.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const token = (await response.json().catch(() => null)) as { id_token?: unknown; access_token?: unknown } | null;
  if (!response.ok || typeof token?.id_token !== "string" || typeof token.access_token !== "string") throw new GoogleError("token", response.status);
  const sub = checkedSubject(token.id_token, { clientId, nonce: expected.nonce, now: expected.now });
  if (!sub) throw new GoogleError("id_token", response.status);
  return { sub, accessToken: token.access_token };
}

/** Takes the app's access away from the Google account (account deletion). False when Google refused. */
export async function googleRevoke(accessToken: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (googleMode(env) === "mock") return true;
  const response = await fetchImpl(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: accessToken }),
    signal: AbortSignal.timeout(10_000),
  });
  return response.ok;
}

/** users.kakao_key of a Google account: "google:" and a keyed hash of its `sub` (keyed by STARLOG_ACCOUNT_SECRET; never the id itself). */
export async function googleUserKey(sub: string, accountSecret: string): Promise<string> {
  return KEY_PREFIX + (await keyedHash(`google:${sub}`, accountSecret, "starlog/google-account/v1"));
}

/** A Google account: it logs in, and re-checks its deletion, with Google. */
export function isGoogleAccount(user: Pick<UserRow, "kakao_key"> | null | undefined): boolean {
  return Boolean(user?.kakao_key?.startsWith(KEY_PREFIX));
}
