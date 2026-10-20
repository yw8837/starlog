import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError, type GenerationHooks } from "@/lib/ai/provider";
import { accountSecret } from "@/lib/account/secrets";
import { dailyStore, resetDailyStore } from "@/lib/api/dailyStore";
import { addNetworkCost, clientCount, networkCostKrw, resetSpendState, spentTodayKrw, type SpendKind } from "@/lib/api/spend";
import { NDJSON } from "@/lib/api/stream";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { RESERVATION_MS } from "@/lib/pay/ledger";
import { mockToss } from "@/lib/pay/tossMock";
import { PREMIUM_CHAPTER_TTL_MS } from "@/lib/premium/products";
import { listReadings } from "@/lib/readings/store";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { isPremiumChapter, issueChapter, openChapter } from "@/lib/security/chapterToken";
import { kstDay } from "@/lib/security/quota";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { keyedHash, signingSecret } from "@/lib/security/sign";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as followup } from "../followup/route";
import { POST as ownerPost } from "../owner/route";
import { POST as draw } from "../tarot/draw/route";
import { POST as matchReading } from "./match/reading/route";
import { POST as matchTeaser } from "./match/teaser/route";
import { POST as yearReading } from "./newyear-2027/reading/route";
import { POST as yearTeaser } from "./newyear-2027/teaser/route";
import { POST as deepReading } from "./tarot-deep/reading/route";
import { POST as deepTeaser } from "./tarot-deep/teaser/route";

// A pass-through spy: which moment a 궁합 follow-up computes the pair's facts for.
const matchPrompts = vi.hoisted(() => ({ calls: [] as number[] }));
vi.mock("@/lib/ai/prompts/match", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ai/prompts/match")>();
  return { ...real, buildMatchFacts: (...args: Parameters<typeof real.buildMatchFacts>) => (matchPrompts.calls.push(args[3]), real.buildMatchFacts(...args)) };
});

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

/** The ten cards of 켈틱 크로스 10장 (the 궁합 reads none since 2026-10-17). */
async function dealt(b: Browser, templateId: "deep-tarot"): Promise<string> {
  return ((await (await b.send(draw, "/api/tarot/draw", { body: { templateId, picks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] } })).json()) as { drawToken: string }).drawToken;
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

/** The next generation waits until `release()`; later ones run as usual (or as queued on `generate`). */
function heldGeneration() {
  const real = mockProvider.generate.bind(mockProvider);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const generate = vi.spyOn(mockProvider, "generate").mockImplementationOnce(async (task, attempt, feedback, hooks?: GenerationHooks) => {
    await held;
    return real(task, attempt, feedback, hooks);
  });
  return { generate, release };
}

