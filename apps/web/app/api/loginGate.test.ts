import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError } from "@/lib/ai/provider";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { giveBackPlace } from "@/lib/api/member";
import { clientCount, resetSpendState } from "@/lib/api/spend";
import { setTestDb } from "@/lib/db";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { keyedHash, signingSecret } from "@/lib/security/sign";
import { browser, loginAs, useTestDb, type Browser, type Handler } from "@/lib/testing/p4";
import { POST as logout } from "./auth/logout/route";
import { POST as owner } from "./owner/route";
import { POST as deepTeaser } from "./premium/tarot-deep/teaser/route";
import { POST as sajuTeaser } from "./saju/teaser/route";
import { DELETE as stopDailyShare, POST as shareDaily } from "./share/daily/route";
import { GET as dailyGet, POST as dailyPost } from "./tarot/daily/route";
import { POST as draw } from "./tarot/draw/route";
import { POST as tarotTeaser } from "./tarot/teaser/route";

/**
 * Every AI reading result needs a login (owner 2026-11-04, final): the tarot and saju 맛보기 (premium previews too) and
 * 오늘의 한 장, viewing and generating. A visitor is answered 401 LOGIN_REQUIRED with its reason before the browser check and
 * before anything is generated or counted; a logged-in account gets 5 맛보기 per KST day, counted on the server per account,
 * so clearing cookies gives none back; 오늘의 한 장 is the account's, the same card on every device.
 */

const T0 = Date.parse("2026-11-20T12:00:00+09:00");
const INPUT = {
  topicId: "money", whoId: "me", whenId: "week",
  question: "이번 주, 나의 재물 흐름은 어떨까",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }],
  note: "카드값이 많이 나왔어요",
};
const BIRTH = { ...DEFAULT_SAJU_FORM, year: 1995, month: 5, day: 20, timeKnown: true, hour: 14, minute: 5, gender: "male" };
const DEEP_INPUT = { ...INPUT, whenId: "month", question: "" };

let ipSeq = 0;
const nextIp = () => `198.51.100.${++ipSeq}`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  for (const [k, v] of Object.entries({
    STARLOG_AI: "mock", ANTHROPIC_API_KEY: "", STARLOG_PAYMENTS: "on", STARLOG_KAKAO: "mock", STARLOG_PAY: "mock",
    STARLOG_PREMIUM: "on", STARLOG_OWNER_CODE: "owner-code-for-tests-0001",
  })) vi.stubEnv(k, v);
  resetMemoryLimiter();
  resetDailyStore();
  resetSpendState();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const json = async (res: Response) => (await res.json()) as Record<string, any>;

async function drawFor(b: Browser, templateId = "self-flow", picks = [3, 30, 60]): Promise<string> {
  const res = await b.send(draw, "/api/tarot/draw", { body: { templateId, picks } });
  expect(res.status).toBe(200);
  return (await json(res)).drawToken as string;
}

async function member(name: string, ip = nextIp()): Promise<Browser> {
  const b = browser(ip);
  await loginAs(b, name);
  return b;
}

/** This network's server-side day count of `kind`, as the gate keys it (spend.ts clientCount). */
const networkCount = async (ip: string, kind: "teaser" | "daily") => clientCount(await keyedHash(`client:${ip}`, signingSecret()!), kind, Date.now());

const LOGIN_TEASER = {
  code: "LOGIN_REQUIRED",
  reason: "teaser",
  message: "맛보기 풀이는 로그인하고 볼 수 있어요. 카카오나 Google로 로그인하면 고른 카드와 입력한 정보 그대로 이어서 볼 수 있어요.",
};
const LOGIN_DAILY = { code: "LOGIN_REQUIRED", reason: "daily", message: "오늘의 한 장은 로그인하고 볼 수 있어요. 로그인하면 어느 기기에서든 같은 카드가 보여요." };

