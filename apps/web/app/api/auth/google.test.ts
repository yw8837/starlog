import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { meStatusMessage } from "@/app/me/meStatus";
import { loginMessage } from "@/lib/account/loginMessage";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { giftExpiry } from "@/lib/pay/ledger";
import { mockToss } from "@/lib/pay/tossMock";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, startUrl, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as deleteIntent } from "../account/delete-intent/route";
import { POST as ownerPost } from "../owner/route";
import { POST as agePost } from "./age/route";
import { GET as callback } from "./google/callback/route";
import { GET as start } from "./google/start/route";
import { GET as kakaoStart } from "./kakao/start/route";
import { POST as logout } from "./logout/route";

const T0 = Date.parse("2026-10-07T03:00:00Z");
const CLIENT_ID = "1234-test.apps.googleusercontent.com";
const KAKAOTALK = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 KAKAOTALK 10.8.0";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_GOOGLE", "mock");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  vi.stubEnv("STARLOG_OWNER_CODE", "owner-code-for-tests-0001");
  vi.stubEnv("GOOGLE_CLIENT_ID", "");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
  resetMemoryLimiter();
  mockToss.reset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The 만 14세 check as /login's Google button does it: Kakao's POST, with provider "google". `mockUser` picks the mock Google account. */
async function googleStartUrl(b: Browser, returnTo = "/tarot/result", mockUser?: string): Promise<string> {
  const res = await b.send(agePost, "/api/auth/age", { body: { ageConfirmed: true, returnTo, provider: "google" }, origin: true });
  if (res.status !== 200) throw new Error(`age check answered ${res.status}`);
  const { url } = (await res.json()) as { url: string };
  return mockUser ? `${url}&mockUser=${encodeURIComponent(mockUser)}` : url;
}

/** Logs in through the mock Google flow (STARLOG_GOOGLE=mock); returns the callback's 303. */
async function googleLoginAs(b: Browser, name = "alice", returnTo = "/tarot/result"): Promise<Response> {
  const started = await b.send(start, await googleStartUrl(b, returnTo, name));
  const location = started.headers.get("location");
  if (!location?.includes("/api/auth/google/callback")) throw new Error(`login did not reach the callback: ${started.status} ${location}`);
  return b.send(callback, location);
}

/** From here the real Google flow (Google's answers are stubbed per test). */
function realGoogle(): void {
  vi.stubEnv("STARLOG_GOOGLE", "");
  vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
}

const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const idToken = (claims: Record<string, unknown>) => `${part({ alg: "RS256", typ: "JWT" })}.${part(claims)}.c2ln`;
const claimsFor = (sub: string, nonce: string) => ({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub, nonce, iat: T0 / 1000, exp: T0 / 1000 + 3600 });

/** The same request from KakaoTalk's in-app browser, with this browser's cookies. */
function fromKakaoTalk(b: Browser, url: string): Request {
  const cookie = [...b.jar].map(([name, value]) => `${name}=${value}`).join("; ");
  return new Request(new URL(url, "http://localhost"), { headers: { cookie, "cf-connecting-ip": "198.51.100.250", "user-agent": KAKAOTALK } });
}

const one = (db: D1Binding, sql: string) => db.prepare(sql).first();

