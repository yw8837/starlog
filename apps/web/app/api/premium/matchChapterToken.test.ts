import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { resetSpendState } from "@/lib/api/spend";
import { setTestDb } from "@/lib/db";
import { mockToss } from "@/lib/pay/tossMock";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { openChapter } from "@/lib/security/chapterToken";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { browser, buy, loginAs, useTestDb, type Browser } from "@/lib/testing/p4";
import { POST as followup } from "../followup/route";
import { POST as draw } from "../tarot/draw/route";
import { POST as chapterToken } from "./match/chapter/route";
import { POST as matchReading } from "./match/reading/route";

/**
 * Review 2026-10-17 H3: a 궁합's five follow-ups must not vanish on the device that wrote it. The account's copy holds no
 * partner (owner 2026-10-16), so a token is issued again from the partner the device still holds: sealed (kept across a
 * logout) or, right after a cut-off reading, the tab's own input proven by its resume token. Nothing about the partner is
 * stored on our servers either way.
 */

const T0 = Date.parse("2026-11-20T03:00:00Z");
const DAY = 24 * 3_600_000;
const PARTNER = { ...DEFAULT_SAJU_FORM, year: 1987, month: 7, day: 13 };
const ROUTE = "/api/premium/match/chapter";

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
const sealedOf = (token: string) =>
  (JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")) as { ctx: { partner: { sealed: string } } }).ctx.partner.sealed;

/** Writes a paid 궁합 and answers its input, the resume token after the first part, and the finished reading. */
async function writeMatch(b: Browser, me: Record<string, unknown> = { birth: DEFAULT_SAJU_FORM }, extra: Record<string, unknown> = {}) {
  const drawToken = ((await (await b.send(draw, "/api/tarot/draw", { body: { templateId: "match", picks: [4, 18, 33, 51, 70] } })).json()) as { drawToken: string }).drawToken;
  const input = { me, partner: { birth: PARTNER, label: "민지" }, relation: "friend", concern: "요즘 연락이 뜸해요", drawToken, ack: true, ...extra };
  const first = await json(await b.send(matchReading, "/r", { body: { ...input, unlock: { method: "paid" } } }));
  const done = await json(await b.send(matchReading, "/r", { body: { ...input, unlock: { method: "paid" }, resume: first.resume } }));
  return { input, resume: first.resume as string, done };
}

async function member(address: string, name: string): Promise<Browser> {
  const b = browser(address);
  await loginAs(b, name);
  await buy(b, "match");
  return b;
}

const ask = (b: Browser, token: string, reading: unknown, readingId: string) =>
  b.send(followup, "/api/followup", { body: { chapterToken: token, reading, question: "이번 주에 무엇부터 해 볼까요?", readingId } });

describe("a 궁합's chapter token issued again (review 2026-10-17 H3)", () => {
  it("from the seal the device kept across a logout: the same chapter (its follow-ups carry on, never reset)", async () => {
    useTestDb();
    const b = await member("198.51.100.160", "pair160");
    const { done } = await writeMatch(b);
    expect((await ask(b, done.chapterToken, done.reading, done.readingId)).status).toBe(200);
    expect((await ask(b, done.chapterToken, done.reading, done.readingId)).status).toBe(200);

    vi.setSystemTime(T0 + 3 * DAY);
    const res = await b.send(chapterToken, ROUTE, { body: { readingId: done.readingId, sealed: sealedOf(done.chapterToken) }, origin: true });
    expect(res.status).toBe(200);
    const issued = await json(res);
    expect(issued.followUpsLeft).toBe(3);
    const before = await openChapter(done.chapterToken, done.reading, signingSecret()!, Date.now());
    const after = await openChapter(issued.chapterToken, done.reading, signingSecret()!, Date.now());
    expect(after!.id).toBe(before!.id);
    expect(after!.exp).toBe(before!.exp);
    expect(after!.ctx).toMatchObject({ kind: "match", relation: "friend", partner: { label: "민지" }, concern: "요즘 연락이 뜸해요", paid: true });
    expect(JSON.stringify(after!.ctx)).not.toContain("1987");
    for (let i = 0; i < 3; i++) expect((await ask(b, issued.chapterToken, done.reading, done.readingId)).status).toBe(200);
    expect((await ask(b, issued.chapterToken, done.reading, done.readingId)).status).toBe(429);
  });

  it("from the tab's input and its resume token right after a cut-off: the partner proven by the input hash, sealed anew", async () => {
    useTestDb();
    const b = await member("198.51.100.161", "pair161");
    const { input, resume, done } = await writeMatch(b);
    const res = await b.send(chapterToken, ROUTE, { body: { readingId: done.readingId, resume, input }, origin: true });
    expect(res.status).toBe(200);
    const issued = await json(res);
    expect(issued.followUpsLeft).toBe(5);
    expect((await ask(b, issued.chapterToken, done.reading, done.readingId)).status).toBe(200);

    // Another partner than the one this reading was written for: the resume token does not vouch for it.
    const other = { ...input, partner: { ...input.partner, birth: { ...PARTNER, day: 14 } } };
    expect((await b.send(chapterToken, ROUTE, { body: { readingId: done.readingId, resume, input: other }, origin: true })).status).toBe(400);
  });

  it("keeps my status chips through a token issued from the seal: the account's copy holds my profile (review 2026-10-17 #8)", async () => {
    useTestDb();
    const b = await member("198.51.100.165", "pair165");
    const { done } = await writeMatch(b, { birth: DEFAULT_SAJU_FORM, loveStatus: "dating", workStatus: "employee" });
    const res = await b.send(chapterToken, ROUTE, { body: { readingId: done.readingId, sealed: sealedOf(done.chapterToken) }, origin: true });
    const issued = await json(res);
    const before = await openChapter(done.chapterToken, done.reading, signingSecret()!, Date.now());
    const after = await openChapter(issued.chapterToken, done.reading, signingSecret()!, Date.now());
    expect((after!.ctx as { me: unknown }).me).toEqual((before!.ctx as { me: unknown }).me);
    expect((after!.ctx as { me: { profile?: unknown } }).me.profile).toEqual({ loveStatus: "연애 중", workStatus: "직장인" });
  });

  it("keeps the card design through a token issued again, from the seal or from the tab's input (owner 2026-10-17)", async () => {
    useTestDb();
    const b = await member("198.51.100.166", "pair166");
    const { input, resume, done } = await writeMatch(b, undefined, { deck: "starlog" });
    const fromSeal = await json(await b.send(chapterToken, ROUTE, { body: { readingId: done.readingId, sealed: sealedOf(done.chapterToken) }, origin: true }));
    const fromInput = await json(await b.send(chapterToken, ROUTE, { body: { readingId: done.readingId, resume, input }, origin: true }));
    for (const token of [done.chapterToken, fromSeal.chapterToken, fromInput.chapterToken]) {
      expect((await openChapter(token, done.reading, signingSecret()!, Date.now()))!.ctx).toMatchObject({ kind: "match", deck: "starlog" });
    }
  });

  it("only for the reading's own account, a seal this server made, and within the 30 days", async () => {
    useTestDb();
    const b = await member("198.51.100.162", "pair162");
    const { done, input, resume } = await writeMatch(b);
    const sealed = sealedOf(done.chapterToken);
    expect((await browser("198.51.100.163").send(chapterToken, ROUTE, { body: { readingId: done.readingId, sealed }, origin: true })).status).toBe(401);
    const stranger = await member("198.51.100.164", "pair164");
    expect((await stranger.send(chapterToken, ROUTE, { body: { readingId: done.readingId, sealed }, origin: true })).status).toBe(400);
    expect((await stranger.send(chapterToken, ROUTE, { body: { readingId: done.readingId, resume, input }, origin: true })).status).toBe(400);
    expect((await b.send(chapterToken, ROUTE, { body: { readingId: done.readingId, sealed: `${sealed.slice(0, -4)}AAAA` }, origin: true })).status).toBe(400);
    vi.setSystemTime(T0 + 30 * DAY + 1);
    await loginAs(b, "pair162"); // the session itself lives shorter than the chapter
    expect((await b.send(chapterToken, ROUTE, { body: { readingId: done.readingId, sealed }, origin: true })).status).toBe(400);
  });
});
