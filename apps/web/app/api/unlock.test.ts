import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError, type GenerationHooks } from "@/lib/ai/provider";
import { accountSecret } from "@/lib/account/secrets";
import { dailyStore, resetDailyStore } from "@/lib/api/dailyStore";
import { addCost, clientCount, resetSpendState, spentTodayKrw } from "@/lib/api/spend";
import { NDJSON } from "@/lib/api/stream";
import { accountDb, setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { MAX_BEGAN_RESTORES, RESERVATION_MS, releaseUnlock, reserveUnlock } from "@/lib/pay/ledger";
import { payKeyMode } from "@/lib/pay/mode";
import { orderHistory } from "@/lib/pay/orders";
import { mockToss } from "@/lib/pay/tossMock";
import { listReadings } from "@/lib/readings/store";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { issueChapter, openChapter } from "@/lib/security/chapterToken";
import { kstDay } from "@/lib/security/quota";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { keyedHash, signingSecret } from "@/lib/security/sign";
import { browser, buy, grantGift, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as followup } from "./followup/route";
import { POST as ownerPost } from "./owner/route";
import { POST as refund } from "./pay/refund/route";
import { POST as sajuReading } from "./saju/reading/route";
import { POST as draw } from "./tarot/draw/route";
import { POST as reading } from "./tarot/reading/route";

const T0 = Date.parse("2026-10-01T03:00:00Z");
const MONEY_INPUT = {
  topicId: "money", whoId: "me", whenId: "week",
  question: "이번 주, 나의 재물 흐름은 어떨까",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }, { label: "관심 방향", value: "지출 줄이기" }],
  note: "이번 달 카드값이 많이 나왔어요",
};
/** 2,800원 with KRW_PER_USD=1400. */
const EXPENSIVE = [{ model: "claude-opus-5-5", inputTokens: 0, outputTokens: 100_000, cacheReadTokens: 0, cacheWriteTokens: 0 }];

let ipSeq = 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
  vi.stubEnv("STARLOG_OWNER_CODE", "owner-code-for-tests-0001");
  vi.stubEnv("KRW_PER_USD", "1400");
  resetMemoryLimiter();
  resetDailyStore();
  resetSpendState();
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

async function loggedIn(name = "alice"): Promise<{ b: Browser; ip: string }> {
  const ip = `198.51.100.${++ipSeq}`;
  const b = browser(ip);
  await loginAs(b, name);
  // Accounts here hold the signup gift, as accounts that joined before it was removed do (logins grant none).
  await grantGift(accountDb()!, name);
  return { b, ip };
}

async function open(b: Browser, method?: string, accept?: string, signal?: AbortSignal) {
  const drawn = await b.send(draw, "/api/tarot/draw", { body: { templateId: "self-flow", picks: [3, 30, 60] } });
  const { drawToken } = (await drawn.json()) as { drawToken: string };
  return b.send(reading, "/api/tarot/reading", { body: { drawToken, input: MONEY_INPUT, ...(method ? { unlock: { method } } : {}) }, accept, signal });
}

/** The mock provider, reporting EXPENSIVE as billed, like the real one does. */
function billing() {
  const real = mockProvider.generate.bind(mockProvider);
  return vi.spyOn(mockProvider, "generate").mockImplementation(async (task, attempt, feedback, hooks?: GenerationHooks) => {
    hooks?.onUsage?.(EXPENSIVE);
    return real(task, attempt, feedback, hooks);
  });
}

async function paidBook(): Promise<number> {
  let sum = 0;
  for (let shard = 0; shard < 8; shard++) sum += Number((await dailyStore().get(`paidcost:${kstDay(Date.now())}:${shard}`)) ?? 0);
  return Math.round(sum);
}
const freeBook = async () => Math.round((await spentTodayKrw(Date.now())) ?? -1);
const userId = async (db: D1Binding) => (await db.prepare("SELECT id FROM users ORDER BY created_at LIMIT 1").first<{ id: string }>())!.id;
const one = (db: D1Binding, sql: string) => db.prepare(sql).first();
const giftOf = async (b: Browser) => (await me(b)).user?.gift?.status;

