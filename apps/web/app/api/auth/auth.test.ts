import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret, kakaoKey } from "@/lib/account/secrets";
import { setTestDb } from "@/lib/db";
import { giftExpiry, grantSignupGift } from "@/lib/pay/ledger";
import { LIMITS_PER_MINUTE, resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, loginAs, me, startUrl, useTestDb } from "@/lib/testing/p4";
import { GET as meGet } from "../me/route";
import { POST as agePost } from "./age/route";
import { POST as ownerPost } from "../owner/route";
import { GET as callback } from "./kakao/callback/route";
import { GET as start } from "./kakao/start/route";
import { POST as logout } from "./logout/route";

const T0 = Date.parse("2026-10-01T03:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_OWNER_CODE", "owner-code-for-tests-0001");
  resetMemoryLimiter();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Kakao login", () => {
  it("asks for the 만 14세 check before going to Kakao", async () => {
    useTestDb();
    const res = await browser().send(start, "/api/auth/kakao/start?returnTo=%2Ftarot%2Fresult");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/login?next=%2Ftarot%2Fresult");
  });

  it("takes the 만 14세 check only as a 5-minute token from a same-origin POST, never a bare age=1", async () => {
    useTestDb();
    const b = browser();
    const toLogin = "http://localhost/login?next=%2Fme";
    expect((await b.send(start, "/api/auth/kakao/start?age=1&returnTo=%2Fme")).headers.get("location")).toBe(toLogin);
    expect((await b.send(agePost, "/api/auth/age", { body: { ageConfirmed: true, returnTo: "/me" } })).status).toBe(403);
    expect((await b.send(agePost, "/api/auth/age", { body: { returnTo: "/me" }, origin: true })).status).toBe(400);
    const url = await startUrl(b, "/me", "dana");
    expect(new URL(url, "http://localhost").searchParams.get("returnTo")).toBe("/me");
    expect((await b.send(start, url.replace(/age=[^&]+/, "age=forged"))).headers.get("location")).toBe(toLogin);
    vi.setSystemTime(T0 + 5 * 60_000 + 1);
    expect((await b.send(start, url)).headers.get("location")).toBe(toLogin);
    vi.setSystemTime(T0);
    expect((await b.send(start, url)).headers.get("location")).toContain("/api/auth/kakao/callback?code=");
  });

  it("logs in with no signup gift (removed, owner 2026-10-14 evening), shows the account in /api/me, and logs out", async () => {
    const db = useTestDb();
    const b = browser();
    const res = await loginAs(b, "alice");
    expect(res.headers.get("location")).toBe("http://localhost/tarot/result?login=ok");
    expect(b.jar.has("sl_sid")).toBe(true);
    expect(b.jar.has("sl_oauth")).toBe(false);
    expect(await me(b)).toEqual({
      payments: true,
      login: true,
      owner: false,
      user: { nickname: "테스트 별손님", gift: null, unused: [], opening: [] },
    });
    expect((await b.send(logout, "/api/auth/logout", { method: "POST", origin: true })).status).toBe(200);
    expect((await me(b)).user).toBeNull();
    await loginAs(b, "alice");
    expect((await me(b)).user?.gift).toBeNull();
    expect(await db.prepare("SELECT (SELECT COUNT(*) FROM ledger WHERE kind = 'grant') AS grants, (SELECT COUNT(*) FROM gift_claims) AS claims").first()).toEqual({ grants: 0, claims: 0 });
  });

  it("keeps an unused gift an account already holds (granted before the removal), and grants nothing on later logins", async () => {
    const db = useTestDb();
    const key = await kakaoKey("mock-dave", accountSecret()!);
    await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_dave', ?, '데이브', 'c_dave_000000000000000000', 0, 0)").bind(key).run();
    expect(await grantSignupGift(db, { userId: "u_dave", kakaoKey: key, now: T0 })).toBe(true);
    const b = browser();
    await loginAs(b, "dave");
    expect((await me(b)).user?.gift).toEqual({ status: "unused", until: new Date(giftExpiry(T0)).toISOString() });
    await loginAs(b, "dave");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'grant'").first()).toEqual({ n: 1 });
  });

  it("while paused, logs existing accounts in and creates none", async () => {
    const db = useTestDb();
    const alice = browser("198.51.100.20");
    await loginAs(alice, "alice");
    expect((await alice.send(logout, "/api/auth/logout", { method: "POST", origin: true })).status).toBe(200);
    vi.stubEnv("STARLOG_PAYMENTS", "paused");
    expect((await loginAs(alice, "alice")).headers.get("location")).toBe("http://localhost/tarot/result?login=ok");
    expect(await me(alice)).toMatchObject({ payments: false, login: true, user: { gift: null } });
    const bob = browser("198.51.100.21");
    expect((await loginAs(bob, "bob")).headers.get("location")).toBe("http://localhost/tarot/result?login=closed");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM users").first()).toEqual({ n: 1 });
  });

  it("checks the Kakao settings again in the callback", async () => {
    useTestDb();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const b = browser();
    const location = (await b.send(start, await startUrl(b, "/me", "erin"))).headers.get("location")!;
    vi.stubEnv("STARLOG_KAKAO", "kakao");
    vi.stubEnv("KAKAO_REST_API_KEY", "");
    vi.stubEnv("KAKAO_CLIENT_SECRET", "");
    expect((await b.send(callback, location)).headers.get("location")).toBe("http://localhost/me?login=unavailable");
    expect(b.jar.has("sl_sid")).toBe(false);
  });

  it("refuses a callback whose state belongs to another browser", async () => {
    useTestDb();
    const owner = browser();
    const first = await owner.send(start, await startUrl(owner, "/me", "bob"));
    const other = browser();
    const res = await other.send(callback, first.headers.get("location")!);
    expect(res.headers.get("location")).toBe("http://localhost/?login=failed");
    expect(other.jar.has("sl_sid")).toBe(false);
  });

  it("comes back with login=cancel when consent was declined", async () => {
    useTestDb();
    const b = browser();
    const location = new URL((await b.send(start, await startUrl(b, "/me"))).headers.get("location")!);
    const res = await b.send(callback, `/api/auth/kakao/callback?error=access_denied&state=${location.searchParams.get("state")}`);
    expect(res.headers.get("location")).toBe("http://localhost/me?login=cancel");
  });

  it("stays closed while payments are off, and opens for the owner pass in owner mode", async () => {
    useTestDb();
    vi.stubEnv("STARLOG_PAYMENTS", "off");
    const visitor = browser("198.51.100.30");
    expect((await visitor.send(start, await startUrl(visitor, "/me"))).headers.get("location")).toBe("http://localhost/me?login=closed");
    vi.stubEnv("STARLOG_PAYMENTS", "owner");
    expect((await visitor.send(start, await startUrl(visitor, "/me"))).headers.get("location")).toBe("http://localhost/me?login=closed");
    const owner = browser("198.51.100.1");
    expect((await owner.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" }, origin: true })).status).toBe(200);
    expect((await loginAs(owner, "owner")).headers.get("location")).toBe("http://localhost/tarot/result?login=ok");
    expect(await me(owner)).toMatchObject({ payments: true, login: true, owner: true, user: { gift: null } });
    // A new owner code revokes the passes handed out under the old one.
    vi.stubEnv("STARLOG_OWNER_CODE", "owner-code-for-tests-0002");
    expect(await me(owner)).toMatchObject({ payments: false, owner: false });
  });

  it("only comes back to paths on this site", async () => {
    useTestDb();
    expect((await loginAs(browser(), "carol", "//evil.example")).headers.get("location")).toBe("http://localhost/?login=ok");
  });

  it("logs out only from our own pages", async () => {
    useTestDb();
    const b = browser();
    await loginAs(b);
    expect((await b.send(logout, "/api/auth/logout", { method: "POST" })).status).toBe(403);
    expect((await me(b)).user).not.toBeNull();
  });

  it("rate-limits /api/me per network, generously (every page asks it)", async () => {
    vi.stubEnv("STARLOG_PAYMENTS", "off");
    const b = browser("198.51.100.77");
    expect(LIMITS_PER_MINUTE.ME_LIMITER).toBeGreaterThanOrEqual(60);
    for (let i = 0; i < LIMITS_PER_MINUTE.ME_LIMITER; i++) expect((await b.send(meGet, "/api/me")).status).toBe(200);
    expect((await b.send(meGet, "/api/me")).status).toBe(429);
    expect((await browser("198.51.100.78").send(meGet, "/api/me")).status).toBe(200);
  });

  it("answers /api/me without D1 when there is no session", async () => {
    vi.stubEnv("STARLOG_PAYMENTS", "off");
    expect(await me(browser())).toEqual({ payments: false, login: false, owner: false, user: null });
  });
});
