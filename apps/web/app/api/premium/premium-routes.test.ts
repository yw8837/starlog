import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError, type GenerationHooks } from "@/lib/ai/provider";
import { accountSecret } from "@/lib/account/secrets";
import { dailyStore, resetDailyStore } from "@/lib/api/dailyStore";
import { clientCount, resetSpendState, spentTodayKrw, type SpendKind } from "@/lib/api/spend";
import { NDJSON } from "@/lib/api/stream";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { RESERVATION_MS } from "@/lib/pay/ledger";
import { mockToss } from "@/lib/pay/tossMock";
import { PREMIUM_CHAPTER_TTL_MS } from "@/lib/premium/products";
import { listReadings } from "@/lib/readings/store";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { isPremiumChapter, openChapter } from "@/lib/security/chapterToken";
import { kstDay } from "@/lib/security/quota";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { keyedHash, signingSecret } from "@/lib/security/sign";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as ownerPost } from "../owner/route";
import { POST as draw } from "../tarot/draw/route";
import { POST as matchReading } from "./match/reading/route";
import { POST as matchTeaser } from "./match/teaser/route";
import { POST as yearReading } from "./newyear-2027/reading/route";
import { POST as yearTeaser } from "./newyear-2027/teaser/route";
import { POST as deepReading } from "./tarot-deep/reading/route";
import { POST as deepTeaser } from "./tarot-deep/teaser/route";

const T0 = Date.parse("2026-11-20T03:00:00Z"); // inside 2027 신년운세's window
const DEEP_INPUT = {
  topicId: "money", whoId: "me", whenId: "month", question: "",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }], note: "이번 달 카드값이 많이 나왔어요",
};
const PARTNER = { ...DEFAULT_SAJU_FORM, year: 1992, month: 2, day: 26 };
/** 2,800원 with KRW_PER_USD=1400. */
const EXPENSIVE = [{ model: "claude-opus-5-5", inputTokens: 0, outputTokens: 100_000, cacheReadTokens: 0, cacheWriteTokens: 0 }];
let ip = 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  for (const [k, v] of Object.entries({
    STARLOG_AI: "mock", ANTHROPIC_API_KEY: "", STARLOG_PAYMENTS: "on", STARLOG_PREMIUM: "on",
    STARLOG_KAKAO: "mock", STARLOG_PAY: "mock", STARLOG_OWNER_CODE: "owner-code-for-tests-0001", KRW_PER_USD: "1400",
  })) vi.stubEnv(k, v);
  resetMemoryLimiter();
  resetDailyStore();
  resetSpendState();
  mockToss.reset();
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function shopper(): Promise<Browser> {
  const b = browser(`198.51.100.${++ip}`);
  await loginAs(b, `user${ip}`);
  return b;
}

async function dealt(b: Browser, templateId: "deep-tarot" | "match"): Promise<string> {
  const picks = templateId === "deep-tarot" ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [4, 18, 33, 51, 70];
  return ((await (await b.send(draw, "/api/tarot/draw", { body: { templateId, picks } })).json()) as { drawToken: string }).drawToken;
}

const json = async (res: Response) => (await res.json()) as Record<string, any>;
const one = (db: D1Binding, sql: string) => db.prepare(sql).first();
/** This network's server-side day count of `kind` (spend.ts), as the gate keys it. */
const networkCount = async (address: string, kind: SpendKind) => clientCount(await keyedHash(`client:${address}`, signingSecret()!), kind, Date.now());

async function paidBook(): Promise<number> {
  let sum = 0;
  for (let shard = 0; shard < 8; shard++) sum += Number((await dailyStore().get(`paidcost:${kstDay(Date.now())}:${shard}`)) ?? 0);
  return Math.round(sum);
}
const freeBook = async () => Math.round((await spentTodayKrw(Date.now())) ?? -1);

/** The mock provider, reporting EXPENSIVE as billed, like the real one does. */
function billing() {
  const real = mockProvider.generate.bind(mockProvider);
  return vi.spyOn(mockProvider, "generate").mockImplementation(async (task, attempt, feedback, hooks?: GenerationHooks) => {
    hooks?.onUsage?.(EXPENSIVE);
    return real(task, attempt, feedback, hooks);
  });
}

