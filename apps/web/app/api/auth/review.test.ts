import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseAccount } from "@/lib/account/client";
import { SESSION_TTL_MS, createSession } from "@/lib/account/session";
import { loginKakaoUser } from "@/lib/account/users";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { setTestDb } from "@/lib/db";
import { standardProduct } from "@/lib/pay/catalog";
import { unlockOffer } from "@/lib/pay/offer";
import { mockToss } from "@/lib/pay/tossMock";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as deleteIntent } from "../account/delete-intent/route";
import { GET as checkout } from "../pay/checkout/route";
import { POST as ordersPost } from "../pay/orders/route";
import { POST as refund } from "../pay/refund/route";
import { POST as draw } from "../tarot/draw/route";
import { POST as reading } from "../tarot/reading/route";
import { POST as review } from "./review/route";

const T0 = Date.parse("2026-10-06T03:00:00Z");
const ID = "card-review";
const PASSWORD = "correct-horse-battery-staple-77";
const WRONG = { code: "BAD_TOKEN", message: "아이디 또는 비밀번호가 맞지 않아요." };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  vi.stubEnv("REVIEW_LOGIN_ID", ID);
  vi.stubEnv("REVIEW_LOGIN_PASSWORD", PASSWORD);
  resetMemoryLimiter();
  resetDailyStore();
  mockToss.reset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const signIn = (b: Browser, body: unknown = { id: ID, password: PASSWORD }) => b.send(review, "/api/auth/review", { body, origin: true });

/** Draws three cards and opens their full reading with `method` (STARLOG_AI=mock). */
async function openReading(b: Browser, method: "paid" | "free" = "paid"): Promise<Response> {
  const drawn = await b.send(draw, "/api/tarot/draw", { body: { templateId: "self-flow", picks: [3, 30, 60] } });
  const { drawToken } = (await drawn.json()) as { drawToken: string };
  const input = { topicId: "money", whoId: "me", whenId: "week", question: "", conditions: [], note: "" };
  return b.send(reading, "/api/tarot/reading", { body: { drawToken, input, unlock: { method } } });
}

describe("review login", () => {
  it("answers 404 unless REVIEW_LOGIN_ID and REVIEW_LOGIN_PASSWORD are both set", async () => {
    useTestDb();
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", "");
    expect((await signIn(browser())).status).toBe(404);
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", PASSWORD);
    vi.stubEnv("REVIEW_LOGIN_ID", " ");
    expect((await signIn(browser())).status).toBe(404);
  });

  it("answers 404 unless sales are open to someone: STARLOG_PAYMENTS owner or on, never off (or unset) or paused", async () => {
    useTestDb();
    for (const mode of ["off", "", "paused"]) {
      vi.stubEnv("STARLOG_PAYMENTS", mode);
      expect((await signIn(browser())).status).toBe(404);
    }
    vi.stubEnv("STARLOG_PAYMENTS", "owner");
    expect((await signIn(browser())).status).toBe(200);
  });

  it("answers 404 while the password is shorter than 20 characters", async () => {
    useTestDb();
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", "nineteen-characters");
    expect((await signIn(browser(), { id: ID, password: "nineteen-characters" })).status).toBe(404);
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", " twenty-characters-ok ");
    expect((await signIn(browser(), { id: ID, password: "twenty-characters-ok" })).status).toBe(200);
  });

  it("logs in to one fixed account with the session a Kakao login gets, and no signup gift", async () => {
    const db = useTestDb();
    const b = browser();
    const res = await signIn(b);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(b.jar.has("sl_sid")).toBe(true);
    expect(await me(b)).toEqual({
      payments: true,
      login: true,
      owner: false,
      user: { nickname: "심사용 계정", gift: null, unused: [], opening: [], review: true },
    });
    // A second browser gets a session on the same account, kept under a keyed hash of the credentials.
    expect((await signIn(browser("198.51.100.20"))).status).toBe(200);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM users").first()).toEqual({ n: 1 });
    const { kakao_key: key } = (await db.prepare("SELECT kakao_key FROM users").first<{ kakao_key: string }>())!;
    expect(key).toMatch(/^review:[A-Za-z0-9_-]{43}$/);
    expect(key).not.toContain(ID);
    expect((await db.prepare("SELECT expires_at FROM sessions").all()).results).toEqual([{ expires_at: T0 + SESSION_TTL_MS }, { expires_at: T0 + SESSION_TTL_MS }]);
    expect(await db.prepare("SELECT (SELECT COUNT(*) FROM gift_claims) AS claims, (SELECT COUNT(*) FROM credit_lots) AS lots").first()).toEqual({ claims: 0, lots: 0 });
  });

  it("gives one answer for a wrong ID or a wrong password, and never logs the password", async () => {
    useTestDb();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const wrongId = await signIn(browser(), { id: "someone-else", password: PASSWORD });
    const wrongPassword = await signIn(browser("198.51.100.21"), { id: ID, password: "not-the-password" });
    expect([wrongId.status, wrongPassword.status]).toEqual([400, 400]);
    expect([await wrongId.json(), await wrongPassword.json()]).toEqual([WRONG, WRONG]);
    expect((await signIn(browser("198.51.100.22"))).status).toBe(200);
    const logged = JSON.stringify([console.info, console.warn, error, log].map((spy) => vi.mocked(spy).mock.calls));
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain("not-the-password");
  });

  it("shuts a network out for 15 minutes after 5 failures, even with the right password; other networks still get in", async () => {
    useTestDb();
    const b = browser("198.51.100.30");
    for (let i = 0; i < 5; i++) expect((await signIn(b, { id: ID, password: `wrong-${i}` })).status).toBe(400);
    vi.setSystemTime(T0 + 61_000); // past the per-minute limiter: the 15-minute count alone shuts it now
    const shut = await signIn(b);
    expect(shut.status).toBe(429);
    expect(await shut.json()).toMatchObject({ code: "RATE_LIMIT", message: "로그인 시도가 많았어요. 15분 뒤에 다시 시도해 주세요." });
    expect(b.jar.has("sl_sid")).toBe(false);
    expect((await signIn(browser("198.51.100.31"))).status).toBe(200);
    vi.setSystemTime(T0 + 15 * 60_000 + 1);
    expect((await signIn(b)).status).toBe(200);
  });

  it("logs one alert line, without values, after 50 failures across all networks, and still lets every other network in", async () => {
    useTestDb();
    for (let i = 0; i < 55; i++) expect((await signIn(browser(`198.51.100.${100 + i}`), { id: ID, password: `wrong-${i}` })).status).toBe(400);
    const alerts = vi.mocked(console.warn).mock.calls.filter(([line]) => String(line).includes("auth.review_failures_alert"));
    expect(alerts).toEqual([[JSON.stringify({ evt: "auth.review_failures_alert" })]]);
    expect((await signIn(browser("198.51.100.199"))).status).toBe(200);
  });

  it("holds a burst of parallel guesses to 5 a minute, which the 15-minute count (no atomic increment in KV) cannot", async () => {
    useTestDb();
    const b = browser("198.51.100.32");
    const answers = await Promise.all(Array.from({ length: 8 }, (_, i) => signIn(b, { id: ID, password: `burst-${i}` })));
    expect(answers.map((answer) => answer.status).sort()).toEqual([400, 400, 400, 400, 400, 429, 429, 429]);
  });

  it("takes the login only from our own pages", async () => {
    useTestDb();
    expect((await browser().send(review, "/api/auth/review", { body: { id: ID, password: PASSWORD } })).status).toBe(403);
  });
});