describe("opening a full reading with credit", () => {
  it("keeps 오픈 기념 무료 once payments are on for everyone (owner 2026-10-14), for a logged-in account once (owner 2026-10-27), apart from a gift held", async () => {
    const db = useTestDb();
    const guest = browser("192.0.2.10");
    const login = await open(guest);
    expect(login.status).toBe(401);
    expect(await login.json()).toMatchObject({ code: "LOGIN_REQUIRED", reason: "opening" });
    expect(guest.jar.has("sl_first")).toBe(false);
    // A member holding a gift: 오픈 기념 무료 leaves it untouched, and the gift still opens one.
    const { b } = await loggedIn();
    const free = await open(b);
    expect(free.status).toBe(200);
    expect(b.jar.has("sl_first")).toBe(true);
    const again = await open(b);
    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({ code: "BETA_LIMIT", scope: "first" });
    // Never saved to the account, even logged in: no 풀이 후기 can be written for it (reviews need a saved reading).
    expect(((await free.json()) as { readingId?: string }).readingId).toBeUndefined();
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
    expect(await giftOf(b)).toBe("unused");
    expect((await open(b, "free")).status).toBe(200);
    expect(await giftOf(b)).toBe("used");
  });

  it("keeps the free opening's guards once payments are on, and saju still has no free reading", async () => {
    useTestDb();
    const spy = vi.spyOn(mockProvider, "generate");
    const saju = await browser("192.0.2.14").send(sajuReading, "/api/saju/reading", { body: { birth: DEFAULT_SAJU_FORM } });
    expect(saju.status).toBe(402);
    expect(await saju.json()).toMatchObject({ code: "PAYMENT_REQUIRED" });
    vi.stubEnv("BETA_IP_FULL_PER_DAY", "0");
    const capped = await open(browser("192.0.2.15"));
    expect(capped.status).toBe(429);
    expect(await capped.json()).toMatchObject({ code: "BETA_LIMIT", scope: "network" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("asks for login before spending credit, and says when there is none", async () => {
    useTestDb();
    expect((await open(browser("192.0.2.11"), "paid")).status).toBe(401);
    const { b } = await loggedIn();
    const res = await open(b, "paid");
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "NO_CREDIT" });
  });

  it("opens no more with a purchase the model began writing MAX_BEGAN_RESTORES times and never finished, before any generation; it stays unused and refundable (L-1)", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    const orderId = await buy(b, "tarot");
    const { id: userId } = (await db.prepare("SELECT id FROM users").first<{ id: string }>())!;
    for (let i = 0; i < MAX_BEGAN_RESTORES; i++) {
      const held = await reserveUnlock(db, { userId, productId: "tarot", currency: "paid", now: Date.now(), payMode: payKeyMode() });
      if (!held.ok) throw new Error("not reserved");
      expect(await releaseUnlock(db, { unlockId: held.unlockId, now: Date.now(), began: true })).toBe(true);
    }
    const generate = vi.spyOn(mockProvider, "generate");
    const res = await open(b, "paid");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "NOT_AVAILABLE", reason: "capped", message: "풀이가 여러 번 끝까지 나오지 않아 이 결제로는 더 열 수 없어요. 결제는 쓰이지 않았으니 문의해 주시면 기간과 상관없이 전액 환불해 드려요." });
    expect(generate).not.toHaveBeenCalled();
    expect(vi.mocked(console.warn).mock.calls.map(([line]) => JSON.parse(String(line)))).toContainEqual({ evt: "unlock.capped", productId: "tarot", lotId: `lot_${orderId}` });
    expect((await me(b)).user?.unused).toMatchObject([{ productId: "tarot" }]);
    expect(await orderHistory(db, userId)).toMatchObject([{ productId: "tarot", opened: false, unfinished: false, refundable: true }]);
  });

  it("says a signup gift that kept failing opens no more, in a gift's words: there is no payment to refund (L-1)", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    const { id: userId } = (await db.prepare("SELECT id FROM users").first<{ id: string }>())!;
    for (let i = 0; i < MAX_BEGAN_RESTORES; i++) {
      const held = await reserveUnlock(db, { userId, productId: "tarot", currency: "free", now: Date.now(), payMode: payKeyMode() });
      if (!held.ok) throw new Error("not reserved");
      expect(await releaseUnlock(db, { unlockId: held.unlockId, now: Date.now(), began: true })).toBe(true);
    }
    const res = await open(b, "free");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "NOT_AVAILABLE", reason: "capped", message: "풀이가 여러 번 끝까지 나오지 않아 이 가입 선물로는 더 열 수 없어요. 문의해 주세요." });
    expect((await me(b)).user?.gift).toMatchObject({ status: "unused" });
  });

  it("opens a tarot reading with the signup gift: saved and spent only then, no quota cookie, counted like a free reading", async () => {
    const db = useTestDb();
    const { b, ip } = await loggedIn();
    expect(await giftOf(b)).toBe("unused");
    billing();
    const res = await open(b, "free");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { readingId: string; chapterToken: string };
    expect(body.readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("sl_q=") || c.startsWith("sl_first="))).toBe(false);
    expect(await giftOf(b)).toBe("used");
    expect(await one(db, "SELECT source FROM readings")).toEqual({ source: "free" });
    const { readings } = await listReadings(db, accountSecret()!, await userId(db));
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({ id: body.readingId, chapter: { kind: "tarot", question: MONEY_INPUT.question, chapterToken: body.chapterToken, followUpsLeft: 3 } });
    expect((readings[0]!.chapter.cards as unknown[]).length).toBe(3);
    expect(await freeBook()).toBe(2800);
    expect(await paidBook()).toBe(0);
    expect(await clientCount(await keyedHash(`client:${ip}`, signingSecret()!), "full", Date.now())).toBe(1);
  });

  it("stops the gift when the free budget is spent, before reserving; a paid reading still opens, on the paid book", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0");
    const free = await open(b, "free");
    expect(free.status).toBe(503);
    expect(await free.json()).toMatchObject({ reason: "budget" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks")).toEqual({ n: 0 });
    expect(await giftOf(b)).toBe("unused");
    await buy(b);
    billing();
    expect((await open(b, "paid")).status).toBe(200);
    expect(await paidBook()).toBe(2800);
    expect(await freeBook()).toBe(0);
  });

  it("opens a paid reading once, then there is nothing left to spend", async () => {
    useTestDb();
    const { b } = await loggedIn();
    await buy(b);
    expect((await open(b, "paid")).status).toBe(200);
    expect((await me(b)).user?.unused).toEqual([]);
    expect((await open(b, "paid")).status).toBe(402);
    expect(await giftOf(b)).toBe("unused");
  });

  it("gives the gift back when the generation fails", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(mockProvider, "generate").mockRejectedValue(new GenerationError("UPSTREAM"));
    expect((await open(b, "free")).status).toBe(502);
    expect(await giftOf(b)).toBe("unused");
    expect(await one(db, "SELECT status FROM unlocks")).toEqual({ status: "released" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
    vi.mocked(mockProvider.generate).mockRestore();
    expect((await open(b, "free")).status).toBe(200);
    expect(await giftOf(b)).toBe("used");
  });

  it("refuses the gift for saju and for a 운 before anything is held or written, and keeps it for tarot", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    const spy = vi.spyOn(mockProvider, "generate");
    for (const topic of [undefined, "money", "career"]) {
      const res = await b.send(sajuReading, "/api/saju/reading", { body: { birth: DEFAULT_SAJU_FORM, ...(topic ? { topic } : {}), unlock: { method: "free" } } });
      expect(res.status, topic).toBe(402);
      expect(await res.json()).toMatchObject({ code: "NO_CREDIT" });
    }
    expect(spy).not.toHaveBeenCalled();
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind <> 'grant'")).toEqual({ n: 0 });
    expect(await giftOf(b)).toBe("unused");
    expect((await open(b, "free")).status).toBe(200);
  });

  it("refuses the gift for a premium spread: the standard reading never takes its draw", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    const drawn = await b.send(draw, "/api/tarot/draw", { body: { templateId: "deep-tarot", picks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] } });
    const { drawToken } = (await drawn.json()) as { drawToken: string };
    const res = await b.send(reading, "/api/tarot/reading", { body: { drawToken, input: MONEY_INPUT, unlock: { method: "free" } } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "BAD_TOKEN" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks")).toEqual({ n: 0 });
    expect(await giftOf(b)).toBe("unused");
  });

  it("gives a purchase whose reading the client left after the model began answering back to reopen, but no longer refundable", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    const orderId = await buy(b, "tarot");
    vi.spyOn(mockProvider, "generate").mockImplementation((_task, _attempt, _feedback, hooks) => new Promise((_, reject) => {
      hooks?.onReserve?.(EXPENSIVE);
      hooks?.onText?.('{"cards": [{');
      hooks?.signal?.addEventListener("abort", () => reject(new GenerationError("UPSTREAM", ["aborted"])));
    }));
    const controller = new AbortController();
    const res = await open(b, "paid", NDJSON, controller.signal);
    expect(res.status).toBe(200);
    controller.abort();
    await res.text().catch(() => "");
    await vi.waitFor(async () => expect(await one(db, "SELECT status FROM unlocks")).toEqual({ status: "released" }));
    vi.mocked(mockProvider.generate).mockRestore();
    expect(await one(db, "SELECT units_left FROM credit_lots WHERE currency = 'paid'")).toEqual({ units_left: 1 });
    // 내 정보 lists it to open again, never with a refund deadline (no 환불받기).
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot", refundable: false }]);
    expect((await b.send(refund, "/api/pay/refund", { body: { orderId }, origin: true })).status).toBe(409);
    expect((await open(b, "paid")).status).toBe(200);
  });

  it("gives the gift back when the client leaves before the model began answering", async () => {
    useTestDb();
    const { b } = await loggedIn();
    vi.spyOn(mockProvider, "generate").mockImplementation(
      (_task, _attempt, _feedback, hooks) => new Promise((_, reject) => hooks?.signal?.addEventListener("abort", () => reject(new GenerationError("UPSTREAM", ["aborted"])))),
    );
    const controller = new AbortController();
    const res = await open(b, "free", NDJSON, controller.signal);
    expect(res.status).toBe(200);
    controller.abort();
    await res.text().catch(() => "");
    vi.mocked(mockProvider.generate).mockRestore();
    await vi.waitFor(async () => expect(await giftOf(b)).toBe("unused"));
  });

  it("streams: the done event carries the saved reading's id", async () => {
    useTestDb();
    const { b } = await loggedIn();
    const lines = (await (await open(b, "free", NDJSON)).text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string; data?: { readingId?: string } });
    const done = lines.find((event) => event.type === "done");
    expect(done?.data?.readingId).toMatch(/^[a-z0-9]{20}$/);
  });

  it("still ends in done when the save landed but its D1 answer was lost, spending the credit once", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    const realBatch = db.batch.bind(db);
    let batches = 0;
    // Batch 1 is the reservation, batch 2 the delivery: it commits, then its answer is lost.
    vi.spyOn(db, "batch").mockImplementation(async (statements) => {
      const results = await realBatch(statements);
      if (++batches === 2) throw new Error("D1 answer lost");
      return results;
    });
    const lines = (await (await open(b, "free", NDJSON)).text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string; data?: { readingId?: string } });
    expect(lines.at(-1)?.type).toBe("done");
    expect(lines.at(-1)?.data?.readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(await one(db, "SELECT status FROM unlocks")).toEqual({ status: "delivered" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'spend'")).toEqual({ n: 1 });
    expect(await giftOf(b)).toBe("used");
  });

  it("lets the owner open free, saved to the account when logged in, with no ledger movement", async () => {
    const db = useTestDb();
    expect((await open(browser("192.0.2.12"), "owner")).status).toBe(403);
    const owner = browser("192.0.2.13");
    await owner.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" }, origin: true });
    await loginAs(owner, "owner");
    const res = await open(owner, "owner");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { readingId?: string }).readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(await one(db, "SELECT source FROM readings")).toEqual({ source: "owner" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind <> 'grant'")).toEqual({ n: 0 });
  });

  it("never traps the gift: it can still be used after payments are switched off", async () => {
    useTestDb();
    const { b } = await loggedIn();
    vi.stubEnv("STARLOG_PAYMENTS", "off");
    expect((await open(b, "free")).status).toBe(200);
  });

  it("saves the saju teaser's title with a paid saju reading", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    await buy(b, "saju");
    const res = await b.send(sajuReading, "/api/saju/reading", {
      body: { birth: DEFAULT_SAJU_FORM, unlock: { method: "paid" }, display: { title: "타고난 결", summary: "요약 한 줄" } },
    });
    expect(res.status).toBe(200);
    const { readings } = await listReadings(db, accountSecret()!, await userId(db));
    expect(readings[0]?.chapter).toMatchObject({ kind: "saju", title: "타고난 결", summary: "요약 한 줄" });
  });

  it("saves a paid 재물운 reading with its topic to the account (product saju, no new product)", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    await buy(b, "saju");
    const res = await b.send(sajuReading, "/api/saju/reading", {
      body: { birth: DEFAULT_SAJU_FORM, topic: "money", unlock: { method: "paid" }, display: { title: "흙 속의 쇠", summary: "요약 한 줄" } },
    });
    expect(res.status).toBe(200);
    const { readings } = await listReadings(db, accountSecret()!, await userId(db));
    expect(readings[0]?.chapter).toMatchObject({ kind: "saju", topic: "money", title: "흙 속의 쇠" });
    expect(readings[0]?.chapter).not.toHaveProperty("context");
    expect(readings[0]?.chapter).not.toHaveProperty("situation");
  });

  it("opens topics with a purchase and with the owner pass, saving each topic", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    await buy(b, "saju");
    expect((await b.send(sajuReading, "/api/saju/reading", { body: { birth: DEFAULT_SAJU_FORM, topic: "career", unlock: { method: "paid" } } })).status).toBe(200);
    expect((await b.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" }, origin: true })).status).toBe(200);
    expect((await b.send(sajuReading, "/api/saju/reading", { body: { birth: DEFAULT_SAJU_FORM, topic: "love", unlock: { method: "owner" } } })).status).toBe(200);
    const { readings } = await listReadings(db, accountSecret()!, await userId(db));
    expect(readings.map((r) => r.chapter.topic).sort()).toEqual(["career", "love"]);
  });

  it("opens a paid saju reading whose teaser text runs long, keeping the text cut to fit", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    await buy(b, "saju");
    const res = await b.send(sajuReading, "/api/saju/reading", {
      body: { birth: DEFAULT_SAJU_FORM, unlock: { method: "paid" }, display: { title: "결".repeat(100), summary: "흐름".repeat(700) } },
    });
    expect(res.status).toBe(200);
    const { readings } = await listReadings(db, accountSecret()!, await userId(db));
    expect(readings[0]?.chapter).toMatchObject({ kind: "saju", title: "결".repeat(80), summary: "흐름".repeat(500) });
    // A display that is not one at all is dropped, never a reason to refuse the opening.
    await buy(b, "saju");
    const odd = await b.send(sajuReading, "/api/saju/reading", { body: { birth: DEFAULT_SAJU_FORM, unlock: { method: "paid" }, display: { title: 7 } } });
    expect(odd.status).toBe(200);
  });
});

