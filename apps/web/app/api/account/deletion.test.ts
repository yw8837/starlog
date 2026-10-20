import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSecret } from "@/lib/account/secrets";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { releaseUnlock, reserveUnlock } from "@/lib/pay/ledger";
import { mockToss } from "@/lib/pay/tossMock";
import { TossError } from "@/lib/pay/tossTypes";
import { meStatusMessage } from "@/app/me/meStatus";
import { insertReadingStatement, newReadingId } from "@/lib/readings/store";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, grantGift, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { GET as callback } from "../auth/kakao/callback/route";
import { GET as start } from "../auth/kakao/start/route";
import { POST as confirm } from "../pay/confirm/route";
import { POST as ordersPost } from "../pay/orders/route";
import { POST as refund } from "../pay/refund/route";
import { POST as deleteIntent } from "./delete-intent/route";

const T0 = Date.parse("2026-10-01T03:00:00Z");
/** A purchase on 10-01 KST can be refunded on request through the end of 10-08 KST. */
const UNTIL = "2026-10-08T14:59:59.999Z";

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
    // A gift granted before the removal: it is forfeited, and its claim outlives the account.
    await grantGift(db, "alice");
    const orderId = await buy(b);
    const userId = await userIdOf(db);
    const chapter = { kind: "tarot" as const, question: "지울 질문", reading: { verdict: "v" }, chapterToken: "t", createdAt: T0, turns: [], followUpsLeft: 3 };
    await (await insertReadingStatement(db, accountSecret()!, { id: newReadingId(), userId, productId: "tarot", source: "paid", unlockId: null, chapter, now: T0 })).run();
    // A buyer's preview counts (A2 PII-2): the account's go with it, another account's stay.
    await db.batch([
      db.prepare("INSERT INTO buyer_previews (user_id, product_id, kst_day, n) VALUES (?, 'deep-tarot', '2026-10-20', 2)").bind(userId),
      db.prepare("INSERT INTO buyer_previews (user_id, product_id, kst_day, n) VALUES ('u_someone_else', 'deep-tarot', '2026-10-20', 1)"),
    ]);

    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?account=deleted");
    expect(b.jar.has("sl_sid")).toBe(false);
    expect(await one(db, "SELECT kakao_key, nickname, deleted_at, erased_at FROM users")).toEqual({ kakao_key: null, nickname: null, deleted_at: T0, erased_at: T0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
    expect(await db.prepare("SELECT user_id FROM buyer_previews").all()).toMatchObject({ results: [{ user_id: "u_someone_else" }] });
    expect(await one(db, "SELECT COUNT(*) AS n FROM sessions")).toEqual({ n: 0 });
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "refunded" });
    expect((await mockToss.getPaymentByOrder(orderId)).status).toBe("CANCELED");
    expect(await one(db, "SELECT status, units_left FROM credit_lots WHERE currency = 'free'")).toEqual({ status: "revoked", units_left: 0 });
    expect(await one(db, "SELECT account_deleted_at FROM gift_claims")).toEqual({ account_deleted_at: T0 });
    expect((await me(b)).user).toBeNull();

    // Joining again with the same Kakao account makes a new account, without a second gift.
    await loginAs(b, "alice");
    expect((await me(b)).user?.gift).toBeNull();
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
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot", refundUntil: UNTIL }]);
    expect(await one(db, "SELECT deleted_at FROM users")).toEqual({ deleted_at: null });
  });

  it("completes with a purchase given back after its client left: it leaves use with the account, never refunded; the others are refunded", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const left = await buy(b);
    const opening = await reserveUnlock(db, { userId: await userIdOf(db), productId: "tarot", currency: "paid", now: T0, payMode: "mock" });
    if (!opening.ok) throw new Error("not reserved");
    expect(await releaseUnlock(db, { unlockId: opening.unlockId, now: T0, left: true })).toBe(true);
    const unused = await buy(b);
    const cancel = vi.spyOn(mockToss, "cancel");
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?account=deleted");
    expect(cancel).toHaveBeenCalledTimes(1);
    const lotOf = (orderId: string) =>
      db.prepare("SELECT o.status AS o, l.status AS l, l.units_left AS left FROM orders o JOIN credit_lots l ON l.order_id = o.id WHERE o.id = ?").bind(orderId).first();
    expect(await lotOf(left)).toEqual({ o: "paid", l: "revoked", left: 0 });
    expect(await lotOf(unused)).toEqual({ o: "refunded", l: "refunded", left: 0 });
    expect(await one(db, "SELECT deleted_at, erased_at FROM users")).toEqual({ deleted_at: T0, erased_at: T0 });
  });

  it("still refunds an unopened purchase after the 7-day window for a buyer's 환불받기", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const orderId = await buy(b);
    vi.setSystemTime(Date.parse(UNTIL) + 1);
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?account=deleted");
    expect(await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "refunded" });
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
      const kakao = new URL((await b.send(start, url)).headers.get("location")!);
      // The re-check is a real login at Kakao, not the session Kakao already has.
      expect(kakao.searchParams.get("prompt")).toBe("login");
      const state = kakao.searchParams.get("state");
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

  it("tells a buyer coming back to an order the deletion closed that nothing was charged", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const { orderId } = (await (await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true }, origin: true })).json()) as { orderId: string };
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?account=deleted");
    expect(await db.prepare("SELECT status, fail_code FROM orders WHERE id = ?").bind(orderId).first()).toEqual({ status: "failed", fail_code: "ACCOUNT_DELETED" });
    const toss = vi.spyOn(mockToss, "confirm");
    const res = await browser("192.0.2.91").send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_late", orderId, amount: 2900 }, origin: true });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("PAY_FAILED");
    expect(body.message).toContain("청구된 금액은 없어요");
    expect(body.message).not.toContain("환불");
    expect(toss).not.toHaveBeenCalled();
  });

  it("sends KakaoTalk's in-app browser elsewhere: its Kakao login cannot be a re-check", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const { url } = (await (await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
    const cookie = [...b.jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const inApp = await start(
      new Request(new URL(`${url}&mockUser=alice`, "http://localhost"), {
        headers: { cookie, "cf-connecting-ip": "198.51.100.250", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 KAKAOTALK 10.8.0" },
      }),
    );
    expect(inApp.headers.get("location")).toBe("http://localhost/me?delete=in-app");
    expect(meStatusMessage({ delete: "in-app" })).toBe("탈퇴는 카카오톡 밖의 브라우저에서 해 주세요.");
    expect(await one(db, "SELECT deleted_at FROM users")).toEqual({ deleted_at: null });
  });

  it("never sends a lost confirm again while deleting: it waits for the payment instead", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    const { orderId } = (await (await b.send(ordersPost, "/api/pay/orders", { body: { productId: "tarot", ack: true }, origin: true })).json()) as { orderId: string };
    mockToss.failNext("confirm", new TossError(0, "NETWORK", "no response from Toss"));
    expect((await b.send(confirm, "/api/pay/confirm", { body: { paymentKey: "mock_waiting", orderId, amount: 2900 }, origin: true })).status).toBe(409);
    const authenticated = { paymentKey: "mock_waiting", orderId, status: "IN_PROGRESS", totalAmount: 2900, balanceAmount: 2900, method: "카드", approvedAt: null, receiptUrl: null };
    vi.spyOn(mockToss, "getPaymentByOrder").mockResolvedValue(authenticated);
    const confirmCall = vi.spyOn(mockToss, "confirm");
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?delete=pending");
    expect(confirmCall).not.toHaveBeenCalled();
    expect(await one(db, "SELECT deleted_at FROM users")).toEqual({ deleted_at: null });
  });

  it("waits while a reading is being opened", async () => {
    const db = useTestDb();
    const b = await loggedIn("alice");
    await grantGift(db, "alice"); // held from before the gift was removed
    const reserved = await reserveUnlock(db, { userId: await userIdOf(db), productId: "tarot", currency: "free", now: T0, payMode: "mock" });
    expect(reserved.ok).toBe(true);
    expect(await deleteAs(b, "alice")).toBe("http://localhost/me?delete=in-use");
    expect(await one(db, "SELECT deleted_at FROM users")).toEqual({ deleted_at: null });
  });
});
