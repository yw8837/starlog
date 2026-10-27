import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError } from "@/lib/ai/provider";
import { OPENING_HOLD_MS } from "@/lib/account/openingClaim";
import { accountSecret, kakaoKey } from "@/lib/account/secrets";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { resetSpendState } from "@/lib/api/spend";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import { runMaintenance } from "@/lib/pay/maintenance";
import { mockToss } from "@/lib/pay/tossMock";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { browser, buy, loginAs, me, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as deleteIntent } from "./account/delete-intent/route";
import { GET as kakaoCallback } from "./auth/kakao/callback/route";
import { GET as kakaoStart } from "./auth/kakao/start/route";
import { POST as draw } from "./tarot/draw/route";
import { POST as reading } from "./tarot/reading/route";

/**
 * 오픈 기념 무료 per account (owner 2026-10-27 "계정 위주로 돌아가는 게 맞지 않니?", "이벤트 기간 11월 한 달로 해"): the free
 * tarot full reading opens only for a logged-in Kakao or Google account, once per account, and still once per device
 * (sl_first), until 2026-11-30 23:59 KST.
 */

/** 2026-10-28 12:00 KST: 오픈 기념 무료 on, before account sync (2026-10-31). */
const T0 = Date.parse("2026-10-28T12:00:00+09:00");
const INPUT = {
  topicId: "money", whoId: "me", whenId: "week",
  question: "이번 주, 나의 재물 흐름은 어떨까",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }],
  note: "카드값이 많이 나왔어요",
};

let ipSeq = 0;
const nextIp = () => `198.51.100.${++ipSeq}`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  vi.stubEnv("STARLOG_PAY", "mock");
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

async function device(name?: string): Promise<Browser> {
  const b = browser(nextIp());
  if (name) await loginAs(b, name);
  return b;
}

/** 오픈 기념 무료 (no `unlock`) for a fresh draw on this device. */
async function openFree(b: Browser): Promise<Response> {
  const { drawToken } = (await (await b.send(draw, "/api/tarot/draw", { body: { templateId: "self-flow", picks: [3, 30, 60] } })).json()) as { drawToken: string };
  return b.send(reading, "/api/tarot/reading", { body: { drawToken, input: INPUT } });
}

/** The whole deletion as 내 정보 drives it: the same Kakao account confirms at Kakao (mock). */
async function deleteAccount(b: Browser, name: string) {
  const { url } = (await (await b.send(deleteIntent, "/api/account/delete-intent", { method: "POST", origin: true })).json()) as { url: string };
  const started = await b.send(kakaoStart, `${url}&mockUser=${name}`);
  expect((await b.send(kakaoCallback, started.headers.get("location")!)).headers.get("location")).toBe("http://localhost/me?account=deleted");
}

const keyOf = async (name: string) => kakaoKey(`mock-${name}`, accountSecret()!);
const claims = (db: D1Binding) => db.prepare("SELECT user_key, claimed_at, opened FROM opening_claims ORDER BY claimed_at").all().then((r) => r.results);