describe("premium previews", () => {
  it("opens the deep preview without login while sales are open, counted as a teaser, and closes it when they are not", async () => {
    useTestDb();
    const b = browser("192.0.2.40");
    const drawToken = await dealt(b, "deep-tarot");
    const res = await b.send(deepTeaser, "/api/premium/tarot-deep/teaser", { body: { drawToken, input: DEEP_INPUT } });
    expect(res.status).toBe(200);
    const { preview } = await json(res);
    expect(preview.cards).toHaveLength(10);
    expect(preview.lockedToc).toHaveLength(17);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("sl_q="))).toBe(true);
    expect(await networkCount("192.0.2.40", "teaser")).toBe(1);
    vi.stubEnv("STARLOG_PREMIUM", "off");
    expect((await b.send(deepTeaser, "/api/premium/tarot-deep/teaser", { body: { drawToken, input: DEEP_INPUT } })).status).toBe(409);
  });

  it("stays open, once sales close, for a buyer of that very product", async () => {
    useTestDb();
    const b = await shopper();
    await buy(b, "tarot-deep");
    vi.stubEnv("STARLOG_PREMIUM", "off");
    const deep = { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT };
    expect((await b.send(deepTeaser, "/t", { body: deep })).status).toBe(200);
    expect((await browser("192.0.2.47").send(deepTeaser, "/t", { body: deep })).status).toBe(409);
    const pair = { me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: PARTNER }, relation: "friend", drawToken: await dealt(b, "match"), ack: true };
    expect((await b.send(matchTeaser, "/t", { body: pair })).status).toBe(409);
  });

  it("previews the pair: both charts and the five cards; a partner birth the chart cannot take names its field", async () => {
    useTestDb();
    const b = browser("192.0.2.45");
    const body = { me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: PARTNER }, relation: "friend", drawToken: await dealt(b, "match"), ack: true };
    const res = await b.send(matchTeaser, "/t", { body });
    expect(res.status).toBe(200);
    const { preview } = await json(res);
    expect(preview.cards).toHaveLength(5);
    expect(Object.keys(preview.charts)).toEqual(["me", "partner"]);
    const future = await b.send(matchTeaser, "/t", { body: { ...body, partner: { birth: { ...PARTNER, year: 2030 } } } });
    expect(future.status).toBe(400);
    expect(await json(future)).toMatchObject({ code: "BAD_REQUEST", field: "partner.date" });
  });

  it("refuses a draw of another spread, the one-card daily topic and a typed topic without its who", async () => {
    useTestDb();
    const b = browser("192.0.2.46");
    const deep = await dealt(b, "deep-tarot");
    const pair = await dealt(b, "match");
    const codeOf = async (handler: typeof deepTeaser, body: unknown) => (await json(await b.send(handler, "/t", { body }))).code;
    expect(await codeOf(deepTeaser, { drawToken: pair, input: DEEP_INPUT })).toBe("BAD_TOKEN");
    expect(await codeOf(matchTeaser, { me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: PARTNER }, relation: "friend", drawToken: deep, ack: true })).toBe("BAD_TOKEN");
    expect(await codeOf(deepTeaser, { drawToken: deep, input: { ...DEEP_INPUT, topicId: "daily" } })).toBe("BAD_REQUEST");
    expect(await codeOf(deepTeaser, { drawToken: deep, input: { topicId: "custom", topicText: "이사", question: "", conditions: [] } })).toBe("BAD_REQUEST");
  });

  it("keeps 2027 신년운세 closed before 2026-11-15 for everyone but the owner", async () => {
    useTestDb();
    vi.setSystemTime(Date.parse("2026-11-01T03:00:00Z"));
    const b = browser("192.0.2.41");
    expect((await b.send(yearTeaser, "/api/premium/newyear-2027/teaser", { body: { birth: DEFAULT_SAJU_FORM } })).status).toBe(409);
    await b.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" } });
    expect((await b.send(yearTeaser, "/api/premium/newyear-2027/teaser", { body: { birth: DEFAULT_SAJU_FORM } })).status).toBe(200);
  });
});

