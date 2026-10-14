import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as reviewLogin } from "@/app/api/auth/review/route";
import { mockProvider } from "@/lib/ai/mock";
import { resetDailyStore } from "@/lib/api/dailyStore";
import type { Gate } from "@/lib/api/http";
import { resetSpendState } from "@/lib/api/spend";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import { RESERVATION_MS, grantStatements, releaseUnlock, reserveUnlock } from "@/lib/pay/ledger";
import { mockToss } from "@/lib/pay/tossMock";
import { premiumChapter } from "@/lib/readings/chapters";
import { listReadings } from "@/lib/readings/store";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { browser, buy, loginAs, useTestDb, type Browser } from "@/lib/testing/p4";
import { sealResume } from "./resume";
import { holdsUnused, planPremiumUnlock, premiumSettlement, type PremiumPlan } from "./unlock";

const SECRET = "account-secret-for-tests-0123456789abcdef";
const NOW = Date.parse("2026-10-20T03:00:00Z");

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const one = (db: D1Binding, sql: string) => db.prepare(sql).first();

async function setup() {
  const db = migratedTestD1();
  await db.prepare("INSERT INTO users (id, kakao_key, nickname, customer_key, created_at, last_login_at) VALUES ('u_1', 'k_1', '별', 'c_1', 0, 0)").run();
  await db.batch(grantStatements(db, { id: "lot_ny", userId: "u_1", currency: "paid", source: "admin", orderId: null, productId: "newyear-2027", units: 1, expiresAt: null }, NOW));
  const r = await reserveUnlock(db, { userId: "u_1", productId: "newyear-2027", currency: "paid", now: NOW, payMode: "live", earmarked: true });
  if (!r.ok) throw new Error("not reserved");
  const plan: PremiumPlan = {
    product: "newyear-2027", method: "paid", subject: "u_1", spend: undefined, paidCost: true, unlockId: r.unlockId,
    save: { db, accountSecret: SECRET, userId: "u_1", source: "paid" }, resume: null,
  };
  return { db, plan };
}

const chapterOf = (body: Record<string, unknown>) =>
  premiumChapter("newyear-2027", { title: "차근차근 쌓아 가는 해" }, body as { reading: unknown; chapterToken: string }, NOW);

const DONE = { body: { status: "done", reading: { title: "t" }, chapterToken: "c" }, cookies: [] };