/** Writes every part with the owner pass (or a purchase) and answers the finished reading and the last token sent. */
async function finish(b: Browser, handler: typeof deepReading, body: Record<string, unknown>) {
  let token: string | undefined;
  let res = await json(await b.send(handler, "/r", { body }));
  while (res.status === "continue") {
    token = res.resume as string;
    res = await json(await b.send(handler, "/r", { body: { ...body, resume: token } }));
  }
  return { done: res, token: token! };
}

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
    const pair = { me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: PARTNER }, relation: "friend", ack: true };
    expect((await b.send(matchTeaser, "/t", { body: pair })).status).toBe(409);
  });

  it("previews the pair: both charts and no cards (saju only, owner 2026-10-17); a partner birth the chart cannot take names its field", async () => {
    useTestDb();
    const b = browser("192.0.2.45");
    const body = { me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: PARTNER }, relation: "friend", ack: true };
    const res = await b.send(matchTeaser, "/t", { body });
    expect(res.status).toBe(200);
    const { preview } = await json(res);
    expect(preview).not.toHaveProperty("cards");
    expect(preview.lockedToc).toHaveLength(13);
    expect(Object.keys(preview.charts)).toEqual(["me", "partner"]);
    const future = await b.send(matchTeaser, "/t", { body: { ...body, partner: { birth: { ...PARTNER, year: 2030 } } } });
    expect(future.status).toBe(400);
    expect(await json(future)).toMatchObject({ code: "BAD_REQUEST", field: "partner.date" });
  });

  it("refuses a draw of another spread, the one-card daily topic and a typed topic without its who; a 궁합 takes no draw at all", async () => {
    useTestDb();
    const b = browser("192.0.2.46");
    const deep = await dealt(b, "deep-tarot");
    const standard = ((await (await b.send(draw, "/api/tarot/draw", { body: { templateId: "relationship", picks: [0, 1, 2] } })).json()) as { drawToken: string }).drawToken;
    const answer = async (handler: typeof deepTeaser, body: unknown) => json(await b.send(handler, "/t", { body }));
    // `token: "draw"`: deal the cards again (a resume token that fails says `token: "resume"`)
    expect(await answer(deepTeaser, { drawToken: standard, input: DEEP_INPUT })).toMatchObject({ code: "BAD_TOKEN", token: "draw" });
    // an older tab's draw token is dropped with the rest of what the 궁합 no longer reads
    expect((await b.send(matchTeaser, "/t", { body: { me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: PARTNER }, relation: "friend", drawToken: deep, ack: true } })).status).toBe(200);
    expect((await answer(deepTeaser, { drawToken: deep, input: { ...DEEP_INPUT, topicId: "daily" } })).code).toBe("BAD_REQUEST");
    expect((await answer(deepTeaser, { drawToken: deep, input: { topicId: "custom", topicText: "이사", question: "", conditions: [] } })).code).toBe("BAD_REQUEST");
  });

  it("keeps 2027 신년운세 closed before 2026-11-15 for everyone but the owner", async () => {
    useTestDb();
    vi.setSystemTime(Date.parse("2026-11-01T03:00:00Z"));
    const b = browser("192.0.2.41");
    expect((await b.send(yearTeaser, "/api/premium/newyear-2027/teaser", { body: { birth: DEFAULT_SAJU_FORM } })).status).toBe(409);
    await b.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" }, origin: true });
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
    expect(saved.readings[0]?.chapter).toMatchObject({ kind: "tarot-deep", followUpsLeft: 3 });
    expect((await me(b)).user?.unused).toEqual([]);
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks WHERE status = 'delivered'")).toEqual({ n: 1 });
    const chapter = await openChapter(last.chapterToken, last.reading, signingSecret()!, Date.now());
    expect(chapter?.ctx).toMatchObject({ kind: "tarot-deep", input: { topicId: "money", note: DEEP_INPUT.note } });
    expect(chapter && isPremiumChapter(chapter.ctx)).toBe(true);
    expect(chapter?.exp).toBe(T0 + PREMIUM_CHAPTER_TTL_MS);
  });

  it("keeps the card design the deep reading was written for in the account's copy, so a synced record shows the pictures it quotes", async () => {
    const db = useTestDb();
    const b = await shopper();
    await buy(b, "tarot-deep");
    const { done } = await finish(b, deepReading, { drawToken: await dealt(b, "deep-tarot"), input: { ...DEEP_INPUT, deck: "starlog" }, unlock: { method: "paid" } });
    expect(done.status).toBe("done");
    const saved = await listReadings(db, accountSecret()!, (await db.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>())!.id);
    expect(saved.readings[0]?.chapter).toMatchObject({ kind: "tarot-deep", deck: "starlog" });
  });

  it("writes the 궁합 from the two people's saju only (owner 2026-10-17): no cards or card design in the account's copy or its token", async () => {
    const db = useTestDb();
    const b = await shopper();
    await buy(b, "match");
    const pair = { me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: PARTNER }, relation: "friend", ack: true, deck: "starlog" };
    const { done } = await finish(b, matchReading, { ...pair, unlock: { method: "paid" } });
    expect(done.status).toBe("done");
    expect(done.reading.periods).toHaveLength(4);
    const saved = await listReadings(db, accountSecret()!, (await db.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>())!.id);
    expect(saved.readings[0]?.chapter).toMatchObject({ kind: "match", relation: "friend" });
    expect(saved.readings[0]?.chapter).not.toHaveProperty("cards");
    expect(saved.readings[0]?.chapter).not.toHaveProperty("deck");
    const ctx = (await openChapter(done.chapterToken, done.reading, signingSecret()!, Date.now()))?.ctx;
    expect(ctx).not.toHaveProperty("cards");
    expect(ctx).not.toHaveProperty("deck");
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
    expect(await json(await b.send(deepReading, "/r", { body: other }))).toMatchObject({ code: "BAD_TOKEN", token: "resume" });
    expect(await json(await b.send(deepReading, "/r", { body: { ...body, resume: `${first.resume}x` } }))).toMatchObject({ code: "BAD_TOKEN", token: "resume" });
    const c = await shopper();
    await buy(c, "tarot-deep");
    const stolen = await c.send(deepReading, "/r", { body: { ...body, resume: first.resume } });
    expect(stolen.status).toBe(400);
    expect(await json(stolen)).toMatchObject({ code: "BAD_TOKEN", token: "resume" });
  });

  it("asks to wait (409, reservedUntil), not to pay again, when starting over while the last attempt still holds the purchase", async () => {
    useTestDb();
    const b = await shopper();
    await buy(b, "tarot-deep");
    const body = { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } };
    expect(await json(await b.send(deepReading, "/r", { body }))).toMatchObject({ status: "continue", done: 1 });
    const over = await b.send(deepReading, "/r", { body }); // the resume token is gone (a BAD_TOKEN, a closed tab)
    expect(over.status).toBe(409);
    expect(await json(over)).toMatchObject({ code: "NOT_AVAILABLE", reason: "opening", reservedUntil: T0 + RESERVATION_MS });
    vi.setSystemTime(T0 + RESERVATION_MS + 1);
    expect(await json(await b.send(deepReading, "/r", { body }))).toMatchObject({ status: "continue", done: 1 });
  });

  it("answers the saved reading (409 opened), never a second spend, when the last part's token comes back after delivery", async () => {
    const db = useTestDb();
    const b = await shopper();
    await buy(b, "newyear-2027");
    await buy(b, "newyear-2027"); // a second purchase that a retry must not spend
    const body = { birth: DEFAULT_SAJU_FORM, unlock: { method: "paid" } };
    const { done, token } = await finish(b, yearReading, body);
    expect(done.readingId).toMatch(/^[a-z0-9]{20}$/);
    const again = await b.send(yearReading, "/r", { body: { ...body, resume: token } });
    expect(again.status).toBe(409);
    expect(await json(again)).toMatchObject({ code: "NOT_AVAILABLE", reason: "opened", readingId: done.readingId });
    expect((await me(b)).user?.unused).toHaveLength(1);
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 1 });
  });

  it("writes a part once when the same token comes twice at once: the twin waits (409 opening) with nothing generated, and one copy is saved and spent", async () => {
    const db = useTestDb();
    const b = await shopper();
    await buy(b, "tarot-deep");
    const body = { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } };
    const first = await json(await b.send(deepReading, "/r", { body }));
    const last = { body: { ...body, resume: first.resume } };
    const { generate, release } = heldGeneration();
    const slow = b.send(deepReading, "/r", last);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const twin = await b.send(deepReading, "/r", last);
    expect(twin.status).toBe(409);
    expect(await json(twin)).toMatchObject({ code: "NOT_AVAILABLE", reason: "opening" });
    expect(generate).toHaveBeenCalledTimes(1);
    release();
    expect(await json(await slow)).toMatchObject({ status: "done" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 1 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'spend'")).toEqual({ n: 1 });
    expect(await one(db, "SELECT units_left FROM credit_lots WHERE product_id = 'tarot-deep'")).toEqual({ units_left: 0 });
  });

  it("never spends a second purchase of the same product on a token's twin: it waits while the first still holds its part", async () => {
    const db = useTestDb();
    const b = await shopper();
    await buy(b, "tarot-deep");
    await buy(b, "tarot-deep");
    const body = { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } };
    const first = await json(await b.send(deepReading, "/r", { body }));
    const last = { body: { ...body, resume: first.resume } };
    const { generate, release } = heldGeneration();
    const slow = b.send(deepReading, "/r", last);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const twin = await b.send(deepReading, "/r", last);
    expect(twin.status).toBe(409);
    expect(await json(twin)).toMatchObject({ code: "NOT_AVAILABLE", reason: "opening" });
    expect(generate).toHaveBeenCalledTimes(1);
    release();
    expect(await json(await slow)).toMatchObject({ status: "done" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'spend'")).toEqual({ n: 1 });
    expect(await one(db, "SELECT SUM(units_left) AS n FROM credit_lots WHERE product_id = 'tarot-deep'")).toEqual({ n: 1 });
  });

  it("gives the purchase back when the client leaves a part after the model began answering: no longer refundable, and the same token writes that part again right away, once even when it comes twice at once", async () => {
    const db = useTestDb();
    const b = await shopper();
    const orderId = await buy(b, "tarot-deep");
    const body = { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } };
    const first = await json(await b.send(deepReading, "/r", { body }));
    const last = { body: { ...body, resume: first.resume } };
    vi.spyOn(mockProvider, "generate").mockImplementationOnce((_task, _attempt, _feedback, hooks) => new Promise((_, reject) => {
      hooks?.onReserve?.(EXPENSIVE);
      hooks?.signal?.addEventListener("abort", () => reject(new GenerationError("UPSTREAM", ["aborted"])));
    }));
    const controller = new AbortController();
    const res = await b.send(deepReading, "/r", { ...last, accept: NDJSON, signal: controller.signal });
    controller.abort();
    await res.text().catch(() => "");
    await vi.waitFor(async () => expect(await one(db, "SELECT status FROM unlocks")).toEqual({ status: "released" }));
    vi.mocked(mockProvider.generate).mockRestore();
    expect((await me(b)).user?.unused).toEqual([{ orderId, productId: "tarot-deep", refundable: false }]);

    const { generate, release } = heldGeneration();
    const slow = b.send(deepReading, "/r", last);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const twin = await b.send(deepReading, "/r", last);
    expect(twin.status).toBe(409);
    expect(await json(twin)).toMatchObject({ code: "NOT_AVAILABLE", reason: "opening" });
    expect(generate).toHaveBeenCalledTimes(1);
    release();
    expect(await json(await slow)).toMatchObject({ status: "done" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks WHERE status = 'released'")).toEqual({ n: 1 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks WHERE status = 'delivered'")).toEqual({ n: 1 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 1 });
  });

  it("never opens a deep reading with a purchase of another premium product", async () => {
    useTestDb();
    const b = await shopper();
    await buy(b, "match");
    const res = await b.send(deepReading, "/r", { body: { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } } });
    expect(res.status).toBe(402);
    expect(await json(res)).toMatchObject({ code: "NO_CREDIT" });
  });

  it("checks every user-written field for crisis words before anything is generated", async () => {
    useTestDb();
    const b = await shopper();
    await buy(b, "match");
    const spy = vi.spyOn(mockProvider, "generate");
    const pair = { me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: PARTNER }, relation: "friend", ack: true };
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
        relation: "spouse", ack: true, unlock: { method: "paid" },
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
    await b.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" }, origin: true });
    const body = { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "owner" } };
    const first = await json(await b.send(deepReading, "/r", { body }));
    const last = await json(await b.send(deepReading, "/r", { body: { ...body, resume: first.resume } }));
    expect(last.status).toBe("done");
    expect(await db.prepare("SELECT source FROM readings").first()).toEqual({ source: "owner" });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM unlocks").first()).toEqual({ n: 0 });
  });

  it("lets the owner open without login: the reading comes back unsaved, with no reading id", async () => {
    const db = useTestDb();
    const b = browser("192.0.2.49");
    await b.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" }, origin: true });
    const { done } = await finish(b, deepReading, { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "owner" } });
    expect(done).toMatchObject({ status: "done" });
    expect(done.reading.positions).toHaveLength(10);
    expect(done).not.toHaveProperty("readingId");
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks")).toEqual({ n: 0 });
  });

  it("answers a follow-up on every premium kind with its own task, and still for 30 days", async () => {
    useTestDb();
    const b = browser("192.0.2.48");
    await b.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" }, origin: true });
    const finished = [
      await finish(b, deepReading, { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "owner" } }),
      await finish(b, matchReading, { me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: PARTNER, label: "민지" }, relation: "friend", ack: true, unlock: { method: "owner" } }),
      await finish(b, yearReading, { birth: DEFAULT_SAJU_FORM, unlock: { method: "owner" } }),
    ];
    const spy = vi.spyOn(mockProvider, "generate");
    vi.setSystemTime(T0 + 20 * 24 * 3_600_000); // past the standard 7 days, inside the premium 30
    for (const { done } of finished) {
      const res = await b.send(followup, "/api/followup", { body: { chapterToken: done.chapterToken, reading: done.reading, question: "이번 주에 무엇부터 하면 좋을까요?" } });
      expect(res.status).toBe(200);
      const answer = await json(res);
      expect(answer.answer.length).toBeGreaterThanOrEqual(150);
      expect(answer.remaining).toBe(2);
      const opened = await openChapter(answer.chapterToken, done.reading, signingSecret()!, Date.now());
      expect(opened?.turns).toHaveLength(1);
    }
    expect(spy.mock.calls.map(([task]) => task.name)).toEqual(["premium-followup", "premium-followup", "premium-followup"]);
    vi.setSystemTime(T0 + PREMIUM_CHAPTER_TTL_MS + 60_000);
    const late = await b.send(followup, "/api/followup", { body: { chapterToken: finished[2]!.done.chapterToken, reading: finished[2]!.done.reading, question: "3월에는 무엇을 하면 좋을까요?" } });
    expect(late.status).toBe(400);
  });
});

