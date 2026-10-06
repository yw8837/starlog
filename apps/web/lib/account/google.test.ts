import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, GoogleError, googleAuthorizeUrl, googleConfigProblems, googleLogin, googleRedirectUri, googleRevoke, googleUserKey, isGoogleAccount } from "./google";
import { reviewUserKey } from "./review";
import { kakaoKey } from "./secrets";

/** The Worker's own env (cloudflareEnv) while a test plays a Worker; null = not on Workers (tests, next dev). */
const worker = vi.hoisted(() => ({ env: null as Record<string, string> | null }));
vi.mock("@/lib/cloudflare", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cloudflare")>()),
  cloudflareEnv: () => worker.env,
}));

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const CLIENT_ID = "1234-test.apps.googleusercontent.com";
const PROD = env({ NODE_ENV: "production", GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: "client-secret" });
const ACCOUNT = "account-secret-for-tests-0123456789abcdef";
const NOW = Date.parse("2026-10-07T03:00:00Z");
const SUB = "109876543210987654321";
const CHECK = { nonce: "nonce-1", verifier: "verifier-1", now: NOW };

const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
/** An ID token as Google's token endpoint returns it (the signature is not checked: TLS from Google itself). */
const idToken = (claims: Record<string, unknown>) => `${part({ alg: "RS256", kid: "k1", typ: "JWT" })}.${part(claims)}.c2lnbmF0dXJl`;
const CLAIMS = { iss: "https://accounts.google.com", azp: CLIENT_ID, aud: CLIENT_ID, sub: SUB, nonce: "nonce-1", iat: NOW / 1000, exp: NOW / 1000 + 3600 };