describe("premium settlement", () => {
  it("keeps the reservation alive between parts and saves nothing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW + 300_000);
    const { db, plan } = await setup();
    const settle = premiumSettlement(plan, chapterOf, NOW)!;
    expect(await settle.deliver({ body: { status: "continue", resume: "t", done: 1, of: 3 }, cookies: [] })).toEqual({});
    expect(await one(db, "SELECT reserved_until FROM unlocks")).toEqual({ reserved_until: NOW + 300_000 + RESERVATION_MS });
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
  });

  it("saves the finished reading and spends the reservation in one batch", async () => {
    const { db, plan } = await setup();
    const settle = premiumSettlement(plan, chapterOf, NOW)!;
    const batches = vi.spyOn(db, "batch");
    const extra = await settle.deliver(DONE);
    expect(batches).toHaveBeenCalledTimes(1);
    expect(extra.readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(await one(db, "SELECT status FROM unlocks")).toEqual({ status: "delivered" });
    const { readings: [saved] } = await listReadings(db, SECRET, "u_1");
    expect(saved?.id).toBe(extra.readingId);
    expect(saved?.chapter).toMatchObject({ kind: "newyear-2027", title: "차근차근 쌓아 가는 해", followUpsLeft: 5, chapterToken: "c" });
  });

  it("releases on failure, once", async () => {
    const { db, plan } = await setup();
    const settle = premiumSettlement(plan, chapterOf, NOW)!;
    await settle.release();
    await settle.release();
    expect(await one(db, "SELECT status FROM unlocks")).toEqual({ status: "released" });
    expect(await one(db, "SELECT units_left FROM credit_lots WHERE id = 'lot_ny'")).toEqual({ units_left: 1 });
  });

  it("gives the purchase back when the client left after the model began answering, to reopen right away, no longer refundable", async () => {
    const { db, plan } = await setup();
    const settle = premiumSettlement(plan, chapterOf, NOW)!;
    await settle.abandon!();
    await settle.abandon!();
    expect(await one(db, "SELECT status FROM unlocks")).toEqual({ status: "released" });
    expect(await one(db, "SELECT units_left FROM credit_lots WHERE id = 'lot_ny'")).toEqual({ units_left: 1 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'restore' AND idem_key LIKE 'restore-left:%'")).toEqual({ n: 1 });
  });

  it("has nothing to settle for an owner pass without an account", () => {
    const owner: PremiumPlan = { product: "match", method: "owner", subject: "owner", spend: "full", paidCost: false, unlockId: null, save: null, resume: null };
    expect(premiumSettlement(owner, chapterOf, NOW)).toBeUndefined();
  });

  it("finds the saved reading when the save landed but its answer was lost", async () => {
    const { db, plan } = await setup();
    const settle = premiumSettlement(plan, chapterOf, NOW)!;
    expect(await settle.recover()).toBeNull();
    const realBatch = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementation(async (statements) => {
      await realBatch(statements);
      throw new Error("D1 answer lost");
    });
    await expect(settle.deliver(DONE)).rejects.toThrow("D1 answer lost");
    const { readings: [saved] } = await listReadings(db, SECRET, "u_1");
    expect(await settle.recover()).toEqual({ readingId: saved!.id });
  });

  it("saves nothing and throws when the reservation was given back first (another request with the same token), so the purchase is never kept with a reading", async () => {
    const { db, plan } = await setup();
    await releaseUnlock(db, { unlockId: plan.unlockId!, now: NOW });
    await expect(premiumSettlement(plan, chapterOf, NOW)!.deliver(DONE)).rejects.toThrow();
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
    expect(await one(db, "SELECT units_left FROM credit_lots WHERE id = 'lot_ny'")).toEqual({ units_left: 1 });
  });

  it("saves one copy when two requests with the same token both finish: the later one throws", async () => {
    const { db, plan } = await setup();
    expect(await premiumSettlement(plan, chapterOf, NOW)!.deliver(DONE)).toHaveProperty("readingId");
    await expect(premiumSettlement(plan, chapterOf, NOW)!.deliver(DONE)).rejects.toThrow();
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 1 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'spend'")).toEqual({ n: 1 });
  });

  it("saves and spends nothing for a deleted account, and throws rather than hand the reading out", async () => {
    const { db, plan } = await setup();
    await db.prepare("UPDATE users SET deleted_at = 1 WHERE id = 'u_1'").run();
    await expect(premiumSettlement(plan, chapterOf, NOW)!.deliver(DONE)).rejects.toThrow();
    expect(await one(db, "SELECT COUNT(*) AS n FROM readings")).toEqual({ n: 0 });
    expect(await one(db, "SELECT COUNT(*) AS n FROM ledger WHERE kind = 'spend'")).toEqual({ n: 0 });
  });

  it("keeps a written part when extending its reservation fails (a D1 error): the next request reserves again", async () => {
    const { db, plan } = await setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const prepare = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation((sql: string) => {
      if (sql.startsWith("UPDATE unlocks SET reserved_until")) throw new Error("D1 unavailable");
      return prepare(sql);
    });
    expect(await premiumSettlement(plan, chapterOf, NOW)!.deliver({ body: { status: "continue", resume: "t", done: 1, of: 3 }, cookies: [] })).toEqual({});
  });
});

describe("planning a premium opening", () => {
  let ipSeq = 0;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    for (const [name, value] of Object.entries({ STARLOG_PAYMENTS: "on", STARLOG_PREMIUM: "on", STARLOG_KAKAO: "mock", STARLOG_PAY: "mock" })) vi.stubEnv(name, value);
    resetMemoryLimiter();
    resetDailyStore();
    resetSpendState();
    mockToss.reset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  async function member(): Promise<Browser> {
    const b = browser(`198.51.100.${++ipSeq}`);
    await loginAs(b, `member${ipSeq}`);
    return b;
  }

  const requestOf = (b: Browser) =>
    new Request("http://localhost/api/premium/tarot-deep/reading", { method: "POST", headers: { cookie: [...b.jar].map(([name, value]) => `${name}=${value}`).join("; ") } });
  const gate = (owner: boolean): Gate => ({ secret: signingSecret()!, provider: mockProvider, owner, now: Date.now(), cookies: {}, client: "client-hash" });
  const plan = (b: Browser, method: "paid" | "owner" = "paid", owner = false, resume?: string) =>
    planPremiumUnlock(requestOf(b), gate(owner), "tarot-deep", method, { resume, hash: "h" });
  const refusal = async (result: PremiumPlan | Response) => {
    if (!(result instanceof Response)) throw new Error("not refused");
    return { status: result.status, ...((await result.json()) as Record<string, unknown>) };
  };
  const userIdOf = async (db: D1Binding) => (await db.prepare("SELECT id FROM users").first<{ id: string }>())!.id;
  const adminLot = (db: D1Binding, userId: string, id: string, productId: string | null) =>
    db.batch(grantStatements(db, { id, userId, currency: "paid", source: "admin", orderId: null, productId, units: 1, expiresAt: null }, NOW));

  it("opens only with a purchase of this product; its model cost goes to the paid book, even with the free budget spent", async () => {
    const db = useTestDb();
    const b = await member();
    const userId = await userIdOf(db);
    await adminLot(db, userId, "lot_any", null); // a lot for any standard reading never opens a premium one
    expect(await refusal(await plan(b))).toMatchObject({ status: 402, code: "NO_CREDIT" });
    await buy(b, "tarot-deep");
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0");
    const opened = await plan(b);
    if (opened instanceof Response) throw new Error(`refused: ${opened.status}`);
    expect(opened).toMatchObject({ method: "paid", subject: userId, paidCost: true, resume: null, save: { userId, source: "paid" } });
    expect(opened.spend).toBeUndefined();
    expect(await one(db, "SELECT id, product_id, status FROM unlocks")).toEqual({ id: opened.unlockId, product_id: "tarot-deep", status: "reserved" });
  });

  it("holds a purchase paid on a production deploy's test keys to the free budget before reserving, and counts it like a free full reading", async () => {
    vi.stubEnv("STARLOG_SIGNING_SECRET", "signing-secret-for-unlock-tests-0123456789");
    vi.stubEnv("STARLOG_ACCOUNT_SECRET", "account-secret-for-unlock-tests-0123456789");
    const db = useTestDb();
    const b = await member();
    const orderId = await buy(b, "tarot-deep");
    await db.prepare("UPDATE payments SET mode = 'test' WHERE order_id = ?").bind(orderId).run();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_PAY", "");
    vi.stubEnv("NEXT_PUBLIC_TOSS_CLIENT_KEY", "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm");
    vi.stubEnv("TOSS_SECRET_KEY", "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6");
    b.jar.set("__Host-sl_sid", b.jar.get("sl_sid")!);
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0");
    expect(await refusal(await plan(b))).toMatchObject({ status: 503, reason: "budget" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks")).toEqual({ n: 0 });
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "30000");
    const opened = await plan(b);
    if (opened instanceof Response) throw new Error(`refused: ${opened.status}`);
    expect(opened).toMatchObject({ spend: "full", paidCost: false });
  });

  it("opens with the owner pass only, held to the day's budget, bound to 'owner' without a login", async () => {
    useTestDb();
    const guest = browser("192.0.2.60");
    expect(await refusal(await plan(guest, "owner"))).toMatchObject({ status: 403, code: "FORBIDDEN" });
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0");
    expect(await refusal(await plan(guest, "owner", true))).toMatchObject({ status: 503, reason: "budget" });
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "30000");
    expect(await plan(guest, "owner", true)).toMatchObject({ method: "owner", subject: "owner", paidCost: false, unlockId: null, save: null, resume: null });
  });

  it("opens nothing for a review account whose credentials are gone (security M1)", async () => {
    vi.stubEnv("REVIEW_LOGIN_ID", "card-review");
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", "correct-horse-battery-staple-77");
    const db = useTestDb();
    const b = browser("198.51.100.90");
    const signedIn = await b.send(reviewLogin, "/api/auth/review", { body: { id: "card-review", password: "correct-horse-battery-staple-77" }, origin: true });
    expect(signedIn.status).toBe(200);
    await adminLot(db, await userIdOf(db), "lot_deep", "tarot-deep");
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", "");
    expect(await refusal(await plan(b))).toMatchObject({ status: 409, code: "NOT_AVAILABLE" });
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks")).toEqual({ n: 0 });
  });

  it("refuses a resume token whose parts this deploy cannot continue (all written, or of another shape) before holding anything", async () => {
    const db = useTestDb();
    const b = await member();
    const userId = await userIdOf(db);
    await buy(b, "tarot-deep");
    for (const parts of [[{}, {}], [{ verdict: "다른 배포의 파트" }]]) {
      const token = await sealResume({ product: "tarot-deep", subject: userId, inputHash: "h", unlockId: null, parts }, signingSecret()!, NOW);
      expect(await refusal(await plan(b, "paid", false, token))).toMatchObject({ status: 400, code: "BAD_TOKEN", token: "resume" });
    }
    expect(await one(db, "SELECT COUNT(*) AS n FROM unlocks")).toEqual({ n: 0 });
  });

  it("holdsUnused: true only for a member holding an unopened purchase of that product", async () => {
    useTestDb();
    const b = await member();
    expect(await holdsUnused(requestOf(browser("192.0.2.70")), NOW, "tarot-deep")).toBe(false);
    expect(await holdsUnused(requestOf(b), NOW, "tarot-deep")).toBe(false);
    await buy(b, "tarot-deep");
    expect(await holdsUnused(requestOf(b), NOW, "tarot-deep")).toBe(true);
    expect(await holdsUnused(requestOf(b), NOW, "match")).toBe(false);
  });
});
