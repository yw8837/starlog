import { afterEach, describe, expect, it, vi } from "vitest";
import { errorPayload, type ErrorCode } from "@/lib/api/http";
import { setTestDb } from "@/lib/db";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import { signingSecret } from "@/lib/security/sign";
import { openAccount, sameOrigin } from "./request";
import { safeReturnTo, withQuery } from "./returnTo";
import { SECRET_CHECK_KEY, accountSecretMatches, resetSecretCheck } from "./secretCheck";
import { accountSecret, kakaoKey, openJson, sealJson, secretCheckValue } from "./secrets";
import { CLEAR_SESSION, SESSION_COOKIE, SESSION_TTL_MS, createSession, readSession, revokeSession } from "./session";
import { cleanNickname, loginKakaoUser, userByKakaoKey, userById } from "./users";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
const ACCOUNT = "account-secret-for-tests-0123456789abcdef";
const SIGNING = "signing-secret-for-tests-0123456789abcdef";
const NOW = Date.parse("2026-10-01T03:00:00Z");

afterEach(() => {
  setTestDb(null);
  resetSecretCheck();
  vi.restoreAllMocks();
});

async function login(db: ReturnType<typeof migratedTestD1>, key: string, nickname = "별빛", now = NOW) {
  const result = await loginKakaoUser(db, { key, nickname, ageConfirmed: true, now });
  if (!result) throw new Error("no account");
  return result;
}

describe("account secret", () => {
  it("needs 32+ characters in production and falls back outside it", () => {
    expect(accountSecret(env({ NODE_ENV: "production" }))).toBeNull();
    expect(accountSecret(env({ NODE_ENV: "production", STARLOG_ACCOUNT_SECRET: "short" }))).toBeNull();
    expect(accountSecret(env({ NODE_ENV: "production", STARLOG_ACCOUNT_SECRET: ACCOUNT }))).toBe(ACCOUNT);
    expect(accountSecret(env({ NODE_ENV: "development" }))!.length).toBeGreaterThanOrEqual(32);
  });

  it("keeps a keyed hash of the Kakao id, never the id, under its own derived key", async () => {
    const key = await kakaoKey("1234567890", ACCOUNT);
    expect(key).toBe(await kakaoKey("1234567890", ACCOUNT));
    expect(key).not.toContain("1234567890");
    expect(key).not.toBe(await kakaoKey("1234567890", `${ACCOUNT}x`));
    expect(key).not.toBe(await kakaoKey("1234567891", ACCOUNT));
    expect(await secretCheckValue(ACCOUNT)).not.toBe(key);
  });

  it("seals JSON with AES-GCM: round trip, a fresh IV each time, tampering, the wrong key and the wrong version rejected", async () => {
    const value = { question: "이번 주 재물 흐름", birth: { year: 1990 } };
    const sealed = await sealJson(value, ACCOUNT);
    expect(sealed).not.toContain("재물");
    expect(await openJson(sealed, ACCOUNT)).toEqual(value);
    expect(await openJson(sealed, ACCOUNT, 1)).toEqual(value);
    expect(await sealJson(value, ACCOUNT)).not.toBe(sealed);
    const flipped = `${sealed.slice(0, -2)}${sealed.at(-2) === "A" ? "B" : "A"}${sealed.at(-1)}`;
    expect(await openJson(flipped, ACCOUNT)).toBeNull();
    expect(await openJson(sealed, `${ACCOUNT}x`)).toBeNull();
    expect(await openJson(sealed, ACCOUNT, 2)).toBeNull();
    expect(await openJson("", ACCOUNT)).toBeNull();
  });
});

describe("the D1 secret check", () => {
  it("pins a fresh database to the first secret and refuses any other", async () => {
    const db = migratedTestD1();
    expect(await accountSecretMatches(db, ACCOUNT, NOW)).toBe(true);
    expect(await db.prepare("SELECT value FROM meta WHERE key = ?").bind(SECRET_CHECK_KEY).first()).toEqual({ value: await secretCheckValue(ACCOUNT) });
    expect(await accountSecretMatches(db, ACCOUNT, NOW + 1)).toBe(true);
    resetSecretCheck();
    expect(await accountSecretMatches(db, `${ACCOUNT}-rotated`, NOW + 2)).toBe(false);
    expect((await db.prepare("SELECT value FROM meta WHERE key = ?").bind(SECRET_CHECK_KEY).first<{ value: string }>())!.value).toBe(await secretCheckValue(ACCOUNT));
  });

  it("closes account routes with 503 when the secret changed, and says so once in the log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = migratedTestD1();
    setTestDb(db);
    await db.prepare("INSERT INTO meta (key, value, updated_at) VALUES (?, 'made-by-another-secret', 0)").bind(SECRET_CHECK_KEY).run();
    const res = await openAccount(new Request("http://localhost/api/me"));
    expect(res instanceof Response && res.status).toBe(503);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("config.account_secret_mismatch"));
  });
});

