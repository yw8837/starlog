import { computeChart } from "@starlog/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { accountSecret } from "@/lib/account/secrets";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { resetSpendState } from "@/lib/api/spend";
import { setTestDb } from "@/lib/db";
import { mockToss } from "@/lib/pay/tossMock";
import { listReadings } from "@/lib/readings/store";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { issueChapter, openChapter, type ChapterContext } from "@/lib/security/chapterToken";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { browser, buy, loginAs, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as followup } from "../followup/route";
import { POST as matchReading } from "./match/reading/route";

/**
 * Owner 2026-10-16: the 궁합 partner's information is never kept on our servers. The account's copy holds the
 * reading, the relation, the label, the concern and the user's own birth only (no cards since 2026-10-17), and no chapter token;
 * the device's token carries the partner sealed, for follow-ups on that device for 30 days.
 */

const T0 = Date.parse("2026-11-20T03:00:00Z");
const PARTNER = { ...DEFAULT_SAJU_FORM, year: 1987, month: 7, day: 13 };
const DAY = 24 * 3_600_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  for (const [k, v] of Object.entries({ STARLOG_AI: "mock", ANTHROPIC_API_KEY: "", STARLOG_PAYMENTS: "on", STARLOG_PREMIUM: "on", STARLOG_KAKAO: "mock", STARLOG_PAY: "mock" })) vi.stubEnv(k, v);
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

const json = async (res: Response) => (await res.json()) as Record<string, any>;
const tokenPayload = (token: string) => JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")) as { ctx: Record<string, any> };

/** `concern`: a second reading written from other words reads differently (the mock writes the same text for the same input). */
async function writeMatch(b: Browser, concern = "요즘 연락이 뜸해요") {
  const body = { me: { birth: DEFAULT_SAJU_FORM }, partner: { birth: PARTNER, label: "민지" }, relation: "friend", concern, ack: true, unlock: { method: "paid" } };
  let res = await json(await b.send(matchReading, "/r", { body }));
  while (res.status === "continue") res = await json(await b.send(matchReading, "/r", { body: { ...body, resume: res.resume } }));
  return res;
}

describe("the 궁합 partner's information (owner 2026-10-16)", () => {
  it("never reaches the account's copy: no partner birth or chart and no chapter token; the rest of the record stays", async () => {
    const db = useTestDb();
    const b = browser("198.51.100.150");
    await loginAs(b, "pair150");
    await buy(b, "match");
    const done = await writeMatch(b);
    expect(done.status).toBe("done");
    const userId = (await db.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>())!.id;
    const [saved] = (await listReadings(db, accountSecret()!, userId)).readings;
    const chapter = saved!.chapter as Record<string, unknown>;
    expect(chapter).toMatchObject({ kind: "match", relation: "friend", relationLabel: "친구", partnerLabel: "민지", concern: "요즘 연락이 뜸해요", me: { birth: DEFAULT_SAJU_FORM }, chapterToken: "" });
    expect(chapter).not.toHaveProperty("partner");
    expect(JSON.stringify(chapter)).not.toMatch(/1987|"partner"/);
    // Owner 2026-10-17 (H1): the reading the account keeps names none of the other person's pillars either.
    const mine = Object.values(computeChart(toSajuInput(DEFAULT_SAJU_FORM)).pillars).flatMap((p) => (p ? [p.stem + p.branch] : []));
    const theirs = Object.values(computeChart(toSajuInput(PARTNER)).pillars).flatMap((p) => (p ? [p.stem + p.branch] : [])).filter((gz) => !mine.includes(gz));
    expect(theirs.length).toBeGreaterThan(0);
    for (const gz of theirs) expect(JSON.stringify(chapter.reading)).not.toContain(gz);
  });

  it("travels to the device sealed inside the chapter token, never as text", async () => {
    useTestDb();
    const b = browser("198.51.100.151");
    await loginAs(b, "pair151");
    await buy(b, "match");
    const done = await writeMatch(b);
    const ctx = tokenPayload(done.chapterToken as string).ctx;
    expect(ctx.kind).toBe("match");
    expect(typeof ctx.partner.sealed).toBe("string");
    expect(ctx.partner).not.toHaveProperty("birth");
    expect(ctx.partner.label).toBe("민지");
    expect(JSON.stringify(ctx)).not.toContain("1987");
  });

  it("answers follow-ups on that device for 30 days, saving neither the turn nor a token to the account", async () => {
    const db = useTestDb();
    const b = browser("198.51.100.152");
    await loginAs(b, "pair152");
    await buy(b, "match");
    const done = await writeMatch(b);
    vi.setSystemTime(T0 + 20 * DAY);
    const res = await b.send(followup, "/api/followup", { body: { chapterToken: done.chapterToken, reading: done.reading, question: "이번 주에 무엇부터 해 볼까요?", readingId: done.readingId } });
    expect(res.status).toBe(200);
    const answered = await json(res);
    expect(JSON.stringify(tokenPayload(answered.chapterToken as string).ctx)).not.toContain("1987");
    const userId = (await db.prepare("SELECT id FROM users LIMIT 1").first<{ id: string }>())!.id;
    const [saved] = (await listReadings(db, accountSecret()!, userId)).readings;
    expect(saved!.chapter).toMatchObject({ chapterToken: "", turns: [] });
  });

  it("refuses a token whose partner is not sealed by this server (an older shape), generating nothing", async () => {
    useTestDb();
    const b = browser("198.51.100.153");
    await loginAs(b, "pair153");
    await buy(b, "match");
    const done = await writeMatch(b);
    const opened = await openChapter(done.chapterToken, done.reading, signingSecret()!, Date.now());
    const plain = { ...opened!.ctx, partner: { birth: PARTNER } } as unknown as ChapterContext;
    const token = await issueChapter(plain, done.reading, [], signingSecret()!, Date.now(), opened!.exp);
    const spy = vi.spyOn(mockProvider, "generate");
    const res = await b.send(followup, "/api/followup", { body: { chapterToken: token, reading: done.reading, question: "이번 주에는요?" } });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ code: "BAD_TOKEN", message: "이어서 물어보기는 풀이한 기기에서만 돼요." });
    expect(spy).not.toHaveBeenCalled();
  });

  it("opens a sealed partner only inside the chapter it was sealed for: moved into another reading's token, it is no partner (review 2026-10-17 L6)", async () => {
    useTestDb();
    const b = browser("198.51.100.154");
    await loginAs(b, "pair154");
    await buy(b, "match");
    await buy(b, "match");
    const first = await writeMatch(b);
    const second = await writeMatch(b, "요즘 대화가 줄었어요");
    const a = await openChapter(first.chapterToken, first.reading, signingSecret()!, Date.now());
    const other = await openChapter(second.chapterToken, second.reading, signingSecret()!, Date.now());
    const moved = { ...other!.ctx, partner: { ...(other!.ctx as { partner: object }).partner, sealed: (a!.ctx as { partner: { sealed: string } }).partner.sealed } } as unknown as ChapterContext;
    const token = await issueChapter(moved, second.reading, [], signingSecret()!, Date.now(), other!.exp);
    const spy = vi.spyOn(mockProvider, "generate");
    const res = await b.send(followup, "/api/followup", { body: { chapterToken: token, reading: second.reading, question: "이번 주에는요?" } });
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    expect((await b.send(followup, "/api/followup", { body: { chapterToken: second.chapterToken, reading: second.reading, question: "이번 주에는요?" } })).status).toBe(200);
  });
});