describe("Google login", () => {
  it("asks for the 만 14세 check first, taking it from the same POST as Kakao's with provider google", async () => {
    useTestDb();
    const b = browser();
    expect((await b.send(start, "/api/auth/google/start?returnTo=%2Fme")).headers.get("location")).toBe("http://localhost/login?next=%2Fme");
    const url = await googleStartUrl(b, "/me");
    expect(url).toMatch(/^\/api\/auth\/google\/start\?returnTo=%2Fme&age=[^&]+$/);
    expect((await b.send(agePost, "/api/auth/age", { body: { ageConfirmed: true, returnTo: "/me", provider: "line" }, origin: true })).status).toBe(400);
    expect((await b.send(start, url.replace(/age=[^&]+/, "age=forged"))).headers.get("location")).toBe("http://localhost/login?next=%2Fme");
    expect((await b.send(start, url)).headers.get("location")).toContain("/api/auth/google/callback?code=");
  });

  it("goes to Google with the state, an OpenID nonce and a PKCE S256 challenge, and trades the code with the matching verifier", async () => {
    useTestDb();
    realGoogle();
    const b = browser();
    const google = new URL((await b.send(start, await googleStartUrl(b, "/me"))).headers.get("location")!);
    expect(google.origin + google.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(google.searchParams.get("scope")).toBe("openid");
    expect(google.searchParams.get("code_challenge_method")).toBe("S256");
    expect(google.searchParams.has("prompt")).toBe(false);
    expect(b.jar.has("sl_oauth")).toBe(true);
    const sent: { form?: URLSearchParams } = {};
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) !== "https://oauth2.googleapis.com/token") throw new TypeError(`unexpected fetch ${String(url)}`);
      sent.form = new URLSearchParams(init?.body as URLSearchParams);
      return Response.json({ access_token: "at", id_token: idToken(claimsFor("109876543210987654321", google.searchParams.get("nonce")!)) });
    });
    const done = await b.send(callback, `/api/auth/google/callback?code=google-code&state=${google.searchParams.get("state")}`);
    expect(done.headers.get("location")).toBe("http://localhost/me?login=ok");
    expect(b.jar.has("sl_sid")).toBe(true);
    expect(b.jar.has("sl_oauth")).toBe(false);
    const verifier = sent.form!.get("code_verifier")!;
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(google.searchParams.get("code_challenge"));
    expect(sent.form!.get("code")).toBe("google-code");
    expect((await me(b)).user).toMatchObject({ nickname: "별손님", stardust: 10, google: true });
  });

  it("refuses an ID token minted for another sign-in, and logs nobody in", async () => {
    useTestDb();
    realGoogle();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const b = browser();
    const google = new URL((await b.send(start, await googleStartUrl(b, "/me"))).headers.get("location")!);
    vi.stubGlobal("fetch", async () => Response.json({ access_token: "at", id_token: idToken(claimsFor("109876543210987654321", "someone-elses-nonce")) }));
    const done = await b.send(callback, `/api/auth/google/callback?code=google-code&state=${google.searchParams.get("state")}`);
    expect(done.headers.get("location")).toBe("http://localhost/me?login=failed");
    expect(b.jar.has("sl_sid")).toBe(false);
    expect(console.error).toHaveBeenCalledWith(JSON.stringify({ evt: "auth.google_failed", step: "id_token", status: 200 }));
  });

  it("logs in to an account of its own (별손님, marked google in /api/me) and gives the signup gift once per Google account", async () => {
    const db = useTestDb();
    const b = browser();
    expect((await googleLoginAs(b, "alice")).headers.get("location")).toBe("http://localhost/tarot/result?login=ok");
    expect(await me(b)).toEqual({
      payments: true,
      login: true,
      owner: false,
      user: { nickname: "별손님", stardust: 10, stardustExpiresAt: new Date(giftExpiry(T0)).toISOString(), unused: [], opening: [], google: true },
    });
    const { kakao_key: key } = (await db.prepare("SELECT kakao_key FROM users").first<{ kakao_key: string }>())!;
    expect(key).toMatch(/^google:[A-Za-z0-9_-]{43}$/);
    expect(key).not.toContain("alice");
    expect((await b.send(logout, "/api/auth/logout", { method: "POST", origin: true })).status).toBe(200);
    await googleLoginAs(b, "alice");
    expect((await me(b)).user?.stardust).toBe(10);
    expect(await one(db, "SELECT COUNT(*) AS n FROM users")).toEqual({ n: 1 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'grant'")).toEqual({ n: 1 });
  });

  it("keeps a Kakao account and a Google account apart: two accounts, a gift each (no linking)", async () => {
    const db = useTestDb();
    await loginAs(browser("198.51.100.40"), "alice");
    await googleLoginAs(browser("198.51.100.41"), "alice");
    expect(await one(db, "SELECT COUNT(*) AS n FROM users")).toEqual({ n: 2 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM gift_claims")).toEqual({ n: 2 });
  });

  it("while paused, logs existing Google accounts in and creates none", async () => {
    const db = useTestDb();
    const alice = browser("198.51.100.20");
    await googleLoginAs(alice, "alice");
    expect((await alice.send(logout, "/api/auth/logout", { method: "POST", origin: true })).status).toBe(200);
    vi.stubEnv("STARLOG_PAYMENTS", "paused");
    expect((await googleLoginAs(alice, "alice")).headers.get("location")).toBe("http://localhost/tarot/result?login=ok");
    const bob = browser("198.51.100.21");
    expect((await googleLoginAs(bob, "bob")).headers.get("location")).toBe("http://localhost/tarot/result?login=closed");
    expect(await one(db, "SELECT COUNT(*) AS n FROM users")).toEqual({ n: 1 });
  });

  it("stays closed while payments are off, and opens for the owner pass in owner mode", async () => {
    useTestDb();
    vi.stubEnv("STARLOG_PAYMENTS", "off");
    const visitor = browser("198.51.100.30");
    expect((await visitor.send(start, await googleStartUrl(visitor, "/me"))).headers.get("location")).toBe("http://localhost/me?login=closed");
    vi.stubEnv("STARLOG_PAYMENTS", "owner");
    expect((await visitor.send(start, await googleStartUrl(visitor, "/me"))).headers.get("location")).toBe("http://localhost/me?login=closed");
    const owner = browser("198.51.100.1");
    expect((await owner.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" } })).status).toBe(200);
    expect((await googleLoginAs(owner, "owner")).headers.get("location")).toBe("http://localhost/tarot/result?login=ok");
    expect(await me(owner)).toMatchObject({ payments: true, login: true, owner: true, user: { stardust: 10, google: true } });
  });

  it("refuses a callback whose state belongs to another browser, or was issued for Kakao", async () => {
    useTestDb();
    const first = browser("198.51.100.50");
    const location = (await first.send(start, await googleStartUrl(first, "/me", "bob"))).headers.get("location")!;
    const other = browser("198.51.100.51");
    expect((await other.send(callback, location)).headers.get("location")).toBe("http://localhost/?login=failed");
    expect(other.jar.has("sl_sid")).toBe(false);
    // Kakao's start keeps no nonce or PKCE verifier with its state.
    const kakao = new URL((await first.send(kakaoStart, await startUrl(first, "/me", "bob"))).headers.get("location")!, "http://localhost");
    expect((await first.send(callback, `/api/auth/google/callback?code=mock%3Abob&state=${kakao.searchParams.get("state")}`)).headers.get("location")).toBe(
      "http://localhost/?login=failed",
    );
    expect(first.jar.has("sl_sid")).toBe(false);
  });

  it("comes back with login=cancel when consent was declined at Google", async () => {
    useTestDb();
    const b = browser();
    const location = new URL((await b.send(start, await googleStartUrl(b, "/me"))).headers.get("location")!, "http://localhost");
    const res = await b.send(callback, `/api/auth/google/callback?error=access_denied&state=${location.searchParams.get("state")}`);
    expect(res.headers.get("location")).toBe("http://localhost/me?login=cancel");
  });

  it("answers login=unavailable while Google is not set up, and leaves Kakao working", async () => {
    useTestDb();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("STARLOG_GOOGLE", "");
    const b = browser();
    expect((await b.send(start, await googleStartUrl(b, "/me"))).headers.get("location")).toBe("http://localhost/me?login=unavailable");
    expect(console.error).toHaveBeenCalledWith(JSON.stringify({ evt: "config.google_invalid", problems: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] }));
    expect((await loginAs(b, "alice")).headers.get("location")).toBe("http://localhost/tarot/result?login=ok");
  });

  it("checks the Google settings again in the callback", async () => {
    useTestDb();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const b = browser();
    const location = (await b.send(start, await googleStartUrl(b, "/me", "erin"))).headers.get("location")!;
    vi.stubEnv("STARLOG_GOOGLE", "google");
    expect((await b.send(callback, location)).headers.get("location")).toBe("http://localhost/me?login=unavailable");
    expect(b.jar.has("sl_sid")).toBe(false);
  });

  it("sends KakaoTalk's in-app browser back to /login with a note: Google refuses to sign in inside it", async () => {
    useTestDb();
    const b = browser();
    const res = await start(fromKakaoTalk(b, await googleStartUrl(b, "/me")));
    expect(res.headers.get("location")).toBe("http://localhost/login?next=%2Fme&login=in-app");
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(loginMessage("in-app")).toBe("Google 로그인은 카카오톡 밖의 브라우저에서 해 주세요.");
  });
});

/** The whole deletion as 내 정보 drives it for a Google account; `googleUser` is who re-checks at Google. Returns the final redirect. */
async function googleDeleteAs(b: Browser, googleUser: string): Promise<string> {
  const { url } = (await (await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
  expect(url).toMatch(/^\/api\/auth\/google\/start\?purpose=delete&intent=[^&]+$/);
  const location = (await b.send(start, `${url}&mockUser=${googleUser}`)).headers.get("location")!;
  if (!location.includes("/api/auth/google/callback")) return location;
  return (await b.send(callback, location)).headers.get("location")!;
}

describe("deleting a Google account", () => {
  it("re-checks with Google, refunds unopened purchases, erases the account and keeps the gift claim", async () => {
    const db = useTestDb();
    const b = browser("198.51.100.60");
    await googleLoginAs(b, "alice");
    const orderId = await buy(b);
    expect(await googleDeleteAs(b, "alice")).toBe("http://localhost/me?account=deleted");
    expect(b.jar.has("sl_sid")).toBe(false);
    expect(await one(db, "SELECT kakao_key, nickname, deleted_at, erased_at FROM users")).toEqual({ kakao_key: null, nickname: null, deleted_at: T0, erased_at: T0 });
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "refunded" });
    expect(await one(db, "SELECT account_deleted_at FROM gift_claims")).toEqual({ account_deleted_at: T0 });
    // Joining again with the same Google account makes a new account, without a second gift.
    await googleLoginAs(b, "alice");
    expect((await me(b)).user?.stardust).toBe(0);
  });

  it("stops when another Google account answers, and a Google answer never deletes a Kakao account", async () => {
    useTestDb();
    const b = browser("198.51.100.61");
    await googleLoginAs(b, "alice");
    expect(await googleDeleteAs(b, "mallory")).toBe("http://localhost/me?delete=mismatch");
    expect(meStatusMessage({ delete: "mismatch" })).toBe("로그인한 계정과 달라요. 같은 계정으로 다시 시도해 주세요.");
    expect((await me(b)).user).not.toBeNull();
    const k = browser("198.51.100.62");
    await loginAs(k, "alice");
    const { url } = (await (await k.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
    expect(url).toMatch(/^\/api\/auth\/kakao\/start\?purpose=delete&intent=/);
    const location = (await k.send(start, `${url}&mockUser=alice`)).headers.get("location")!;
    expect((await k.send(callback, location)).headers.get("location")).toBe("http://localhost/me?delete=mismatch");
    expect((await me(k)).user).not.toBeNull();
  });

  it("shows Google's account chooser for the re-check, then revokes the app's access; a revoke Google refuses is logged, not an error", async () => {
    const db = useTestDb();
    const b = browser("198.51.100.63");
    await googleLoginAs(b, "alice");
    realGoogle();
    const { url } = (await (await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
    const google = new URL((await b.send(start, url)).headers.get("location")!);
    expect(google.origin + google.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(google.searchParams.get("prompt")).toBe("select_account");
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (target: string | URL | Request) => {
      calls.push(String(target));
      if (String(target) === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "at", id_token: idToken(claimsFor("mock-alice", google.searchParams.get("nonce")!)) });
      }
      return Response.json({ error: "invalid_token" }, { status: 400 });
    });
    const done = await b.send(callback, `/api/auth/google/callback?code=google-code&state=${google.searchParams.get("state")}`);
    expect(done.headers.get("location")).toBe("http://localhost/me?account=deleted");
    expect(calls).toEqual(["https://oauth2.googleapis.com/token", "https://oauth2.googleapis.com/revoke"]);
    expect(console.warn).toHaveBeenCalledWith(JSON.stringify({ evt: "auth.google_revoke_failed" }));
    expect(b.jar.has("sl_sid")).toBe(false);
    expect(await one(db, "SELECT erased_at FROM users")).toEqual({ erased_at: T0 });
  });

  it("sends KakaoTalk's in-app browser elsewhere for the re-check too", async () => {
    const db = useTestDb();
    const b = browser("198.51.100.64");
    await googleLoginAs(b, "alice");
    const { url } = (await (await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
    expect((await start(fromKakaoTalk(b, `${url}&mockUser=alice`))).headers.get("location")).toBe("http://localhost/me?delete=in-app");
    expect(await one(db, "SELECT deleted_at FROM users")).toEqual({ deleted_at: null });
  });
});