describe("a paid opening on a production deploy's test keys (security M2)", () => {
  /**
   * A member holding one unopened reading paid on the test keys, on a production deploy that runs them:
   * bought through the mock and recorded as a test-key payment, then the deploy switched over (same
   * secrets, so the session holds). A test payment charges nobody: this opening has earned nothing.
   */
  async function heldOnTestKeys() {
    vi.stubEnv("STARLOG_SIGNING_SECRET", "signing-secret-for-unlock-tests-0123456789");
    vi.stubEnv("STARLOG_ACCOUNT_SECRET", "account-secret-for-unlock-tests-0123456789");
    const db = useTestDb();
    const { b, ip } = await loggedIn();
    const orderId = await buy(b);
    await db.prepare("UPDATE payments SET mode = 'test' WHERE order_id = ?").bind(orderId).run();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_PAY", "");
    vi.stubEnv("NEXT_PUBLIC_TOSS_CLIENT_KEY", "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm");
    vi.stubEnv("TOSS_SECRET_KEY", "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6");
    b.jar.set("__Host-sl_sid", b.jar.get("sl_sid")!);
    return { db, b, ip };
  }

  it("stops at the day's budget like a free full reading, before the purchase is reserved", async () => {
    const { db, b } = await heldOnTestKeys();
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0");
    const res = await open(b, "paid");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reason: "budget" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks")).toEqual({ n: 0 });
  });

  it("stops at the network's daily cap of full readings", async () => {
    const { b } = await heldOnTestKeys();
    vi.stubEnv("BETA_IP_FULL_PER_DAY", "0");
    const res = await open(b, "paid");
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "BETA_LIMIT", scope: "network" });
  });

  it("counts like a free full reading: on the network's day count and the free budget, never the paid book", async () => {
    const { b, ip } = await heldOnTestKeys();
    billing();
    const opened = await open(b, "paid");
    expect(opened.status).toBe(200);
    expect(await freeBook()).toBe(2800);
    expect(await paidBook()).toBe(0);
    expect(await clientCount(await keyedHash(`client:${ip}`, signingSecret()!), "full", Date.now())).toBe(1);
    // Nor is its chapter signed as paid for: its follow-ups stay free generations.
    const { reading: body, chapterToken } = (await opened.json()) as { reading: unknown; chapterToken: string };
    expect((await openChapter(chapterToken, body, signingSecret()!, Date.now()))?.ctx).not.toHaveProperty("paid");
  });
});