describe("paid premium readings", () => {
  it("asks for login, then for a purchase of this very product; the signup gift never opens one", async () => {
    useTestDb();
    const guest = browser("192.0.2.42");
    const token = await dealt(guest, "deep-tarot");
    expect((await guest.send(deepReading, "/r", { body: { drawToken: token, input: DEEP_INPUT, unlock: { method: "paid" } } })).status).toBe(401);
    const b = await shopper();
    await buy(b, "tarot"); // a standard purchase never opens premium
    const res = await b.send(deepReading, "/r", { body: { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } } });
    expect(res.status).toBe(402);
    expect(await json(res)).toMatchObject({ code: "NO_CREDIT" });
    expect((await b.send(deepReading, "/r", { body: { drawToken: token, input: DEEP_INPUT, unlock: { method: "free" } } })).status).toBe(400);
  });

  it("writes the deep reading in two requests, saves it once with a 30-day chapter, and spends once", async () => {
    const db = useTestDb();
    const b = await shopper();
    await buy(b, "tarot-deep");
    const body = { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } };
    const first = await json(await b.send(deepReading, "/r", { body }));
    expect(first).toMatchObject({ status: "continue", done: 1, of: 2 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
    const last = await json(await b.send(deepReading, "/r", { body: { ...body, resume: first.resume } }));
    expect(last).toMatchObject({ status: "done" });
    expect(last.readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(last.reading.positions).toHaveLength(10);
    const saved = await listReadings(db, accountSecret()!, (await db.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>())!.id);
    expect(saved.readings[0]?.chapter).toMatchObject({ kind: "tarot-deep", followUpsLeft: 5 });
    expect((await me(b)).user?.unused).toEqual([]);
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks WHERE status = 'delivered'")).toEqual({ n: 1 });
    const chapter = await openChapter(last.chapterToken, last.reading, signingSecret()!, Date.now());
    expect(chapter?.ctx).toMatchObject({ kind: "tarot-deep", input: { topicId: "money", note: DEEP_INPUT.note } });
    expect(chapter && isPremiumChapter(chapter.ctx)).toBe(true);
    expect(chapter?.exp).toBe(T0 + PREMIUM_CHAPTER_TTL_MS);
  });

  it("keeps one reservation across the parts, extended part by part past its first six minutes", async () => {
    const db = useTestDb();
    const b = await shopper();
    await buy(b, "newyear-2027");
    const body = { birth: DEFAULT_SAJU_FORM, unlock: { method: "paid" } };
    const first = await json(await b.send(yearReading, "/r", { body }));
    vi.setSystemTime(T0 + 5 * 60_000);
    const second = await json(await b.send(yearReading, "/r", { body: { ...body, resume: first.resume } }));
    expect(second).toMatchObject({ status: "continue", done: 2, of: 3 });
    vi.setSystemTime(T0 + 10 * 60_000); // the first reservation alone would have lapsed by now
    const last = await json(await b.send(yearReading, "/r", { body: { ...body, resume: second.resume } }));
    expect(last).toMatchObject({ status: "done" });
    expect(await one(db, "SELECT COUNT(*) AS n, MAX(status) AS status FROM unlocks")).toEqual({ n: 1, status: "delivered" });
  });

  it("gives the credit back when a part fails, then reserves again and resumes without rewriting the parts already written", async () => {
    const db = useTestDb();
    const b = await shopper();
    await buy(b, "newyear-2027");
    const body = { birth: DEFAULT_SAJU_FORM, workStatus: "employee", unlock: { method: "paid" } };
    const first = await json(await b.send(yearReading, "/r", { body }));
    expect(first).toMatchObject({ status: "continue", done: 1, of: 3 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.spyOn(mockProvider, "generate").mockRejectedValueOnce(new GenerationError("UPSTREAM"));
    expect((await b.send(yearReading, "/r", { body: { ...body, resume: first.resume } })).status).toBe(502);
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks WHERE status = 'reserved'")).toEqual({ n: 0 });
    failing.mockRestore();
    const calls = vi.spyOn(mockProvider, "generate");
    const second = await json(await b.send(yearReading, "/r", { body: { ...body, resume: first.resume } }));
    expect(second).toMatchObject({ status: "continue", done: 2 });
    expect(calls).toHaveBeenCalledTimes(1); // part B only; part A came from the token
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks WHERE status = 'reserved'")).toEqual({ n: 1 });
    const last = await json(await b.send(yearReading, "/r", { body: { ...body, resume: second.resume } }));
    expect(last.reading.months).toHaveLength(12);
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks WHERE status = 'released'")).toEqual({ n: 1 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks WHERE status = 'delivered'")).toEqual({ n: 1 });
  });

  it("refuses a resume token sent with another input, by another account, or altered", async () => {
    useTestDb();
    const b = await shopper();
    await buy(b, "tarot-deep");
    const body = { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } };
    const first = await json(await b.send(deepReading, "/r", { body }));
    const other = { ...body, input: { ...DEEP_INPUT, note: "다른 메모" }, resume: first.resume };
    expect(await json(await b.send(deepReading, "/r", { body: other }))).toMatchObject({ code: "BAD_TOKEN" });
    expect(await json(await b.send(deepReading, "/r", { body: { ...body, resume: `${first.resume}x` } }))).toMatchObject({ code: "BAD_TOKEN" });
    const c = await shopper();
    await buy(c, "tarot-deep");
    const stolen = await c.send(deepReading, "/r", { body: { ...body, resume: first.resume } });
    expect(stolen.status).toBe(400);
    expect(await json(stolen)).toMatchObject({ code: "BAD_TOKEN" });
  });

  it("checks every user-written field for crisis words before anything is generated", async () => {
    useTestDb();
    const b = await shopper();
    await buy(b, "match");
    const spy = vi.spyOn(mockProvider, "generate");
    const pair = { me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: PARTNER }, relation: "friend", drawToken: await dealt(b, "match"), ack: true };
    const labelled = { ...pair, partner: { birth: PARTNER, label: "죽고 싶어" }, unlock: { method: "paid" } };
    expect((await b.send(matchReading, "/r", { body: labelled })).status).toBe(422);
    expect((await b.send(matchTeaser, "/t", { body: { ...pair, concern: "요즘 사라지고 싶어요" } })).status).toBe(422);
    const deep = { drawToken: await dealt(b, "deep-tarot"), input: { ...DEEP_INPUT, note: "자해하고 싶은 마음이 들어요" } };
    expect((await b.send(deepTeaser, "/t", { body: deep })).status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  it("streams: the done event carries the continue status and the token", async () => {
    useTestDb();
    const b = await shopper();
    await buy(b, "match");
    const res = await b.send(matchReading, "/r", {
      accept: NDJSON,
      body: {
        me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: { ...DEFAULT_SAJU_FORM, year: 1992, month: 1, day: 26 } },
        relation: "spouse", drawToken: await dealt(b, "match"), ack: true, unlock: { method: "paid" },
      },
    });
    const events = (await res.text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string; data?: Record<string, unknown> });
    const done = events.find((e) => e.type === "done");
    expect(done?.data).toMatchObject({ status: "continue", done: 1, of: 2 });
    expect(typeof done?.data?.resume).toBe("string");
    expect(events.some((e) => e.type === "section")).toBe(true);
  });

  it("runs a paid part with the free budget spent, and puts its model cost in the paid book", async () => {
    useTestDb();
    const b = await shopper();
    await buy(b, "tarot-deep");
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0");
    billing();
    const first = await json(await b.send(deepReading, "/r", { body: { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } } }));
    expect(first).toMatchObject({ status: "continue" });
    expect(await paidBook()).toBe(2800);
    expect(await freeBook()).toBe(0);
  });

  it("lets the owner open without paying, saved to the account when logged in", async () => {
    const db = useTestDb();
    const b = await shopper();
    await b.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" } });
    const body = { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "owner" } };
    const first = await json(await b.send(deepReading, "/r", { body }));
    const last = await json(await b.send(deepReading, "/r", { body: { ...body, resume: first.resume } }));
    expect(last.status).toBe("done");
    expect(await db.prepare("SELECT source FROM readings").first()).toEqual({ source: "owner" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM unlocks").first()).toEqual({ n: 0 });
  });
});