describe("premium follow-ups (P5 spec §6.3)", () => {
  it("answers three per paid reading (owner 2026-10-17) outside the beta day quota, saved to the account, then stops", async () => {
    const db = useTestDb();
    vi.stubEnv("BETA_FOLLOWUPS_PER_DAY", "1");
    const b = await shopper();
    await buy(b, "tarot-deep");
    const { done } = await finish(b, deepReading, { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } });
    expect(done.readingId).toMatch(/^[a-z0-9]{20}$/);
    let token = done.chapterToken as string;
    for (let i = 0; i < 3; i++) {
      const res = await b.send(followup, "/api/followup", { body: { chapterToken: token, reading: done.reading, question: `${i + 1}번째로 궁금한 건 이번 달 지출이에요`, readingId: done.readingId } });
      expect(res.status).toBe(200);
      const answer = await json(res);
      expect(answer.remaining).toBe(2 - i);
      token = answer.chapterToken;
    }
    const fourth = await b.send(followup, "/api/followup", { body: { chapterToken: token, reading: done.reading, question: "넷째로 궁금한 게 있어요" } });
    expect(fourth.status).toBe(429);
    expect(await json(fourth)).toMatchObject({ code: "BETA_LIMIT", scope: "chapter" });
    const saved = await listReadings(db, accountSecret()!, (await db.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>())!.id);
    expect(saved.readings[0]?.chapter).toMatchObject({ kind: "tarot-deep", followUpsLeft: 0 });
  });

  it("keeps the chapter's count for as long as its token lives: the first token sent again after the standard 8 days still finds all three used", async () => {
    useTestDb();
    const b = await shopper();
    await buy(b, "tarot-deep");
    const { done } = await finish(b, deepReading, { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } });
    let token = done.chapterToken as string;
    for (let i = 0; i < 3; i++) {
      const res = await b.send(followup, "/api/followup", { body: { chapterToken: token, reading: done.reading, question: `${i + 1}번째로 궁금한 건 이번 달 지출이에요` } });
      expect(res.status).toBe(200);
      token = (await json(res)).chapterToken;
    }
    vi.setSystemTime(T0 + 9 * 24 * 3_600_000); // past the standard chapters' 8-day count, inside the premium 30 days
    const replay = await b.send(followup, "/api/followup", { body: { chapterToken: done.chapterToken, reading: done.reading, question: "처음 받은 토큰으로 다시 물어봐요" } });
    expect(replay.status).toBe(429);
    expect(await json(replay)).toMatchObject({ code: "BETA_LIMIT", scope: "chapter" });
  });

  it("books a paid follow-up's model cost in the paid book only: never the free total, never the network's free share", async () => {
    useTestDb();
    const address = "198.51.100.230";
    const b = browser(address);
    await loginAs(b, "payer");
    await buy(b, "tarot-deep");
    const { done } = await finish(b, deepReading, { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } });
    const before = await paidBook();
    billing();
    const res = await b.send(followup, "/api/followup", { body: { chapterToken: done.chapterToken, reading: done.reading, question: "이번 달 지출은 어떻게 줄이면 좋을까요?" } });
    expect(res.status).toBe(200);
    expect((await paidBook()) - before).toBe(2800);
    expect(await freeBook()).toBe(0);
    expect(await networkCostKrw(await keyedHash(`client:${address}`, signingSecret()!), Date.now())).toBe(0);
  });

  it("answers a paid follow-up on a day whose free budget is spent, like the paid reading itself", async () => {
    useTestDb();
    const b = await shopper();
    await buy(b, "tarot-deep");
    const { done } = await finish(b, deepReading, { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } });
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0");
    const res = await b.send(followup, "/api/followup", { body: { chapterToken: done.chapterToken, reading: done.reading, question: "이번 달 지출은 어떻게 줄이면 좋을까요?" } });
    expect(res.status).toBe(200);
  });

  it("answers a 궁합 follow-up from the pair's facts as of the reading, not as of the question", async () => {
    useTestDb();
    const b = browser("192.0.2.63");
    await b.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" }, origin: true });
    const { done } = await finish(b, matchReading, { me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: PARTNER }, relation: "friend", ack: true, unlock: { method: "owner" } });
    vi.setSystemTime(T0 + 20 * 24 * 3_600_000);
    matchPrompts.calls.length = 0;
    const res = await b.send(followup, "/api/followup", { body: { chapterToken: done.chapterToken, reading: done.reading, question: "요즘 서로 연락이 뜸한데 어떻게 할까요?" } });
    expect(res.status).toBe(200);
    expect(matchPrompts.calls).toEqual([T0]);
  });

  it("refuses a premium chapter whose reading was changed, generating nothing", async () => {
    useTestDb();
    const b = browser("192.0.2.47");
    await b.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" }, origin: true });
    const { done } = await finish(b, yearReading, { birth: DEFAULT_SAJU_FORM, unlock: { method: "owner" } });
    const spy = vi.spyOn(mockProvider, "generate");
    const res = await b.send(followup, "/api/followup", { body: { chapterToken: done.chapterToken, reading: { ...done.reading, title: "다른 제목" }, question: "3월에는요?" } });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "BAD_TOKEN" });
    expect(spy).not.toHaveBeenCalled();
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