function fakeFetch(responses: Array<[number, unknown]>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const [status, body] = responses.shift()!;
    return Response.json(body, { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

afterEach(() => {
  worker.env = null;
  vi.unstubAllEnvs();
});

describe("Google sign-in (OpenID Connect, server-side code flow)", () => {
  it("uses the registered redirect URIs", () => {
    expect(googleRedirectUri(PROD)).toBe("https://starlog.yeolmaeapps.kr/api/auth/google/callback");
    expect(googleRedirectUri(env({ NODE_ENV: "development" }))).toBe("http://localhost:3100/api/auth/google/callback");
  });

  it("asks only for openid, with the state, the nonce and a PKCE S256 challenge", () => {
    const url = new URL(googleAuthorizeUrl({ state: "state-123", nonce: "nonce-456", challenge: "challenge-789", purpose: "login" }, PROD));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT_ID,
      redirect_uri: "https://starlog.yeolmaeapps.kr/api/auth/google/callback",
      response_type: "code",
      scope: "openid",
      state: "state-123",
      nonce: "nonce-456",
      code_challenge: "challenge-789",
      code_challenge_method: "S256",
    });
  });

  it("makes the person pick the Google account again before an account deletion (Google has no forced re-login)", () => {
    const deleting = new URL(googleAuthorizeUrl({ state: "s", nonce: "n", challenge: "c", purpose: "delete" }, PROD));
    expect(deleting.searchParams.get("prompt")).toBe("select_account");
    expect(new URL(googleAuthorizeUrl({ state: "s", nonce: "n", challenge: "c", purpose: "login" }, PROD)).searchParams.has("prompt")).toBe(false);
  });

  it("trades the code with the client secret and the PKCE verifier, and takes the account id from the checked ID token", async () => {
    const { calls, fetchImpl } = fakeFetch([[200, { access_token: "at-1", id_token: idToken(CLAIMS), token_type: "Bearer", expires_in: 3599, scope: "openid" }]]);
    expect(await googleLogin("the-code", CHECK, PROD, fetchImpl)).toEqual({ sub: SUB, accessToken: "at-1" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(GOOGLE_TOKEN_URL);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(calls[0]!.init?.body as URLSearchParams))).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      client_id: CLIENT_ID,
      client_secret: "client-secret",
      redirect_uri: "https://starlog.yeolmaeapps.kr/api/auth/google/callback",
      code_verifier: "verifier-1",
    });
  });

  it("accepts both issuer spellings Google uses", async () => {
    const { fetchImpl } = fakeFetch([[200, { access_token: "at", id_token: idToken({ ...CLAIMS, iss: "accounts.google.com" }) }]]);
    expect((await googleLogin("c", CHECK, PROD, fetchImpl)).sub).toBe(SUB);
  });

  it("refuses an ID token that is not Google's answer to this very sign-in", async () => {
    const { sub: _sub, ...noSub } = CLAIMS;
    const bad: Array<[string, string]> = [
      ["another issuer", idToken({ ...CLAIMS, iss: "https://accounts.example.com" })],
      ["another app", idToken({ ...CLAIMS, aud: "other.apps.googleusercontent.com" })],
      ["expired", idToken({ ...CLAIMS, exp: NOW / 1000 - 1 })],
      ["no expiry", idToken({ ...CLAIMS, exp: undefined })],
      ["another sign-in's nonce", idToken({ ...CLAIMS, nonce: "nonce-2" })],
      ["no nonce", idToken({ ...CLAIMS, nonce: undefined })],
      ["no account id", idToken(noSub)],
      ["an empty account id", idToken({ ...CLAIMS, sub: "" })],
      ["not a token", "not-a-token"],
      ["claims that are not JSON", `${part({ alg: "RS256" })}.bm90LWpzb24.c2ln`],
    ];
    for (const [why, token] of bad) {
      const { fetchImpl } = fakeFetch([[200, { access_token: "at", id_token: token }]]);
      await expect(googleLogin("c", CHECK, PROD, fetchImpl), why).rejects.toMatchObject({ step: "id_token" });
    }
  });

  it("names the step that failed", async () => {
    await expect(googleLogin("bad", CHECK, PROD, fakeFetch([[400, { error: "invalid_grant" }]]).fetchImpl)).rejects.toMatchObject({ step: "token", status: 400 });
    await expect(googleLogin("ok", CHECK, PROD, fakeFetch([[200, { access_token: "at" }]]).fetchImpl)).rejects.toBeInstanceOf(GoogleError);
  });

  it("revokes the app's access with the access token, and says when Google refused", async () => {
    const ok = fakeFetch([[200, {}]]);
    expect(await googleRevoke("at-1", PROD, ok.fetchImpl)).toBe(true);
    expect(ok.calls[0]!.url).toBe(GOOGLE_REVOKE_URL);
    expect(ok.calls[0]!.init?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(ok.calls[0]!.init?.body as URLSearchParams))).toEqual({ token: "at-1" });
    expect(await googleRevoke("at-1", PROD, fakeFetch([[400, { error: "invalid_token" }]]).fetchImpl)).toBe(false);
  });

  it("takes mock:<name> codes only with STARLOG_GOOGLE=mock, without calling Google", async () => {
    const mock = env({ NODE_ENV: "test", STARLOG_GOOGLE: "mock" });
    const { calls, fetchImpl } = fakeFetch([]);
    expect(await googleLogin("mock:alice", CHECK, mock, fetchImpl)).toEqual({ sub: "mock-alice", accessToken: "mock" });
    await expect(googleLogin("real-code", CHECK, mock, fetchImpl)).rejects.toMatchObject({ step: "token" });
    expect(await googleRevoke("mock", mock, fetchImpl)).toBe(true);
    expect(calls).toEqual([]);
  });

  it("lists missing settings by name and refuses the mock in production", () => {
    expect(googleConfigProblems(env({ NODE_ENV: "production" }))).toEqual(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
    expect(googleConfigProblems(env({ NODE_ENV: "production", GOOGLE_CLIENT_ID: " ", GOOGLE_CLIENT_SECRET: "s" }))).toEqual(["GOOGLE_CLIENT_ID"]);
    expect(googleConfigProblems(PROD)).toEqual([]);
    expect(googleConfigProblems(env({ NODE_ENV: "production", STARLOG_GOOGLE: "mock" }))).toEqual(["STARLOG_GOOGLE=mock in production"]);
    expect(googleConfigProblems(env({ NODE_ENV: "test", STARLOG_GOOGLE: "mock" }))).toEqual([]);
  });

  it("on Workers, reads the client ID and secret from the Worker's own secrets only, never a value a build left in process.env", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "baked-into-a-build");
    worker.env = {};
    expect(googleConfigProblems()).toEqual(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    worker.env = { GOOGLE_CLIENT_ID: "worker.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "worker-secret" };
    expect(googleConfigProblems()).toEqual([]);
    expect(new URL(googleAuthorizeUrl({ state: "s", nonce: "n", challenge: "c", purpose: "login" })).searchParams.get("client_id")).toBe("worker.apps.googleusercontent.com");
  });

  it("keeps only a keyed hash of the Google account id, under its own prefix, apart from Kakao and review keys", async () => {
    const key = await googleUserKey(SUB, ACCOUNT);
    expect(key).toMatch(/^google:[A-Za-z0-9_-]{43}$/);
    expect(key).toBe(await googleUserKey(SUB, ACCOUNT));
    expect(key).not.toContain(SUB);
    expect(key).not.toBe(await googleUserKey(SUB, `${ACCOUNT}x`));
    expect(key).not.toBe(await googleUserKey("109876543210987654322", ACCOUNT));
    expect(isGoogleAccount({ kakao_key: key })).toBe(true);
    expect(isGoogleAccount({ kakao_key: await kakaoKey(SUB, ACCOUNT) })).toBe(false);
    expect(isGoogleAccount({ kakao_key: await reviewUserKey({ id: "card-review", password: "correct-horse-battery-staple-77" }, ACCOUNT) })).toBe(false);
    expect(isGoogleAccount({ kakao_key: null })).toBe(false);
    expect(isGoogleAccount(null)).toBe(false);
  });
});
