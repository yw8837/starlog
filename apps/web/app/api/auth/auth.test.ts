import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret, kakaoKey } from "@/lib/account/secrets";
import { setTestDb } from "@/lib/db";
import { giftExpiry } from "@/lib/pay/ledger";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, loginAs, me, useTestDb } from "@/lib/testing/p4";
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

  it("logs in, gives the signup gift once, shows it in /api/me, and logs out", async () => {
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
      user: { nickname: "테스트 별손님", stardust: 10, stardustExpiresAt: new Date(giftExpiry(T0)).toISOString(), unused: [], opening: [] },
    });
    expect((await b.send(logout, "/api/auth/logout", { method: "POST", origin: true })).status).toBe(200);
    expect((await me(b)).user).toBeNull();
    await loginAs(b, "alice");
    expect((await me(b)).user?.stardust).toBe(10);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind = 'grant'").first()).toEqual({ n: 1 });
  });

  it("gives a gift that did not arrive at sign-up on the next login", async () => {
    const db = useTestDb();
    // An account whose sign-up gift failed: it exists, and no claim or lot was written.
    const key = await kakaoKey("mock-dave", accountSecret()!);
    await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_dave', ?, '데이브', 'c_dave_000000000000000000', 0, 0)").bind(key).run();
    const b = browser();
    await loginAs(b, "dave");
    expect((await me(b)).user?.stardust).toBe(10);
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
    expect(await me(alice)).toMatchObject({ payments: false, login: true, user: { stardust: 10 } });
    const bob = browser("198.51.100.21");
    expect((await loginAs(bob, "bob")).headers.get("location")).toBe("http://localhost/tarot/result?login=closed");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM users").first()).toEqual({ n: 1 });
  });

  it("checks the Kakao settings again in the callback", async () => {
    useTestDb();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const b = browser();
    const location = (await b.send(start, "/api/auth/kakao/start?age=1&returnTo=%2Fme&mockUser=erin")).headers.get("location")!;
    vi.stubEnv("STARLOG_KAKAO", "kakao");
    vi.stubEnv("KAKAO_REST_API_KEY", "");
    vi.stubEnv("KAKAO_CLIENT_SECRET", "");
    expect((await b.send(callback, location)).headers.get("location")).toBe("http://localhost/me?login=unavailable");
    expect(b.jar.has("sl_sid")).toBe(false);
  });

  it("refuses a callback whose state belongs to another browser", async () => {
    useTestDb();
    const first = await browser().send(start, "/api/auth/kakao/start?age=1&returnTo=%2Fme&mockUser=bob");
    const other = browser();
    const res = await other.send(callback, first.headers.get("location")!);
    expect(res.headers.get("location")).toBe("http://localhost/?login=failed");
    expect(other.jar.has("sl_sid")).toBe(false);
  });

  it("comes back with login=cancel when consent was declined", async () => {
    useTestDb();
    const b = browser();
    const location = new URL((await b.send(start, "/api/auth/kakao/start?age=1&returnTo=%2Fme")).headers.get("location")!);
    const res = await b.send(callback, `/api/auth/kakao/callback?error=access_denied&state=${location.searchParams.get("state")}`);
    expect(res.headers.get("location")).toBe("http://localhost/me?login=cancel");
  });

  it("stays closed while payments are off, and opens for the owner pass in owner mode", async () => {
    useTestDb();
    vi.stubEnv("STARLOG_PAYMENTS", "off");
    expect((await browser().send(start, "/api/auth/kakao/start?age=1&returnTo=%2Fme")).headers.get("location")).toBe("http://localhost/me?login=closed");
    vi.stubEnv("STARLOG_PAYMENTS", "owner");
    expect((await browser().send(start, "/api/auth/kakao/start?age=1&returnTo=%2Fme")).headers.get("location")).toBe("http://localhost/me?login=closed");
    const owner = browser("198.51.100.1");
    expect((await owner.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" } })).status).toBe(200);
    expect((await loginAs(owner, "owner")).headers.get("location")).toBe("http://localhost/tarot/result?login=ok");
    expect(await me(owner)).toMatchObject({ payments: true, login: true, owner: true, user: { stardust: 10 } });
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

  it("answers /api/me without D1 when there is no session", async () => {
    vi.stubEnv("STARLOG_PAYMENTS", "off");
    expect(await me(browser())).toEqual({ payments: false, login: false, owner: false, user: null });
  });
});