describe("오픈 기념 무료 per account", () => {
  it("sends a visitor who is not logged in to log in: nothing is written and the device keeps its free reading", async () => {
    const db = useTestDb();
    const guest = await device();
    const generate = vi.spyOn(mockProvider, "generate");
    const res = await openFree(guest);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "LOGIN_REQUIRED", reason: "opening", message: "오픈 기념 무료는 로그인하고 받을 수 있어요. 카카오나 Google로 로그인하면 바로 열려요." });
    expect(generate).not.toHaveBeenCalled();
    expect(guest.jar.has("sl_first")).toBe(false);
    expect(await claims(db)).toEqual([]);
  });

  it("opens once for a logged-in account and records the claim as the account's key and the time, nothing else", async () => {
    const db = useTestDb();
    const web = await device("alice");
    const res = await openFree(web);
    expect(res.status).toBe(200);
    expect(web.jar.has("sl_first")).toBe(true);
    expect(await claims(db)).toEqual([{ user_key: await keyOf("alice"), claimed_at: T0, opened: 1 }]);
    expect((await db.prepare("SELECT name FROM pragma_table_info('opening_claims') ORDER BY cid").all()).results).toEqual([{ name: "user_key" }, { name: "claimed_at" }, { name: "opened" }]);
  });

  it("refuses the same account on another device, and another account on a device that already took it", async () => {
    useTestDb();
    const web = await device("alice");
    expect((await openFree(web)).status).toBe(200);

    const phone = await device("alice");
    const again = await openFree(phone);
    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({ code: "BETA_LIMIT", scope: "account", message: "이 계정으로는 오픈 기념 무료 풀이를 이미 받았어요." });
    expect(phone.jar.has("sl_first")).toBe(false);

    // bob logs in on alice's web browser: the device rule (sl_first) still holds.
    await loginAs(web, "bob");
    const switched = await openFree(web);
    expect(switched.status).toBe(429);
    expect(await switched.json()).toMatchObject({ code: "BETA_LIMIT", scope: "first", message: "이 기기에서는 오픈 기념 무료 풀이를 이미 받았어요." });
    // bob's own phone still has it.
    expect((await openFree(await device("bob"))).status).toBe(200);
  });

  it("opens one of two requests the same account sends at once from two devices", async () => {
    const db = useTestDb();
    const [web, phone] = [await device("alice"), await device("alice")];
    const answers = await Promise.all([openFree(web), openFree(phone)]);
    expect(answers.filter((r) => r.status === 200)).toHaveLength(1);
    // the other: being opened right now (busy) or, once that run is done, taken
    const refused = answers.find((r) => r.status !== 200)!;
    expect([409, 429]).toContain(refused.status);
    expect(await refused.json()).toMatchObject(refused.status === 409 ? { code: "NOT_AVAILABLE", reason: "opening-busy" } : { code: "BETA_LIMIT", scope: "account" });
    expect(await claims(db)).toEqual([{ user_key: await keyOf("alice"), claimed_at: T0, opened: 1 }]);
  });

  it("gives the claim back when the reading could not be written, so the account can open it again", async () => {
    const db = useTestDb();
    const b = await device("alice");
    vi.spyOn(mockProvider, "generate").mockRejectedValueOnce(new GenerationError("UPSTREAM"));
    expect((await openFree(b)).status).toBe(502);
    expect(await claims(db)).toEqual([]);
    expect(b.jar.has("sl_first")).toBe(false);
    expect((await openFree(b)).status).toBe(200);
    expect(await claims(db)).toEqual([{ user_key: await keyOf("alice"), claimed_at: T0, opened: 1 }]);
  });

  it("takes again a hold a run left behind (never settled) once OPENING_HOLD_MS passed, never an opened claim", async () => {
    const db = useTestDb();
    const b = await device("alice");
    await db.prepare("INSERT INTO opening_claims (user_key, claimed_at, opened) VALUES (?, ?, 0)").bind(await keyOf("alice"), T0 - OPENING_HOLD_MS + 1000).run();
    const busy = await openFree(b);
    expect(busy.status).toBe(409);
    expect(await busy.json()).toMatchObject({ code: "NOT_AVAILABLE", reason: "opening-busy" });
    vi.setSystemTime(T0 + 1000);
    expect((await openFree(b)).status).toBe(200);
    expect(await claims(db)).toEqual([{ user_key: await keyOf("alice"), claimed_at: T0 + 1000, opened: 1 }]);
  });

  it("runs until 2026-11-30 23:59 KST and is off from 2026-12-01 00:00 KST", async () => {
    useTestDb();
    vi.setSystemTime(Date.parse("2026-11-30T23:59:00+09:00"));
    expect((await openFree(await device("alice"))).status).toBe(200);
    vi.setSystemTime(Date.parse("2026-12-01T00:00:00+09:00"));
    const after = await openFree(await device("bob"));
    expect(after.status).toBe(402);
    expect(await after.json()).toMatchObject({ code: "PAYMENT_REQUIRED" });
  });

  it("keeps the reading on the device before 2026-10-31 and in the account from 2026-10-31 (account sync)", async () => {
    const db = useTestDb();
    const before = (await (await openFree(await device("alice"))).json()) as { readingId?: string };
    expect(before.readingId).toBeUndefined();
    vi.setSystemTime(Date.parse("2026-10-31T12:00:00+09:00"));
    const synced = (await (await openFree(await device("bob"))).json()) as { readingId?: string };
    expect(synced.readingId).toMatch(/^[a-z0-9]{20}$/);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM readings").first()).toEqual({ n: 1 });
  });

  it("deletes the claim with the account (member data, gone on deletion); joining again on that browser is still stopped by the device rule", async () => {
    const db = useTestDb();
    const b = await device("alice");
    expect((await openFree(b)).status).toBe(200);
    expect(await claims(db)).toHaveLength(1);
    await deleteAccount(b, "alice");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NOT NULL AND erased_at IS NOT NULL").first()).toEqual({ n: 1 });
    expect(await claims(db)).toEqual([]);

    // The same Kakao account joins again on the same browser: sl_first (once per device) still says no.
    vi.setSystemTime(T0 + 60_000);
    await loginAs(b, "alice");
    const again = await openFree(b);
    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({ code: "BETA_LIMIT", scope: "first" });
    // On another browser it opens again: what keeping nothing past the deletion allows (owner 2026-10-27, no policy change).
    expect((await openFree(await device("alice"))).status).toBe(200);
  });

  it("purges every claim once the event ended (maintenance), and none before", async () => {
    const db = useTestDb();
    expect((await openFree(await device("alice"))).status).toBe(200);
    expect(await runMaintenance(db, null, Date.parse("2026-11-30T23:00:00+09:00"))).toMatchObject({ openingClaims: 0 });
    expect(await claims(db)).toHaveLength(1);
    expect(await runMaintenance(db, null, Date.parse("2026-12-01T00:10:00+09:00"))).toMatchObject({ openingClaims: 1 });
    expect(await claims(db)).toEqual([]);
  });

  it("tells the account's screens it took 오픈 기념 무료 (/api/me openingUsed), on every device of that account only", async () => {
    useTestDb();
    const web = await device("alice");
    expect((await me(web)).user).not.toHaveProperty("openingUsed");
    expect((await openFree(web)).status).toBe(200);
    expect((await me(web)).user).toMatchObject({ openingUsed: true });
    expect((await me(await device("alice"))).user).toMatchObject({ openingUsed: true });
    expect((await me(await device("bob"))).user).not.toHaveProperty("openingUsed");
  });

  it("fails closed with a clear message when the claim table is not there yet (code before migration), and paid openings go on", async () => {
    const db = migratedTestD1({ without: "opening_claims" });
    setTestDb(db);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = await device("alice");
    const res = await openFree(b);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "NOT_AVAILABLE", reason: "opening", message: "지금은 오픈 기념 무료를 열 수 없어요. 잠시 뒤에 다시 시도해 주세요." });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("opening.claim_unavailable"));
    expect(b.jar.has("sl_first")).toBe(false);
    // The account line still answers (nothing to say about 오픈 기념 무료), and deleting the account still works.
    const account = (await me(b)).user;
    expect(account?.nickname).toBeTruthy();
    expect(account).not.toHaveProperty("openingUsed");

    await buy(b);
    const { drawToken } = (await (await b.send(draw, "/api/tarot/draw", { body: { templateId: "self-flow", picks: [3, 30, 60] } })).json()) as { drawToken: string };
    const paid = await b.send(reading, "/api/tarot/reading", { body: { drawToken, input: INPUT, unlock: { method: "paid" } } });
    expect(paid.status).toBe(200);
    expect(((await paid.json()) as { readingId?: string }).readingId).toBeTruthy();
    await deleteAccount(b, "alice");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NOT NULL AND erased_at IS NOT NULL").first()).toEqual({ n: 1 });
  });

  it("fails closed, never a 500, when the account cannot be read at all (D1 throws)", async () => {
    useTestDb();
    const b = await device("alice");
    const down = () => {
      throw new Error("D1_ERROR: storage unavailable");
    };
    setTestDb({ prepare: down, batch: down, exec: down } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await openFree(b);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "NOT_AVAILABLE", reason: "opening" });
  });
});