describe("users", () => {
  it("cleans nicknames", () => {
    expect(cleanNickname(" 별빛\u0007 ")).toBe("별빛");
    expect(cleanNickname("<별>")).toBe("별");
    expect(cleanNickname("가".repeat(30))).toBe("가".repeat(20));
    expect(cleanNickname("")).toBe("별손님");
    expect(cleanNickname(undefined)).toBe("별손님");
  });

  it("creates an account once per Kakao key and updates it on later logins", async () => {
    const db = migratedTestD1();
    const first = await login(db, "k1");
    expect(first.created).toBe(true);
    expect(first.user).toMatchObject({ kakao_key: "k1", nickname: "별빛", age_confirmed_at: NOW, created_at: NOW, deleted_at: null, erased_at: null });
    expect(first.user.customer_key).toMatch(/^c_[A-Za-z0-9_-]{24}$/);
    const again = await loginKakaoUser(db, { key: "k1", nickname: "달빛", ageConfirmed: false, now: NOW + 1000 });
    expect(again?.created).toBe(false);
    expect(again?.user).toMatchObject({ id: first.user.id, nickname: "달빛", age_confirmed_at: NOW, last_login_at: NOW + 1000, customer_key: first.user.customer_key });
    expect((await userByKakaoKey(db, "k1"))?.id).toBe(first.user.id);
  });

  it("gives an erased account's Kakao key a fresh account, and refuses one still being erased", async () => {
    const db = migratedTestD1();
    const { user } = await login(db, "k1");
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = ?").bind(NOW, user.id).run();
    expect(await userById(db, user.id)).toBeNull();
    expect(await userByKakaoKey(db, "k1")).toBeNull();
    expect(await loginKakaoUser(db, { key: "k1", nickname: "별빛", ageConfirmed: true, now: NOW + 1 })).toBeNull();
    await db.prepare("UPDATE users SET kakao_key = NULL, nickname = NULL, erased_at = ? WHERE id = ?").bind(NOW + 2, user.id).run();
    const next = await login(db, "k1", "별빛", NOW + 3);
    expect(next.created).toBe(true);
    expect(next.user.id).not.toBe(user.id);
  });

  it("ties a deleted account's gift claim to the Kakao account again when it rejoins", async () => {
    const db = migratedTestD1();
    await db.prepare("INSERT INTO gift_claims (kakao_key, claimed_at, account_deleted_at) VALUES ('k1', 0, 5)").run();
    await login(db, "k1");
    expect(await db.prepare("SELECT account_deleted_at FROM gift_claims WHERE kakao_key = 'k1'").first()).toEqual({ account_deleted_at: null });
  });
});

describe("sessions", () => {
  it("reads a live session, never an expired, revoked, forged or deleted one", async () => {
    const db = migratedTestD1();
    const { user } = await login(db, "k1");
    const { id, cookie } = await createSession(db, user.id, SIGNING, NOW);
    expect(cookie).toMatchObject({ name: SESSION_COOKIE, maxAge: SESSION_TTL_MS / 1000 });
    expect((await readSession(db, cookie.value, SIGNING, NOW + 1000))?.user.id).toBe(user.id);
    expect(await readSession(db, cookie.value, SIGNING, NOW + SESSION_TTL_MS)).toBeNull();
    expect(await readSession(db, cookie.value, `${SIGNING}x`, NOW)).toBeNull();
    expect(await readSession(db, undefined, SIGNING, NOW)).toBeNull();
    await revokeSession(db, id, NOW + 1);
    expect(await readSession(db, cookie.value, SIGNING, NOW + 2)).toBeNull();
    const second = await createSession(db, user.id, SIGNING, NOW);
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = ?").bind(NOW, user.id).run();
    expect(await readSession(db, second.cookie.value, SIGNING, NOW + 1)).toBeNull();
    expect(CLEAR_SESSION).toEqual({ name: SESSION_COOKIE, value: "", maxAge: 0 });
  });
});

describe("request guards", () => {
  const request = (headers: Record<string, string>) => new Request("http://localhost/api/pay/orders", { method: "POST", headers });

  it("accepts only our own origin, falling back to the referer", () => {
    expect(sameOrigin(request({ origin: "http://localhost" }))).toBe(true);
    expect(sameOrigin(request({ origin: "https://evil.example" }))).toBe(false);
    expect(sameOrigin(request({ referer: "http://localhost/tarot/result" }))).toBe(true);
    expect(sameOrigin(request({ referer: "https://evil.example/x" }))).toBe(false);
    expect(sameOrigin(request({}))).toBe(false);
  });

  it("answers 503 without D1, and finds the session with it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const none = await openAccount(request({}));
    expect(none instanceof Response && none.status).toBe(503);
    const db = migratedTestD1();
    setTestDb(db);
    const { user } = await login(db, "k1", "별빛", Date.now());
    const { cookie } = await createSession(db, user.id, signingSecret()!, Date.now());
    const ctx = await openAccount(request({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(cookie.value)}` }));
    if (ctx instanceof Response) throw new Error(`unexpected ${ctx.status}`);
    expect(ctx.session?.user.id).toBe(user.id);
    expect(ctx.owner).toBe(false);
  });
});

describe("error codes and return paths", () => {
  it("maps the P4 codes to their statuses", () => {
    const codes: ErrorCode[] = ["LOGIN_REQUIRED", "PAYMENT_REQUIRED", "NO_CREDIT", "PAY_FAILED", "FORBIDDEN", "NOT_AVAILABLE", "PAY_PENDING", "NOT_REFUNDABLE", "PAY_UNAVAILABLE"];
    expect(codes.map((code) => errorPayload(code).status)).toEqual([401, 402, 402, 402, 403, 409, 409, 409, 503]);
    for (const code of codes) expect(errorPayload(code).body.message).toMatch(/요\.$/);
  });

  it("keeps return paths on this site", () => {
    expect(safeReturnTo("/tarot/result")).toBe("/tarot/result");
    expect(safeReturnTo("/me?delete=failed")).toBe("/me?delete=failed");
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil", "tarot", "/a b", `/${"x".repeat(200)}`, null, undefined]) {
      expect(safeReturnTo(bad)).toBe("/");
    }
    expect(withQuery("/tarot/result", { unlock: "paid" })).toBe("/tarot/result?unlock=paid");
    expect(withQuery("/me?a=1", { login: "ok" })).toBe("/me?a=1&login=ok");
  });
});
