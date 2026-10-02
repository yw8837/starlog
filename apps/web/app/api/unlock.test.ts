import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError, type GenerationHooks } from "@/lib/ai/provider";
import { accountSecret } from "@/lib/account/secrets";
import { dailyStore, resetDailyStore } from "@/lib/api/dailyStore";
import { clientCount, resetSpendState, spentTodayKrw } from "@/lib/api/spend";
import { NDJSON } from "@/lib/api/stream";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { mockToss } from "@/lib/pay/tossMock";
import { listReadings } from "@/lib/readings/store";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { kstDay } from "@/lib/security/quota";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { keyedHash, signingSecret } from "@/lib/security/sign";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as ownerPost } from "./owner/route";
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

describe("opening a full reading with credit", () => {
  it("ends the free 오픈 기념 reading once payments are on for everyone, before any generation", async () => {
    useTestDb();
    const spy = vi.spyOn(mockProvider, "generate");
    const res = await open(browser("192.0.2.10"));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "PAYMENT_REQUIRED" });
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

  it("opens with 별조각: saved and spent only then, no quota cookie, counted like a free reading", async () => {
    const db = useTestDb();
    const { b, ip } = await loggedIn();
    billing();
    const res = await open(b, "free");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { readingId: string; chapterToken: string };
    expect(body.readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("sl_q="))).toBe(false);
    expect((await me(b)).user?.stardust).toBe(0);
    const { readings } = await listReadings(db, accountSecret()!, await userId(db));
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({ id: body.readingId, chapter: { kind: "tarot", question: MONEY_INPUT.question, chapterToken: body.chapterToken, followUpsLeft: 3 } });
    expect((readings[0]!.chapter.cards as unknown[]).length).toBe(3);
    expect(await freeBook()).toBe(2800);
    expect(await paidBook()).toBe(0);
    expect(await clientCount(await keyedHash(`client:${ip}`, signingSecret()!), "full", Date.now())).toBe(1);
  });

  it("stops 별조각 when the free budget is spent, before reserving; a paid reading still opens, on the paid book", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0");
    const free = await open(b, "free");
    expect(free.status).toBe(503);
    expect(await free.json()).toMatchObject({ reason: "budget" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks")).toEqual({ n: 0 });
    expect((await me(b)).user?.stardust).toBe(10);
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
    expect((await me(b)).user?.stardust).toBe(10);
  });

  it("gives the credit back when the generation fails", async () => {
    const db = useTestDb();
    const { b } = await loggedIn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(mockProvider, "generate").mockRejectedValue(new GenerationError("UPSTREAM"));
    expect((await open(b, "free")).status).toBe(502);
    expect((await me(b)).user?.stardust).toBe(10);
    expect(await one(db, "SELECT status FROM unlocks")).toEqual({ status: "released" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
  });

  it("gives the credit back when the client leaves mid-stream", async () => {
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
    await vi.waitFor(async () => expect((await me(b)).user?.stardust).toBe(10));
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
    expect((await me(b)).user?.stardust).toBe(0);
  });

  it("lets the owner open free, saved to the account when logged in, with no ledger movement", async () => {
    const db = useTestDb();
    expect((await open(browser("192.0.2.12"), "owner")).status).toBe(403);
    const owner = browser("192.0.2.13");
    await owner.send(ownerPost, "/api/owner", { body: { code: "owner-code-for-tests-0001" } });
    await loginAs(owner, "owner");
    const res = await open(owner, "owner");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { readingId?: string }).readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(await one(db, "SELECT source FROM readings")).toEqual({ source: "owner" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind <> 'grant'")).toEqual({ n: 0 });
  });

  it("never traps credit: it can still be spent after payments are switched off", async () => {
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