describe("a visitor who is not logged in", () => {
  it("is answered 401 LOGIN_REQUIRED by every free AI route, before the browser check: nothing generated, nothing counted", async () => {
    useTestDb();
    // Turnstile on: a visitor must hear about the login, never about a bot check (Siteverify is never asked).
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key-1");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key-1");
    const siteverify = vi.fn(async () => Response.json({ success: true, hostname: "localhost" }));
    vi.stubGlobal("fetch", siteverify);
    const generate = vi.spyOn(mockProvider, "generate");
    const ip = nextIp();
    const visitor = browser(ip);
    const drawToken = await drawFor(visitor);
    const deepToken = await drawFor(visitor, "deep-tarot", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const calls: Array<[string, Handler, string, unknown, Record<string, string>]> = [
      ["tarot teaser", tarotTeaser, "/api/tarot/teaser", { drawToken, input: INPUT }, LOGIN_TEASER],
      ["saju teaser", sajuTeaser, "/api/saju/teaser", { birth: BIRTH }, LOGIN_TEASER],
      ["saju topic teaser", sajuTeaser, "/api/saju/teaser", { birth: BIRTH, topic: "money" }, LOGIN_TEASER],
      ["premium preview", deepTeaser, "/api/premium/tarot-deep/teaser", { drawToken: deepToken, input: DEEP_INPUT }, LOGIN_TEASER],
      ["daily view", dailyGet, "/api/tarot/daily", undefined, LOGIN_DAILY],
      ["daily pick", dailyPost, "/api/tarot/daily", { pick: 1 }, LOGIN_DAILY],
    ];
    for (const [name, handler, url, body, answer] of calls) {
      const res = await visitor.send(handler, url, body === undefined ? {} : { body });
      expect({ status: res.status, body: await json(res) }, name).toEqual({ status: 401, body: answer });
      expect(res.headers.getSetCookie(), name).toEqual([]);
    }
    // A session cookie that names no live session is no login either.
    visitor.jar.set("sl_sid", "forged.value");
    const forged = await visitor.send(tarotTeaser, "/api/tarot/teaser", { body: { drawToken, input: INPUT } });
    expect({ status: forged.status, body: await json(forged) }).toEqual({ status: 401, body: LOGIN_TEASER });

    expect(generate).not.toHaveBeenCalled();
    expect(siteverify).not.toHaveBeenCalled();
    expect(await networkCount(ip, "teaser")).toBe(0);
    expect(await networkCount(ip, "daily")).toBe(0);
  });

  it("whose words state a thought of dying gets the care screen, not the login (owner 2026-10-31 over 2026-11-04): nothing generated, nothing counted", async () => {
    useTestDb();
    vi.stubEnv("TURNSTILE_SITE_KEY", "site-key-1");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key-1");
    const siteverify = vi.fn(async () => Response.json({ success: true, hostname: "localhost" }));
    vi.stubGlobal("fetch", siteverify);
    const generate = vi.spyOn(mockProvider, "generate");
    const ip = nextIp();
    const visitor = browser(ip);
    const crisis = { ...INPUT, note: "요즘 죽고 싶다는 생각이 들어요" };
    const tarot = await visitor.send(tarotTeaser, "/api/tarot/teaser", { body: { drawToken: await drawFor(visitor), input: crisis } });
    expect(tarot.status).toBe(422);
    expect(await json(tarot)).toMatchObject({ code: "REFUSED", care: true });
    const deepToken = await drawFor(visitor, "deep-tarot", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const deep = await visitor.send(deepTeaser, "/api/premium/tarot-deep/teaser", { body: { drawToken: deepToken, input: { ...DEEP_INPUT, note: crisis.note } } });
    expect(deep.status).toBe(422);
    expect(await json(deep)).toMatchObject({ code: "REFUSED", care: true });
    expect(generate).not.toHaveBeenCalled();
    expect(siteverify).not.toHaveBeenCalled();
    expect(await networkCount(ip, "teaser")).toBe(0);
  });

  it("with a passive wish (a reading written with care is still a reading) is asked to log in", async () => {
    useTestDb();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const generate = vi.spyOn(mockProvider, "generate");
    const visitor = browser(nextIp());
    const passive = { ...INPUT, note: "요즘 너무 지쳐서 사라지고 싶어요" };
    const res = await visitor.send(tarotTeaser, "/api/tarot/teaser", { body: { drawToken: await drawFor(visitor), input: passive } });
    expect({ status: res.status, body: await json(res) }).toEqual({ status: 401, body: LOGIN_TEASER });
    expect(generate).not.toHaveBeenCalled();
  });

  it("still makes questions, draws cards and is sent to log in by the opening, as before", async () => {
    useTestDb();
    const visitor = browser(nextIp());
    expect((await visitor.send(draw, "/api/tarot/draw", { body: { templateId: "self-flow", picks: [1, 2, 3] } })).status).toBe(200);
  });
});

describe("a logged-in account", () => {
  it("gets 5 맛보기 per KST day across tarot and saju, then 429, even after clearing cookies and logging in again", async () => {
    useTestDb();
    const web = await member("alice");
    const drawToken = await drawFor(web);
    for (let i = 0; i < 3; i++) expect((await web.send(tarotTeaser, "/api/tarot/teaser", { body: { drawToken, input: INPUT } })).status, `tarot ${i}`).toBe(200);
    for (let i = 0; i < 2; i++) expect((await web.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status, `saju ${i}`).toBe(200);
    // No device cookie counts them any more (sl_q stays for follow-ups).
    expect(web.jar.has("sl_q")).toBe(false);

    const sixth = await web.send(tarotTeaser, "/api/tarot/teaser", { body: { drawToken, input: INPUT } });
    expect(sixth.status).toBe(429);
    expect(await json(sixth)).toMatchObject({ code: "BETA_LIMIT", resetsAt: "2026-11-20T15:00:00.000Z" });
    expect((await json(await web.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH, topic: "love" } }))).code).toBe("BETA_LIMIT");

    // Cookies cleared (the session goes with them): logging in again to the same account gives nothing back.
    web.jar.clear();
    await loginAs(web, "alice");
    const again = await web.send(tarotTeaser, "/api/tarot/teaser", { body: { drawToken: await drawFor(web), input: INPUT } });
    expect(again.status).toBe(429);
    // Nor does another device of the same account.
    const phone = await member("alice");
    expect((await phone.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status).toBe(429);

    // Another account on the same device has its own five; the next KST day opens alice's again.
    await loginAs(web, "bob");
    expect((await web.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status).toBe(200);
    vi.setSystemTime(Date.parse("2026-11-21T00:00:00+09:00"));
    expect((await phone.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status).toBe(200);
  });

  it("counts a premium preview as one of the day's 맛보기, and spends none on a generation that failed", async () => {
    useTestDb();
    const b = await member("carol");
    const deepToken = await drawFor(b, "deep-tarot", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect((await b.send(deepTeaser, "/api/premium/tarot-deep/teaser", { body: { drawToken: deepToken, input: DEEP_INPUT } })).status).toBe(200);
    // A generation that fails spends nothing.
    vi.spyOn(mockProvider, "generate").mockRejectedValueOnce(new Error("upstream down"));
    expect((await b.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status).toBe(502);
    for (let i = 0; i < 4; i++) expect((await b.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status, `saju ${i}`).toBe(200);
    expect((await b.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status).toBe(429);
  });

  it("with the owner pass skips the day's count, never the login", async () => {
    useTestDb();
    const ownerVisitor = browser(nextIp());
    expect((await ownerVisitor.send(owner, "/api/owner", { body: { code: "owner-code-for-tests-0001" }, origin: true })).status).toBe(200);
    expect((await ownerVisitor.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status).toBe(401);
    await loginAs(ownerVisitor, "dave");
    for (let i = 0; i < 7; i++) expect((await ownerVisitor.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status, `saju ${i}`).toBe(200);
  });
});

describe("오늘의 한 장 per account", () => {
  it("deals, stores and shows the same card on every device of the account, and another account its own", async () => {
    useTestDb();
    const web = await member("erin");
    expect(await json(await web.send(dailyGet, "/api/tarot/daily"))).toEqual({ deal: [{ index: 0 }, { index: 1 }, { index: 2 }], account: expect.any(String) });
    const picked = await web.send(dailyPost, "/api/tarot/daily", { body: { pick: 2 } });
    expect(picked.status).toBe(200);
    const fortune = await json(picked);
    expect(fortune.pick).toBe(2);

    // Another device of the same account: the stored card when it looks, and the same card whatever it picks.
    const phone = await member("erin");
    expect(await json(await phone.send(dailyGet, "/api/tarot/daily"))).toEqual(fortune);
    expect(await json(await phone.send(dailyPost, "/api/tarot/daily", { body: { pick: 0 } }))).toEqual(fortune);
    // Its share link is the account's card of the day: the same address from both devices.
    const fromWeb = await json(await web.send(shareDaily, "/api/share/daily", { body: {}, origin: true }));
    const fromPhone = await json(await phone.send(shareDaily, "/api/share/daily", { body: {}, origin: true }));
    expect(fromPhone.id).toBe(fromWeb.id);

    // Another account, even on the same browser, has its own day: nothing picked yet.
    await loginAs(phone, "frank");
    expect(await json(await phone.send(dailyGet, "/api/tarot/daily"))).toEqual({ deal: [{ index: 0 }, { index: 1 }, { index: 2 }], account: expect.any(String) });
    // Logged out, the card is not shown again on that device either.
    web.jar.delete("sl_sid");
    expect((await web.send(dailyGet, "/api/tarot/daily")).status).toBe(401);
  });
});

/** The account's pseudonym the server keys its counts and 오늘의 한 장 by (lib/api/member.ts). */
const memberKeyOf = async (userId: string) => keyedHash(userId, signingSecret()!, "starlog/account-id/v1");
/** The account the latest login made or used. */
const lastUserId = async (db: ReturnType<typeof useTestDb>) =>
  (await db.prepare("SELECT user_id FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1").first<{ user_id: string }>())!.user_id;

describe("the account's day count (code review 2026-11-04)", () => {
  it("never lets requests sent together pass the five: twenty at a count of four open one, the rest are refused", async () => {
    useTestDb();
    const b = await member("gina");
    for (let i = 0; i < 4; i++) expect((await b.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status, `saju ${i}`).toBe(200);
    const statuses = await Promise.all(Array.from({ length: 20 }, () => b.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } }).then((res) => res.status)));
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 429)).toHaveLength(19);
  });

  it("keys its count by an HMAC of the account, never the raw user id, and gives a failed generation's place back", async () => {
    const db = useTestDb();
    const b = await member("hana");
    const userId = await lastUserId(db);
    expect((await b.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status).toBe(200);
    const rows = (await db.prepare("SELECT account_key, kst_day, kind, n FROM account_day_counts").all()).results as Array<Record<string, unknown>>;
    expect(rows).toEqual([{ account_key: await memberKeyOf(userId), kst_day: "2026-11-20", kind: "teaser", n: 1 }]);
    expect(JSON.stringify(rows)).not.toContain(userId);
    vi.spyOn(mockProvider, "generate").mockRejectedValueOnce(new Error("upstream down"));
    expect((await b.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status).toBe(502);
    expect(await db.prepare("SELECT n FROM account_day_counts").first()).toEqual({ n: 1 });
  });

  it("gives the place back when the client leaves during the generation, and keeps it for a delivered one (code review 2026-11-05)", async () => {
    const db = useTestDb();
    const b = await member("jun");
    const count = async (kind: "teaser" | "daily") => (await db.prepare("SELECT n FROM account_day_counts WHERE kind = ?").bind(kind).first<{ n: number }>())?.n ?? 0;
    /** The next generation waits until the request is aborted, as the model's answer does; true once the request left. */
    const leaveDuring = async (send: (signal: AbortSignal) => Promise<Response>) => {
      const generate = vi.spyOn(mockProvider, "generate").mockImplementationOnce((_task, _attempt, _feedback, hooks) =>
        new Promise((_, reject) => hooks?.signal?.addEventListener("abort", () => reject(new GenerationError("UPSTREAM", ["aborted"])))));
      const client = new AbortController();
      const left = send(client.signal);
      await vi.waitFor(() => expect(generate).toHaveBeenCalled());
      client.abort();
      await left;
      generate.mockRestore();
    };
    expect((await b.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status).toBe(200);
    expect(await count("teaser")).toBe(1);
    // A topic switch or a closed tab cancels the 맛보기 while it is written: its place comes back (saju, tarot, a premium preview).
    await leaveDuring((signal) => b.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH }, signal }));
    const drawToken = await drawFor(b);
    await leaveDuring((signal) => b.send(tarotTeaser, "/api/tarot/teaser", { body: { drawToken, input: INPUT }, signal }));
    const deepToken = await drawFor(b, "deep-tarot", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await leaveDuring((signal) => b.send(deepTeaser, "/api/premium/tarot-deep/teaser", { body: { drawToken: deepToken, input: DEEP_INPUT }, signal }));
    expect(await count("teaser")).toBe(1);
    // 오늘의 한 장's regeneration too: two cancelled ones no longer end the day without a card.
    await leaveDuring((signal) => b.send(dailyPost, "/api/tarot/daily", { body: { pick: 1 }, signal }));
    await leaveDuring((signal) => b.send(dailyPost, "/api/tarot/daily", { body: { pick: 1 }, signal }));
    expect(await count("daily")).toBe(0);
    expect((await b.send(dailyPost, "/api/tarot/daily", { body: { pick: 1 } })).status).toBe(200);
    expect(await count("daily")).toBe(1);
    // A place comes back once, whichever ways its request ended (오늘의 한 장's stored card, then a client gone).
    const place = { key: "k", day: "2026-11-20", kind: "teaser" as const };
    await db.prepare("INSERT INTO account_day_counts (account_key, kst_day, kind, n) VALUES ('k', '2026-11-20', 'teaser', 2)").run();
    await giveBackPlace(place);
    await giveBackPlace(place);
    expect(await db.prepare("SELECT n FROM account_day_counts WHERE account_key = 'k'").first()).toEqual({ n: 1 });
  });

  it("answers 503 when the count cannot be read, with nothing generated", async () => {
    const db = useTestDb();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const b = await member("iris");
    await db.prepare("DROP TABLE account_day_counts").run();
    const generate = vi.spyOn(mockProvider, "generate");
    const res = await b.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } });
    expect(res.status).toBe(503);
    expect((await json(res)).code).toBe("AI_UNAVAILABLE");
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("a session that is no longer good is no login (code review 2026-11-04)", () => {
  it("refuses a validly signed session that was revoked, has expired, or whose account was deleted", async () => {
    const db = useTestDb();
    const revoked = await member("jay");
    const kept = revoked.jar.get("sl_sid")!;
    expect((await revoked.send(logout, "/api/auth/logout", { body: {}, origin: true })).status).toBe(200);
    revoked.jar.set("sl_sid", kept);
    expect((await revoked.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status).toBe(401);

    const deleted = await member("kim");
    await db.prepare("UPDATE users SET deleted_at = ? WHERE id = ?").bind(Date.now(), await lastUserId(db)).run();
    expect((await deleted.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status).toBe(401);

    const expired = await member("lee");
    vi.setSystemTime(T0 + 31 * 24 * 60 * 60 * 1000);
    expect((await expired.send(sajuTeaser, "/api/saju/teaser", { body: { birth: BIRTH } })).status).toBe(401);
  });
});

describe("오늘의 한 장 after the review (2026-11-04)", () => {
  it("shares only the logged-in account's own card: a logout clears sl_daily, and its old cookie shares nothing after it", async () => {
    useTestDb();
    const pc = await member("mina");
    expect((await pc.send(dailyPost, "/api/tarot/daily", { body: { pick: 1 } })).status).toBe(200);
    const made = await json(await pc.send(shareDaily, "/api/share/daily", { body: {}, origin: true }));
    expect(made.id).toEqual(expect.any(String));
    const daily = pc.jar.get("sl_daily")!;

    const out = await pc.send(logout, "/api/auth/logout", { body: {}, origin: true });
    expect(out.headers.getSetCookie().some((c) => /^sl_daily=;.*Max-Age=0/.test(c))).toBe(true);
    expect(pc.jar.has("sl_daily")).toBe(false);
    // A shared PC whose cookie survived anyway: a visitor gets nothing, not even a way to take the link down.
    pc.jar.set("sl_daily", daily);
    expect((await pc.send(shareDaily, "/api/share/daily", { body: {}, origin: true })).status).toBe(401);
    expect((await pc.send(stopDailyShare, "/api/share/daily", { method: "DELETE", body: {}, origin: true })).status).toBe(401);
    // Another account on that PC with the old cookie: not mina's card, nor her link.
    await loginAs(pc, "nora");
    pc.jar.set("sl_daily", daily);
    const other = await pc.send(shareDaily, "/api/share/daily", { body: {}, origin: true });
    expect(other.status).toBe(409);
    expect((await json(other)).id).toBeUndefined();
    expect((await pc.send(stopDailyShare, "/api/share/daily", { method: "DELETE", body: {}, origin: true })).status).toBe(409);
  });

  it("counts its regenerations per account across devices, and a limit answer reveals no card", async () => {
    useTestDb();
    const web = await member("olga");
    expect((await web.send(dailyPost, "/api/tarot/daily", { body: { pick: 0 } })).status).toBe(200);
    resetDailyStore(); // the store lost it: the next visit writes it again
    const phone = await member("olga");
    expect((await phone.send(dailyPost, "/api/tarot/daily", { body: { pick: 0 } })).status).toBe(200);
    resetDailyStore();
    const tablet = await member("olga");
    const third = await tablet.send(dailyPost, "/api/tarot/daily", { body: { pick: 2 } });
    expect(third.status).toBe(429);
    const body = await json(third);
    expect(body.code).toBe("BETA_LIMIT");
    expect(body).not.toHaveProperty("card");
  });

  it("says whose card it is with a marker of the account (never the id or its key): the same on every device of it, another for another account", async () => {
    const db = useTestDb();
    const web = await member("pia");
    const userId = await lastUserId(db);
    const first = await json(await web.send(dailyGet, "/api/tarot/daily"));
    expect(first.account).toEqual(expect.any(String));
    expect(first.account).not.toContain(userId);
    expect(first.account).not.toBe(await memberKeyOf(userId));
    const picked = await json(await web.send(dailyPost, "/api/tarot/daily", { body: { pick: 1 } }));
    expect(picked.account).toBe(first.account);
    const phone = await member("pia");
    expect((await json(await phone.send(dailyGet, "/api/tarot/daily"))).account).toBe(first.account);
    const other = await member("quin");
    expect((await json(await other.send(dailyGet, "/api/tarot/daily"))).account).not.toBe(first.account);
  });
});
