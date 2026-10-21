import "server-only";
import { SITE } from "@/lib/config";
import { isKakaoTalk } from "@/lib/inApp";

/**
 * Kakao Login, server-side authorization-code flow (developers.kakao.com/docs/latest/ko/kakaologin/rest-api).
 * The access token is used inside one request and never stored; so is the raw Kakao id (only its
 * HMAC is kept, secrets.ts). STARLOG_KAKAO=mock accepts `mock:<name>` codes for tests and e2e, and
 * is refused in production.
 */

export const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
export const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
export const KAKAO_ME_URL = "https://kapi.kakao.com/v2/user/me";
export const KAKAO_UNLINK_URL = "https://kapi.kakao.com/v1/user/unlink";
export const MOCK_CODE_PREFIX = "mock:";

export type KakaoMode = "kakao" | "mock";

export function kakaoMode(env: NodeJS.ProcessEnv = process.env): KakaoMode {
  return env.STARLOG_KAKAO?.trim().toLowerCase() === "mock" ? "mock" : "kakao";
}

/** Missing settings by name (never values). */
export function kakaoConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (kakaoMode(env) === "mock") return env.NODE_ENV === "production" ? ["STARLOG_KAKAO=mock in production"] : [];
  const problems: string[] = [];
  if (!env.KAKAO_REST_API_KEY?.trim()) problems.push("KAKAO_REST_API_KEY");
  if (!env.KAKAO_CLIENT_SECRET?.trim()) problems.push("KAKAO_CLIENT_SECRET");
  return problems;
}

/** The registered redirect URI: the production site, or localhost:3100 in development. */
export function kakaoRedirectUri(env: NodeJS.ProcessEnv = process.env): string {
  const origin = env.NODE_ENV === "production" ? SITE.url : "http://localhost:3100";
  return `${origin}/api/auth/kakao/callback`;
}

/**
 * Kakao's consent screen. For an account deletion `prompt=login` makes Kakao ask for the login
 * again, so the re-check is a real re-authentication, not the Kakao session the browser already has.
 */
export function authorizeUrl(state: string, purpose: "login" | "delete", env: NodeJS.ProcessEnv = process.env): string {
  const url = new URL(KAKAO_AUTHORIZE_URL);
  url.searchParams.set("client_id", env.KAKAO_REST_API_KEY?.trim() ?? "");
  url.searchParams.set("redirect_uri", kakaoRedirectUri(env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if (purpose === "delete") url.searchParams.set("prompt", "login");
  return url.toString();
}

/** KakaoTalk's in-app browser: its Kakao login rides on the app's own session, so it cannot re-check an account deletion. */
export const isKakaoTalkInApp = (request: Request) => isKakaoTalk(request.headers.get("user-agent") ?? "");

export interface KakaoProfile {
  /** the Kakao member number as a string (hash it with kakaoKey before storing) */
  id: string;
  nickname: string;
}

export class KakaoError extends Error {
  constructor(
    readonly step: "token" | "me",
    readonly status: number,
  ) {
    super(`kakao ${step} ${status}`);
  }
}

/** Code → access token (with the client secret) → member number and nickname. */
export async function kakaoLogin(code: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<{ profile: KakaoProfile; accessToken: string }> {
  if (kakaoMode(env) === "mock") {
    if (!code.startsWith(MOCK_CODE_PREFIX)) throw new KakaoError("token", 400);
    const name = code.slice(MOCK_CODE_PREFIX.length).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "e2e";
    return { profile: { id: `mock-${name}`, nickname: "테스트 별손님" }, accessToken: "mock" };
  }
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.KAKAO_REST_API_KEY?.trim() ?? "",
    redirect_uri: kakaoRedirectUri(env),
    code,
    client_secret: env.KAKAO_CLIENT_SECRET?.trim() ?? "",
  });
  const tokenResponse = await fetchImpl(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });
  const token = (await tokenResponse.json().catch(() => null)) as { access_token?: unknown } | null;
  if (!tokenResponse.ok || typeof token?.access_token !== "string") throw new KakaoError("token", tokenResponse.status);
  const meResponse = await fetchImpl(KAKAO_ME_URL, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000) });
  const me = (await meResponse.json().catch(() => null)) as { id?: unknown; kakao_account?: { profile?: { nickname?: unknown } } } | null;
  if (!meResponse.ok || (typeof me?.id !== "number" && typeof me?.id !== "string")) throw new KakaoError("me", meResponse.status);
  const nickname = typeof me.kakao_account?.profile?.nickname === "string" ? me.kakao_account.profile.nickname : "";
  return { profile: { id: String(me.id), nickname }, accessToken: token.access_token };
}

/** Disconnects the app from the Kakao account (account deletion). False when Kakao refused. */
export async function kakaoUnlink(accessToken: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (kakaoMode(env) === "mock") return true;
  const response = await fetchImpl(KAKAO_UNLINK_URL, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) });
  return response.ok;
}