describe("a production deploy on test keys (security M1)", () => {
  function productionOnTestKeys() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_PAY", "");
    vi.stubEnv("STARLOG_PAYMENTS", "owner");
    vi.stubEnv("NEXT_PUBLIC_TOSS_CLIENT_KEY", "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm");
    vi.stubEnv("TOSS_SECRET_KEY", "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6");
    vi.stubEnv("STARLOG_SIGNING_SECRET", "signing-secret-for-review-tests-0123456789");
    vi.stubEnv("STARLOG_ACCOUNT_SECRET", "account-secret-for-review-tests-0123456789");
  }
  const order = (b: Browser) => b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", returnTo: "/tarot/result", ack: true }, origin: true });

  it("still sells nothing to an ordinary session, while the review account reaches the Toss checkout", async () => {
    productionOnTestKeys();
    const db = useTestDb();
    // An ordinary member who logged in with Kakao earlier.
    const member = (await loginKakaoUser(db, { key: "kakao-member", nickname: "별손님", ageConfirmed: true, now: T0 }))!.user;
    const { cookie } = await createSession(db, member.id, signingSecret()!, T0);
    expect(cookie.name).toBe("__Host-sl_sid");
    const ordinary = browser("198.51.100.40");
    ordinary.jar.set(cookie.name, cookie.value);
    expect(await me(ordinary)).toMatchObject({ payments: false, owner: false, user: { nickname: "별손님" } });
    expect((await ordinary.send(checkout, "/api/pay/checkout?product=tarot")).status).toBe(409);
    expect((await order(ordinary)).status).toBe(409);

    const reviewer = browser("198.51.100.41");
    expect((await signIn(reviewer)).status).toBe(200);
    const state = await me(reviewer);
    expect(state).toMatchObject({ payments: true, owner: false, user: { gift: null, review: true } });
    // The result page offers "2,900원 결제하고 보기": no 오픈 기념 reading and no signup gift in its place.
    expect(unlockOffer(parseAccount(state), standardProduct("tarot"))).toEqual({ mode: "pay", priceKrw: 2900 });
    expect(await (await reviewer.send(checkout, "/api/pay/checkout?product=tarot")).json()).toMatchObject({ productId: "tarot", amount: 2900, provider: "toss", clientKey: "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm" });
    expect((await order(reviewer)).status).toBe(200);
  });

  it("makes new credentials a new review account: sessions on the old one lose the sales right at once", async () => {
    productionOnTestKeys();
    const db = useTestDb();
    const before = browser("198.51.100.43");
    expect((await signIn(before)).status).toBe(200);
    const renewed = "a-new-password-for-the-second-round";
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", renewed);
    expect(await me(before)).toMatchObject({ payments: false, user: { nickname: "심사용 계정" } });
    expect((await before.send(checkout, "/api/pay/checkout?product=tarot")).status).toBe(409);
    const after = browser("198.51.100.44");
    expect((await signIn(after, { id: ID, password: renewed })).status).toBe(200);
    expect(await me(after)).toMatchObject({ payments: true, user: { review: true } });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM users").first()).toEqual({ n: 2 });
  });

  it("gives the review account no more than sales: premium stays the owner's, and turning the login off closes sales to it", async () => {
    productionOnTestKeys();
    vi.stubEnv("STARLOG_PREMIUM", "owner");
    useTestDb();
    const reviewer = browser("198.51.100.42");
    expect((await signIn(reviewer)).status).toBe(200);
    expect((await reviewer.send(checkout, "/api/pay/checkout?product=match")).status).toBe(409);
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", "");
    expect(await me(reviewer)).toMatchObject({ payments: false, user: { nickname: "심사용 계정" } });
    expect((await reviewer.send(checkout, "/api/pay/checkout?product=tarot")).status).toBe(409);
  });
});