describe("who paid for a premium chapter is signed in its token (follow-up books)", () => {
  const SECRETS = { STARLOG_SIGNING_SECRET: "signing-secret-for-premium-tests-0123456789", STARLOG_ACCOUNT_SECRET: "account-secret-for-premium-tests-0123456789" };
  /** This deploy moves to production on Toss test keys (a test payment charges nobody). */
  function productionTestKeys(b: Browser) {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_PAY", "");
    vi.stubEnv("NEXT_PUBLIC_TOSS_CLIENT_KEY", "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm");
    vi.stubEnv("TOSS_SECRET_KEY", "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6");
    const sid = b.jar.get("sl_sid");
    if (sid) b.jar.set("__Host-sl_sid", sid);
  }
  const ask = (b: Browser, done: Record<string, any>, question = "이번 달 지출은 어떻게 줄이면 좋을까요?") =>
    b.send(followup, "/api/followup", { body: { chapterToken: done.chapterToken, reading: done.reading, question } });

  it("keeps a purchase made on real keys in the paid book, even after the deploy moves to test keys", async () => {
    for (const [k, v] of Object.entries(SECRETS)) vi.stubEnv(k, v);
    useTestDb();
    const b = await shopper();
    await buy(b, "tarot-deep");
    const { done } = await finish(b, deepReading, { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } });
    expect((await openChapter(done.chapterToken, done.reading, signingSecret()!, Date.now()))?.ctx).toMatchObject({ kind: "tarot-deep", paid: true });
    productionTestKeys(b);
    const before = await paidBook();
    billing();
    expect((await ask(b, done)).status).toBe(200);
    expect((await paidBook()) - before).toBe(2800);
    expect(await freeBook()).toBe(0);
  });

  it("books the follow-ups of a reading the owner pass opened like free ones", async () => {
    useTestDb();
    const b = browser("192.0.2.61");
    await b.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" }, origin: true });
    const { done } = await finish(b, yearReading, { birth: DEFAULT_SAJU_FORM, unlock: { method: "owner" } });
    expect((await openChapter(done.chapterToken, done.reading, signingSecret()!, Date.now()))?.ctx).toMatchObject({ kind: "newyear-2027", paid: false });
    billing();
    expect((await ask(b, done, "3월에는 무엇을 하면 좋을까요?")).status).toBe(200);
    expect(await paidBook()).toBe(0);
    expect(await freeBook()).toBe(2800);
  });

  it("reads a token from before the rule (no `paid`) by the deploy's keys, as before", async () => {
    useTestDb();
    const b = browser("192.0.2.62");
    await b.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" }, origin: true });
    const { done } = await finish(b, yearReading, { birth: DEFAULT_SAJU_FORM, unlock: { method: "owner" } });
    const opened = (await openChapter(done.chapterToken, done.reading, signingSecret()!, Date.now()))!;
    const { paid: _paid, ...older } = opened.ctx as Extract<typeof opened.ctx, { kind: "newyear-2027" }>;
    const legacy = await issueChapter(older, done.reading, [], signingSecret()!, Date.now(), opened.exp);
    billing();
    expect((await ask(b, { ...done, chapterToken: legacy }, "3월에는 무엇을 하면 좋을까요?")).status).toBe(200);
    expect(await paidBook()).toBe(2800); // not production: real keys
    expect(await freeBook()).toBe(0);
  });

  it("treats a test payment's follow-ups as free-tier: the free book, the network's share, and its check", async () => {
    for (const [k, v] of Object.entries(SECRETS)) vi.stubEnv(k, v);
    const db = useTestDb();
    const address = "198.51.100.201";
    const b = browser(address);
    await loginAs(b, "tester2");
    const orderId = await buy(b, "tarot-deep");
    await db.prepare("UPDATE payments SET mode = 'test' WHERE order_id = ?").bind(orderId).run();
    productionTestKeys(b);
    vi.stubEnv("BETA_IP_FULL_PER_DAY", "5");
    const { done } = await finish(b, deepReading, { drawToken: await dealt(b, "deep-tarot"), input: DEEP_INPUT, unlock: { method: "paid" } });
    // The reading itself first: a refusal (its code and reason) shows here, not as an unsigned token below.
    expect(done).toMatchObject({ status: "done", chapterToken: expect.any(String) });
    expect((await openChapter(done.chapterToken, done.reading, signingSecret()!, Date.now()))?.ctx).toMatchObject({ paid: false });
    const client = await keyedHash(`client:${address}`, signingSecret()!);
    const free = await freeBook();
    billing();
    expect((await ask(b, done)).status).toBe(200);
    expect(await paidBook()).toBe(0);
    expect((await freeBook()) - free).toBe(2800);
    expect(await networkCostKrw(client, Date.now())).toBeGreaterThanOrEqual(2800);
    await addNetworkCost(client, 10_000, Date.now());
    const capped = await ask(b, done, "하나 더 궁금한 게 있어요");
    expect(capped.status).toBe(429);
    expect(await json(capped)).toMatchObject({ code: "BETA_LIMIT", scope: "network" });
  });
});