describe("follow-ups on a standard reading and the day's budget", () => {
  type Opened = { reading: unknown; chapterToken: string };
  const ask = (b: Browser, opened: Opened) =>
    b.send(followup, "/api/followup", { body: { chapterToken: opened.chapterToken, reading: opened.reading, question: "이번 달 지출은 어떻게 줄이면 좋을까요?" } });
  const ctxOf = async (opened: Opened) => (await openChapter(opened.chapterToken, opened.reading, signingSecret()!, Date.now()))?.ctx;

  async function paidReading(b: Browser): Promise<Opened> {
    await buy(b);
    const res = await open(b, "paid");
    expect(res.status).toBe(200);
    return (await res.json()) as Opened;
  }

  /** The same chapter as a token issued before the signed `paid` (2026-10-21). */
  async function withoutPaid(opened: Opened): Promise<Opened> {
    const chapter = (await openChapter(opened.chapterToken, opened.reading, signingSecret()!, Date.now()))!;
    const ctx = { ...chapter.ctx };
    delete ctx.paid;
    return { reading: opened.reading, chapterToken: await issueChapter(ctx, opened.reading, chapter.turns, signingSecret()!, Date.now(), chapter.exp) };
  }

  it("answers a paid reading's follow-up past the free cap and its ceiling, on the paid book: its chapter says it was paid for", async () => {
    useTestDb();
    const { b } = await loggedIn();
    const opened = await paidReading(b);
    expect(await ctxOf(opened)).toMatchObject({ kind: "tarot", paid: true });
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0"); // every free generation stops
    billing();
    expect((await ask(b, opened)).status).toBe(200);
    expect(await paidBook()).toBe(2800);
    expect(await freeBook()).toBe(0);
  });

  it("signs `paid` into a paid saju chapter too (전체 흐름 and a topic), whose follow-up answers past the ceiling", async () => {
    useTestDb();
    const { b } = await loggedIn();
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0");
    for (const topic of [undefined, "money"]) {
      await buy(b, "saju");
      const res = await b.send(sajuReading, "/api/saju/reading", { body: { birth: DEFAULT_SAJU_FORM, ...(topic ? { topic } : {}), unlock: { method: "paid" } } });
      expect(res.status).toBe(200);
      const opened = (await res.json()) as Opened;
      expect(await ctxOf(opened)).toMatchObject({ kind: "saju", paid: true });
      expect((await ask(b, opened)).status, topic).toBe(200);
    }
  });

  it("keeps a token without the signed `paid` (issued before it) and a gift reading's on the free path: open past the cap, on the free book, closed at the ceiling", async () => {
    useTestDb();
    const { b } = await loggedIn();
    const paid = await paidReading(b);
    const old = await withoutPaid(paid);
    const giftRes = await open(b, "free");
    expect(giftRes.status).toBe(200);
    const gift = (await giftRes.json()) as Opened;
    expect(await ctxOf(gift)).not.toHaveProperty("paid");
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "10000");
    await addCost(8_000, Date.now()); // the cap trips at 8,000; the ceiling at 16,000
    billing();
    expect((await ask(b, old)).status).toBe(200);
    expect((await ask(b, gift)).status).toBe(200);
    expect(await freeBook()).toBe(8_000 + 2 * 2800);
    expect(await paidBook()).toBe(0);
    await addCost(16_000, Date.now());
    const closed = await ask(b, old);
    expect(closed.status).toBe(503);
    expect(await closed.json()).toMatchObject({ code: "AI_UNAVAILABLE", reason: "budget" });
    expect((await ask(b, paid)).status).toBe(200); // the same chapter's signed token still answers
  });
});
