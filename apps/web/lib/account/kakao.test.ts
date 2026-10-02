import { describe, expect, it } from "vitest";
import { KAKAO_ME_URL, KAKAO_TOKEN_URL, KakaoError, authorizeUrl, kakaoConfigProblems, kakaoLogin, kakaoRedirectUri } from "./kakao";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const PROD = env({ NODE_ENV: "production", KAKAO_REST_API_KEY: "rest-key", KAKAO_CLIENT_SECRET: "client-secret" });

function fakeFetch(responses: Array<[number, unknown]>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const [status, body] = responses.shift()!;
    return Response.json(body, { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("Kakao OAuth", () => {
  it("uses the registered redirect URIs", () => {
    expect(kakaoRedirectUri(PROD)).toBe("https://starlog.yeolmaeapps.kr/api/auth/kakao/callback");
    expect(kakaoRedirectUri(env({ NODE_ENV: "development" }))).toBe("http://localhost:3100/api/auth/kakao/callback");
  });

  it("builds the authorize URL with the state", () => {
    const url = new URL(authorizeUrl("state-123", PROD));
    expect(url.origin + url.pathname).toBe("https://kauth.kakao.com/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "rest-key",
      redirect_uri: "https://starlog.yeolmaeapps.kr/api/auth/kakao/callback",
      response_type: "code",
      state: "state-123",
    });
  });

  it("trades the code with the client secret and reads the id and nickname", async () => {
    const { calls, fetchImpl } = fakeFetch([
      [200, { access_token: "at-1", token_type: "bearer" }],
      [200, { id: 4242424242, kakao_account: { profile: { nickname: "별빛" } } }],
    ]);
    const { profile, accessToken } = await kakaoLogin("the-code", PROD, fetchImpl);
    expect(profile).toEqual({ id: "4242424242", nickname: "별빛" });
    expect(accessToken).toBe("at-1");
    expect(calls[0]!.url).toBe(KAKAO_TOKEN_URL);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(calls[0]!.init?.body as URLSearchParams))).toEqual({
      grant_type: "authorization_code",
      client_id: "rest-key",
      redirect_uri: "https://starlog.yeolmaeapps.kr/api/auth/kakao/callback",
      code: "the-code",
      client_secret: "client-secret",
    });
    expect(calls[1]!.url).toBe(KAKAO_ME_URL);
    expect((calls[1]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer at-1");
  });

  it("names the step that failed", async () => {
    await expect(kakaoLogin("bad", PROD, fakeFetch([[401, { error: "invalid_grant" }]]).fetchImpl)).rejects.toMatchObject({ step: "token", status: 401 });
    await expect(kakaoLogin("ok", PROD, fakeFetch([[200, { access_token: "at" }], [401, { msg: "no" }]]).fetchImpl)).rejects.toBeInstanceOf(KakaoError);
  });

  it("lists missing settings by name and refuses the mock in production", () => {
    expect(kakaoConfigProblems(env({ NODE_ENV: "production" }))).toEqual(["KAKAO_REST_API_KEY", "KAKAO_CLIENT_SECRET"]);
    expect(kakaoConfigProblems(PROD)).toEqual([]);
    expect(kakaoConfigProblems(env({ NODE_ENV: "production", STARLOG_KAKAO: "mock" }))).toEqual(["STARLOG_KAKAO=mock in production"]);
    expect(kakaoConfigProblems(env({ NODE_ENV: "test", STARLOG_KAKAO: "mock" }))).toEqual([]);
  });
});
