import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret } from "@/lib/account/secrets";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { reserveUnlock } from "@/lib/pay/ledger";
import { mockToss } from "@/lib/pay/tossMock";
import { TossError } from "@/lib/pay/tossTypes";
import { insertReadingStatement, newReadingId } from "@/lib/readings/store";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { GET as callback } from "../auth/kakao/callback/route";
import { GET as start } from "../auth/kakao/start/route";
import { POST as confirm } from "../pay/confirm/route";
import { POST as ordersPost } from "../pay/orders/route";
import { POST as refund } from "../pay/refund/route";
import { POST as deleteIntent } from "./delete-intent/route";

const T0 = Date.parse("2026-10-01T03:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  resetMemoryLimiter();
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

let ipSeq = 0;
async function loggedIn(name: string): Promise<Browser> {
  const b = browser(`198.51.100.${100 + ++ipSeq}`);
  await loginAs(b, name);
  return b;
}

/** The whole deletion as the 내 정보 page drives it; `kakaoUser` is who re-checks at Kakao. Returns the final redirect. */
async function deleteAs(b: Browser, kakaoUser: string): Promise<string> {
  const { url } = (await (await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
  const started = await b.send(start, `${url}&mockUser=${kakaoUser}`);
  const location = started.headers.get("location")!;
  if (!location.includes("/api/auth/kakao/callback")) return location;
  return (await b.send(callback, location)).headers.get("location")!;
}

const one = (db: D1Binding, sql: string) => db.prepare(sql).first();
const userIdOf = async (db: D1Binding) => (await db.prepare("SELECT id FROM users ORDER BY created_at LIMIT 1").first<{ id: string }>())!.id;

describe("account deletion", () => {
  it("re-checks with Kakao, refunds unopened purchases, erases personal data and keeps a tombstone", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const orderId = await buy(b);
    const userId = await userIdOf(db);
    const chapter = { kind: "tarot" as const, question: "지울 질문", reading: { verdict: "v" }, chapterToken: "t", createdAt: T0, turns: [], followUpsLeft: 3 };
    await (await insertReadingStatement(db, accountSecret()!, { id: newReadingId(), userId, productId: "tarot", source: "paid", unlockId: null, chapter, now: T0 })).run();

    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?account=deleted");
    expect(b.jar.has("sl_sid")).toBe(false);
    expect(await one(db, "SELECT kakao_key, nickname, deleted_at, erased_at FROM users")).toEqual({ kakao_key: null, nickname: null, deleted_at: T0, erased_at: T0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM sessions")).toEqual({ n: 0 });
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "refunded" });
    expect((await mockToss.getPaymentByOrder(orderId)).status).toBe("CANCELED");
    expect(await one(db, "SELECT status, units_left FROM credit_lots WHERE currency = 'free'")).toEqual({ status: "revoked", units_left: 0 });
    expect(await one(db, "SELECT account_deleted_at FROM gift_claims")).toEqual({ account_deleted_at: T0 });
    expect((await me(b)).user).toBeNull();

    // Joining again with the same Kakao account makes a new account, without a second gift.
    await loginAs(b, "alice");
    expect((await me(b)).user?.stardust).toBe(0);
    expect(await one(db, "SELECT COUNT(*) AS n FROM users")).toEqual({ n: 2 });
    expect(await one(db, "SELECT account_deleted_at FROM gift_claims")).toEqual({ account_deleted_at: null });
  });

  it("cannot be started by a link, another session, or another site", async () => {
    useTestDb();
    const alice = await loggedIn("alice");
    expect((await alice.send(start, "/api/auth/kakao/start?purpose=delete&mockUser=alice")).headers.get("location")).toBe("http://localhost/me?delete=failed");
    const bob = await loggedIn("bob");
    const { url } = (await (await bob.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
    expect((await alice.send(start, `${url}&mockUser=alice`)).headers.get("location")).toBe("http://localhost/me?delete=failed");
    expect((await alice.send(deleteIntent, "/api/account/delete-intent", { method: "POST" })).status).toBe(403);
    expect((await me(alice)).user).not.toBeNull();
  });

  it("stops when a different Kakao account answers the re-check", async () => {
    useTestDb();
    const b = await loggedIn("alice");
    expect(await deleteAs(b, "mallory")).toBe("http://localhost/me?delete=mismatch");
    expect((await me(b)).user).not.toBeNull();
  });

  it("deletes nothing when a refund is refused", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const orderId = await buy(b);
    mockToss.failNext("cancel", new TossError(403, "NOT_CANCELABLE_PAYMENT", "취소 할 수 없는 결제 입니다."));
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?delete=refund-failed");
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot" }]);
    expect(await one(db, "SELECT deleted_at FROM users")).toEqual({ deleted_at: null });
  });

  it("completes with payments made under other Toss keys: their readings leave use, the operator settles them", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const unused = await buy(b);
    const refunding = await buy(b);
    mockToss.failNext("cancel", new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", "이전 요청이 처리 중입니다."));
    expect((await b.send(refund, "/api/pay/refund", { body: { orderId: refunding }, origin: true })).status).toBe(409);
    // The deploy moved to other keys (test → live) before either was settled.
    await db.prepare("UPDATE payments SET mode = 'test'").run();
    const cancel = vi.spyOn(mockToss, "cancel");
    const lookUp = vi.spyOn(mockToss, "getPayment");
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?account=deleted");
    expect(cancel).not.toHaveBeenCalled();
    expect(lookUp).not.toHaveBeenCalled();
    expect(await db.prepare("SELECT o.status AS o, l.status AS l, l.units_left AS left FROM orders o JOIN credit_lots l ON l.order_id = o.id WHERE o.id = ?").bind(unused).first()).toEqual({ o: "paid", l: "revoked", left: 0 });
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(refunding).first()).toEqual({ status: "refunding" });
    expect(await one(db, "SELECT erased_at FROM users")).toEqual({ erased_at: T0 });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("pay.other_keys"));
  });

  it("waits while a payment is still being confirmed", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const { orderId } = (await (await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true }, origin: true })).json()) as { orderId: string };
    mockToss.failNext("confirm", new TossError(409, "IDEMPOTENT_REQUEST_PROCESSING", "이전 요청이 처리 중입니다."));
    expect((await b.send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_busy", orderId, amount: 2900 }, origin: true })).status).toBe(409);
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?delete=pending");
    expect(await one(db, "SELECT deleted_at FROM users")).toEqual({ deleted_at: null });
  });

  it("finishes, and logs out, when Kakao cannot be reached to unlink the app afterwards", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    // From here the real Kakao flow, with Kakao's answers stubbed: the unlink call never gets one.
    vi.stubEnv("STARLOG_KAKAO", "");
    vi.stubEnv("KAKAO_REST_API_KEY", "rest-key");
    vi.stubEnv("KAKAO_CLIENT_SECRET", "client-secret");
    vi.stubGlobal("fetch", async (url: string | URL | Request) => {
      const target = String(url);
      if (target.startsWith("https://kauth.kakao.com/oauth/token")) return Response.json({ access_token: "token" });
      if (target.startsWith("https://kapi.kakao.com/v2/user/me")) return Response.json({ id: "mock-alice" });
      throw new TypeError("fetch failed");
    });
    const warn = vi.mocked(console.warn);
    try {
      const { url } = (await (await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
      const state = new URL((await b.send(start, url)).headers.get("location")!).searchParams.get("state");
      const done = await b.send(callback, `/api/auth/kakao/callback?code=kakao-code&state=${state}`);
      expect(done.status).toBe(303);
      expect(done.headers.get("location")).toBe("http://localhost/me?account=deleted");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(b.jar.has("sl_sid")).toBe(false);
    expect(await one(db, "SELECT erased_at FROM users")).toEqual({ erased_at: T0 });
    expect(warn).toHaveBeenCalledWith(JSON.stringify({ evt: "auth.kakao_unlink_failed" }));
  });

  it("waits while a reading is being opened", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const reserved = await reserveUnlock(db, { userId: await userIdOf(db), productId: "tarot", currency: "free", units: 10, now: T0, payMode: "mock" });
    expect(reserved.ok).toBe(true);
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?delete=in-use");
    expect(await one(db, "SELECT deleted_at FROM users")).toEqual({ deleted_at: null });
  });
});