describe("a premium purchase on a production deploy's test keys (security M2)", () => {
  it("counts each part as a free full reading; a network cap between parts stops it before extending, and the same token resumes later", async () => {
    vi.stubEnv("STARLOG_SIGNING_SECRET", "signing-secret-for-premium-tests-0123456789");
    vi.stubEnv("STARLOG_ACCOUNT_SECRET", "account-secret-for-premium-tests-0123456789");
    const db = useTestDb();
    const address = "198.51.100.200";
    const b = browser(address);
    await loginAs(b, "tester");
    const orderId = await buy(b, "tarot-deep");
    await db.prepare("UPDATE payments SET mode = 'test' WHERE order_id = ?").bind(orderId).run();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_PAY", "");
    vi.stubEnv("NEXT_PUBLIC_TOSS_CLIENT_KEY", "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm");
    vi.stubEnv("TOSS_SECRET_KEY", "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6");
    b.jar.set("__Host-sl_sid", b.jar.get("sl_sid")!);
    vi.stubEnv("BETA_IP_FULL_PER_DAY", "1");
    const body = { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } };
    const first = await json(await b.send(deepReading, "/r", { body }));
    expect(first).toMatchObject({ status: "continue", done: 1, of: 2 });
    expect(await networkCount(address, "full")).toBe(1);
    vi.setSystemTime(T0 + 60_000);
    const capped = await b.send(deepReading, "/r", { body: { ...body, resume: first.resume } });
    expect(capped.status).toBe(429);
    expect(await json(capped)).toMatchObject({ code: "BETA_LIMIT", scope: "network" });
    expect(await one(db, "SELECT status, reserved_until FROM unlocks")).toEqual({ status: "reserved", reserved_until: T0 + RESERVATION_MS });
    vi.stubEnv("BETA_IP_FULL_PER_DAY", "2");
    vi.setSystemTime(T0 + RESERVATION_MS + 60_000); // the lapsed reservation is swept back first
    const last = await json(await b.send(deepReading, "/r", { body: { ...body, resume: first.resume } }));
    expect(last).toMatchObject({ status: "done" });
    expect(last.readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(await networkCount(address, "full")).toBe(2);
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks WHERE status = 'released'")).toEqual({ n: 1 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks WHERE status = 'delivered'")).toEqual({ n: 1 });
  });
});