describe("the review account's purchases and deletion", () => {
  it("refunds and deletes like any account (no Kakao re-check to ask), and the next login starts a fresh account", async () => {
    const db = useTestDb();
    const b = browser("198.51.100.50");
    expect((await signIn(b)).status).toBe(200);
    const refunded = await buy(b);
    expect((await b.send(refund, "/api/pay/refund", { body: { orderId: refunded }, origin: true })).status).toBe(200);
    const unopened = await buy(b);
    const res = await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true });
    expect(await res.json()).toEqual({ url: "/me?account=deleted" });
    expect(b.jar.has("sl_sid")).toBe(false);
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(unopened).first()).toEqual({ status: "refunded" });
    expect(await db.prepare("SELECT kakao_key, nickname, deleted_at, erased_at FROM users").first()).toEqual({ kakao_key: null, nickname: null, deleted_at: T0, erased_at: T0 });
    expect((await signIn(b)).status).toBe(200);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL").first()).toEqual({ n: 1 });
  });

  it("holds at most 3 unopened purchases at a time (security M2); other accounts are not held to it", async () => {
    useTestDb();
    const b = browser("198.51.100.54");
    expect((await signIn(b)).status).toBe(200);
    const first = await buy(b);
    await buy(b);
    await buy(b);
    const fourth = await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", returnTo: "/tarot/result", ack: true }, origin: true });
    expect(fourth.status).toBe(409);
    expect(await fourth.json()).toMatchObject({ code: "NOT_AVAILABLE" });
    // One refunded makes room again.
    expect((await b.send(refund, "/api/pay/refund", { body: { orderId: first }, origin: true })).status).toBe(200);
    await buy(b);
    const member = browser("198.51.100.55");
    await loginAs(member, "alice");
    for (let i = 0; i < 4; i++) await buy(member);
  });

  it("opens nothing more, paid or with the gift, once its credentials are replaced or gone (security M1)", async () => {
    vi.stubEnv("STARLOG_AI", "mock");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const db = useTestDb();
    const b = browser("198.51.100.52");
    expect((await signIn(b)).status).toBe(200);
    await buy(b);
    await buy(b);
    expect((await openReading(b)).status).toBe(200);
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", "a-new-password-for-the-second-round");
    expect(await (await openReading(b)).json()).toMatchObject({ code: "NOT_AVAILABLE" });
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", "");
    for (const method of ["paid", "free"] as const) {
      const res = await openReading(b, method);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: "NOT_AVAILABLE" });
    }
    // Only the opening made while the login was on; the other purchase is still there to refund.
    expect((await db.prepare("SELECT status FROM unlocks").all()).results).toEqual([{ status: "delivered" }]);
    expect((await me(b)).user?.unused).toHaveLength(1);
  });

  it("can still be deleted with no Kakao re-check once its credentials are gone (security M1)", async () => {
    const db = useTestDb();
    const b = browser("198.51.100.53");
    expect((await signIn(b)).status).toBe(200);
    const unopened = await buy(b);
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", "");
    const res = await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true });
    expect(await res.json()).toEqual({ url: "/me?account=deleted" });
    expect(b.jar.has("sl_sid")).toBe(false);
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(unopened).first()).toEqual({ status: "refunded" });
    expect(await db.prepare("SELECT kakao_key, deleted_at FROM users").first()).toEqual({ kakao_key: null, deleted_at: T0 });
  });

  it("keeps the Kakao re-check for every other account", async () => {
    useTestDb();
    const b = browser("198.51.100.51");
    await loginAs(b, "alice");
    const { url } = (await (await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
    expect(url).toMatch(/^\/api\/auth\/kakao\/start\?purpose=delete&intent=/);
  });
});
