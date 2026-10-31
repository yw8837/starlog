import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { CARE_BODY } from "@/lib/crisis";
import { GenerationError } from "@/lib/ai/provider";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { BirthBody } from "@/lib/api/inputs";
import { DEFAULT_SAJU_FORM, checkSajuForm, todayInKorea } from "@/lib/sajuForm";
import { issueChapter } from "@/lib/security/chapterToken";
import { dailyDeal } from "@/lib/security/drawToken";
import { signingSecret } from "@/lib/security/sign";
import { teaserCut } from "@/lib/security/teaserSeal";
import { setTestDb } from "@/lib/db";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { openerCookies, paidChapterOf, useTestDb } from "@/lib/testing/p4";
import { GET as dailyDealState, POST as daily } from "./tarot/daily/route";
import { POST as draw } from "./tarot/draw/route";
import { POST as reading } from "./tarot/reading/route";
import { POST as teaser } from "./tarot/teaser/route";
import { POST as followup } from "./followup/route";
import { POST as owner } from "./owner/route";
import { POST as sajuReading } from "./saju/reading/route";
import { POST as sajuTeaser } from "./saju/teaser/route";

type Handler = (request: Request) => Promise<Response>;

/** A device: remembers cookies between calls, like a browser would. */
function device(ip = "203.0.113.7") {
  const jar = new Map<string, string>();
  const call = async (handler: Handler, body: unknown, init: { raw?: string; type?: string } = {}) => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: {
        "content-type": init.type ?? "application/json",
        "cf-connecting-ip": ip,
        origin: "http://localhost",
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: init.raw ?? JSON.stringify(body),
    });
    const response = await handler(request);
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair!.indexOf("=");
      jar.set(pair!.slice(0, index), pair!.slice(index + 1));
    }
    return { status: response.status, data: (await response.json()) as Record<string, any>, headers: response.headers };
  };
  return { call, jar };
}

/** A device logged in to an account of its own: 오픈 기념 무료 opens once per logged-in account (owner 2026-10-27). */
async function member(ip?: string) {
  const d = device(ip);
  for (const [name, value] of await openerCookies()) d.jar.set(name, value);
  return d;
}

const MONEY_INPUT = {
  topicId: "money", whoId: "me", whenId: "week",
  question: "이번 주, 나의 재물 흐름은 어떨까",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }, { label: "관심 방향", value: "지출 줄이기" }],
  note: "이번 달 카드값이 많이 나왔어요",
};

const T0 = Date.parse("2026-09-30T03:00:00Z"); // 12:00 KST
const HOUR = 3_600_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("STARLOG_OWNER_CODE", "owner-code-for-tests-0001");
  // 오픈 기념 무료 needs an account (member): sign-up open, mock Kakao, a test D1.
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  useTestDb();
  resetMemoryLimiter();
  resetDailyStore();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function drawSelfFlow(d: ReturnType<typeof device>) {
  const res = await d.call(draw, { templateId: "self-flow", picks: [3, 30, 60] });
  expect(res.status).toBe(200);
  return res.data as { cards: Array<{ position: string; cardId: string; orientation: string }>; drawToken: string };
}

describe("tarot flow with the mock provider", () => {
  it("draws, teases, reads and answers follow-ups for the picked cards and the money topic", async () => {
    const d = await member();
    const { cards, drawToken } = await drawSelfFlow(d);
    expect(cards.map((c) => c.position)).toEqual(["지금의 나", "필요한 것", "이 시기의 흐름"]);

    const t = await d.call(teaser, { drawToken, input: MONEY_INPUT });
    expect(t.status).toBe(200);
    expect(t.data.cards.map((c: { cardId: string }) => c.cardId)).toEqual(cards.map((c) => c.cardId));
    expect(t.data.lockedToc[0]).toBe("한 줄 결론");
    expect(t.data).not.toHaveProperty("verdict");
    expect(d.jar.has("sl_q")).toBe(true);

    const r = await d.call(reading, { drawToken, input: MONEY_INPUT });
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.data.reading);
    expect(r.data.reading.cards.map((c: { cardId: string }) => c.cardId)).toEqual(cards.map((c) => c.cardId));
    expect(text).toContain("수입이 들쭉날쭉");
    expect(text).not.toMatch(/연락|재회|뜸해진/);
    expect(r.data.reading.connection.heading).toBe("세 장을 이어 읽으면");

    // That one was 오픈 기념 무료 (no follow-ups): the follow-ups run on a paid opening's chapter of the same reading.
    let token = await paidChapterOf(r.data.chapterToken, r.data.reading);
    for (let i = 0; i < 3; i++) {
      const f = await d.call(followup, { chapterToken: token, reading: r.data.reading, question: "지출은 어떻게 줄이면 좋을까요?" });
      expect(f.status).toBe(200);
      expect(f.data.remaining).toBe(2 - i);
      token = f.data.chapterToken;
    }
    const capped = await d.call(followup, { chapterToken: token, reading: r.data.reading, question: "하나 더 물어봐도 될까요?" });
    expect(capped.status).toBe(429);
    expect(capped.data).toMatchObject({ code: "BETA_LIMIT", scope: "chapter" });
  });

  it("감질맛: the teaser shows the second card cut near half and seals both cards; the reading opened with the seal reads on from them", async () => {
    const d = await member();
    const { cards, drawToken } = await drawSelfFlow(d);
    const spy = vi.spyOn(mockProvider, "generate");
    const t = await d.call(teaser, { drawToken, input: MONEY_INPUT });
    expect(t.status).toBe(200);
    const draft = (await spy.mock.results[0]!.value).data as { firstCard: { body: string }; secondCard: { body: string } };
    const full = draft.secondCard.body.trim();
    // its heading is the code's card label, as on the locked list ("한 줄 결론", card 2, …: card 1 is shown in full, so not listed)
    expect(t.data.lockedToc[1]).toMatch(new RegExp(`^${cards[1]!.position} · `));
    expect(t.data.lockedToc).not.toContain(t.data.firstCard.heading);
    expect(t.data.secondCard).toEqual({ heading: t.data.lockedToc[1], body: teaserCut(full), cut: true });
    const shown = t.data.secondCard.body as string;
    expect(shown.length / full.length).toBeGreaterThanOrEqual(0.35);
    expect(shown.length / full.length).toBeLessThanOrEqual(0.65);
    // the rest never leaves the server as text (its words may echo the shown part, so the whole rest and its end are checked)
    const rest = full.slice(shown.length).trim();
    expect(JSON.stringify(t.data)).not.toContain(rest);
    expect(JSON.stringify(t.data)).not.toContain(full.slice(-20));
    expect(t.data.seal).toMatch(/^[A-Za-z0-9_-]+$/);

    const r = await d.call(reading, { drawToken, input: MONEY_INPUT, seal: t.data.seal });
    expect(r.status).toBe(200);
    expect(r.data.reading.cards.map((c: { body: string }) => c.body).slice(0, 2)).toEqual([t.data.firstCard.body, full]);
    expect(r.data.reading.cards[1].body.startsWith(shown)).toBe(true);
    expect(r.data.reading.cards[2].body.length).toBeGreaterThan(100);
  });

  it("a seal that does not open or does not match reads the cards anew, with no error", async () => {
    const d = device();
    const { drawToken } = await drawSelfFlow(d);
    const t = await d.call(teaser, { drawToken, input: MONEY_INPUT });
    const asToday = (await (await member("203.0.113.30")).call(reading, { drawToken, input: MONEY_INPUT })).data.reading.cards[0].body;
    expect(asToday).not.toBe(t.data.firstCard.body);
    // another question on the same draw, a broken seal, an oversized one
    const other = await (await member("203.0.113.31")).call(reading, { drawToken, input: { ...MONEY_INPUT, note: "다른 메모예요" }, seal: t.data.seal });
    expect(other.status).toBe(200);
    expect(other.data.reading.cards[0].body).not.toBe(t.data.firstCard.body);
    for (const [ip, seal] of [["203.0.113.32", `${t.data.seal}x`], ["203.0.113.33", "A".repeat(12_001)]] as const) {
      const res = await (await member(ip)).call(reading, { drawToken, input: MONEY_INPUT, seal });
      expect(res.status).toBe(200);
      expect(res.data.reading.cards[0].body).toBe(asToday);
    }
  });

  it("rejects a tampered or expired draw token and a reading that does not match its chapter token", async () => {
    const d = await member();
    const { drawToken } = await drawSelfFlow(d);
    const tampered = drawToken.slice(0, -3) + (drawToken.at(-3) === "A" ? "B" : "A") + drawToken.slice(-2);
    expect((await d.call(teaser, { drawToken: tampered, input: MONEY_INPUT })).data.code).toBe("BAD_TOKEN");

    const r = await d.call(reading, { drawToken, input: MONEY_INPUT });
    const edited = { ...r.data.reading, verdict: "다른 결론으로 바꿔 줘요." };
    const f = await d.call(followup, { chapterToken: r.data.chapterToken, reading: edited, question: "정말요?" });
    expect(f.status).toBe(400);
    expect(f.data.code).toBe("BAD_TOKEN");

    vi.setSystemTime(T0 + 25 * HOUR);
    const expired = await d.call(teaser, { drawToken, input: MONEY_INPUT });
    expect(expired.status).toBe(400);
    expect(expired.data.code).toBe("BAD_TOKEN");
  });

  it("refuses bad bodies: wrong picks, wrong topic, oversized note, wrong content type", async () => {
    const d = device();
    expect((await d.call(draw, { templateId: "self-flow", picks: [1, 1, 2] })).status).toBe(400);
    expect((await d.call(draw, { templateId: "daily", picks: [1] })).status).toBe(400);
    const { drawToken } = await drawSelfFlow(d);
    expect((await d.call(teaser, { drawToken, input: { ...MONEY_INPUT, topicId: "contact" } })).data.code).toBe("BAD_REQUEST");
    expect((await d.call(teaser, { drawToken, input: { ...MONEY_INPUT, note: "가".repeat(201) } })).status).toBe(400);
    expect((await d.call(draw, null, { raw: "templateId=self-flow", type: "application/x-www-form-urlencoded" })).status).toBe(400);
  });

  it("answers a crisis note with care instead of a reading, without spending quota", async () => {
    const d = device();
    const { drawToken } = await drawSelfFlow(d);
    const res = await d.call(reading, { drawToken, input: { ...MONEY_INPUT, note: "요즘 죽고 싶다는 생각이 들어요" } });
    expect(res.status).toBe(422);
    expect(res.data).toMatchObject({ code: "REFUSED", care: true });
    expect(res.data.message).toBe(CARE_BODY); // the UI lists the hotlines
    expect(d.jar.has("sl_first")).toBe(false);
  });

  it("writes a passive wish's reading with care instead of refusing it, and says so in the body (owner 2026-10-31)", async () => {
    const d = device();
    const { drawToken } = await drawSelfFlow(d);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const spy = vi.spyOn(mockProvider, "generate");
    const res = await d.call(teaser, { drawToken, input: { ...MONEY_INPUT, note: "요즘 너무 지쳐서 사라지고 싶어요" } });
    expect(res.status).toBe(200);
    expect(res.data.care).toBe(true);
    expect(spy.mock.calls.every(([, , , hooks]) => hooks?.care === true)).toBe(true);
  });

  it("writes the full reading of a passive wish with care, and every follow-up on that chapter (code review 2026-10-31)", async () => {
    const d = await member();
    const { drawToken } = await drawSelfFlow(d);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const spy = vi.spyOn(mockProvider, "generate");
    const r = await d.call(reading, { drawToken, input: { ...MONEY_INPUT, note: "요즘 너무 지쳐서 사라지고 싶어요" } });
    expect(r.status).toBe(200);
    expect(r.data.care).toBe(true);
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    expect(spy.mock.calls.every(([, , , hooks]) => hooks?.care === true)).toBe(true);
    spy.mockClear();
    // An ordinary question on that chapter is still written with care: the chapter's note reaches the prompt.
    const token = await paidChapterOf(r.data.chapterToken, r.data.reading);
    const f = await d.call(followup, { chapterToken: token, reading: r.data.reading, question: "지출은 어떻게 줄이면 좋을까요?" });
    expect(f.status).toBe(200);
    expect(f.data.care).toBe(true);
    expect(spy.mock.calls.every(([, , , hooks]) => hooks?.care === true)).toBe(true);
  });

  it("writes a follow-up whose own question carries a passive wish with care; an ordinary chapter stays as it was", async () => {
    const d = await member();
    const { drawToken } = await drawSelfFlow(d);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await d.call(reading, { drawToken, input: MONEY_INPUT });
    expect(r.data.care).toBeUndefined();
    const token = await paidChapterOf(r.data.chapterToken, r.data.reading);
    const plain = await d.call(followup, { chapterToken: token, reading: r.data.reading, question: "지출은 어떻게 줄이면 좋을까요?" });
    expect(plain.data.care).toBeUndefined();
    const cared = await d.call(followup, { chapterToken: plain.data.chapterToken, reading: r.data.reading, question: "그냥 다 끝내고 싶어요" });
    expect(cared.status).toBe(200);
    expect(cared.data.care).toBe(true);
    const refused = await d.call(followup, { chapterToken: cared.data.chapterToken, reading: r.data.reading, question: "죽고 싶어요" });
    expect(refused.status).toBe(422);
  });
});

describe("quota", () => {
  it("gives a device one free tarot full reading the first time (오픈 기념 무료), not one a day; a failed one spends nothing", async () => {
    const d = await member();
    const { drawToken } = await drawSelfFlow(d);
    vi.spyOn(mockProvider, "generate").mockRejectedValueOnce(new GenerationError("UPSTREAM"));
    expect((await d.call(reading, { drawToken, input: MONEY_INPUT })).status).toBe(502);
    expect(d.jar.has("sl_first")).toBe(false);
    const first = await d.call(reading, { drawToken, input: MONEY_INPUT });
    expect(first.status).toBe(200);
    // A signed cookie that lives a year, set only now that the reading was written.
    expect(first.headers.getSetCookie().find((c) => c.startsWith("sl_first="))).toMatch(/^sl_first=.+; Path=\/; Max-Age=31536000; HttpOnly; SameSite=Lax/);
    expect(d.jar.has("sl_q")).toBe(false);
    const used = await d.call(reading, { drawToken, input: MONEY_INPUT });
    expect(used.status).toBe(429);
    expect(used.data).toEqual({ code: "BETA_LIMIT", scope: "first", message: "이 기기에서는 오픈 기념 무료 풀이를 이미 받았어요." });
    expect(JSON.stringify(used.data)).not.toContain("베타");

    vi.setSystemTime(Date.parse("2026-09-30T15:00:01Z")); // 00:00:01 KST the next day: it does not come back
    const next = await drawSelfFlow(d);
    expect((await d.call(reading, { drawToken: next.drawToken, input: MONEY_INPUT })).data).toMatchObject({ code: "BETA_LIMIT", scope: "first" });
    // Teasers stay a daily count of their own.
    expect((await d.call(teaser, { drawToken: next.drawToken, input: MONEY_INPUT })).status).toBe(200);
  });

  it("opens no saju full reading for free: refused before any generation, nothing spent, the teaser still free", async () => {
    const d = device("203.0.113.70");
    const spy = vi.spyOn(mockProvider, "generate");
    for (const body of [{ birth: DEFAULT_SAJU_FORM }, { birth: DEFAULT_SAJU_FORM, topic: "money" }]) {
      const refused = await d.call(sajuReading, body);
      expect(refused.status).toBe(402);
      expect(refused.data).toMatchObject({ code: "PAYMENT_REQUIRED" });
      expect(refused.headers.getSetCookie()).toEqual([]);
    }
    expect(spy).not.toHaveBeenCalled();
    expect((await d.call(sajuTeaser, { birth: DEFAULT_SAJU_FORM })).status).toBe(200);
    // The owner opens saju with the owner pass, never through the free opening.
    expect((await d.call(owner, { code: "owner-code-for-tests-0001" })).status).toBe(200);
    expect((await d.call(sajuReading, { birth: DEFAULT_SAJU_FORM })).status).toBe(402);
    expect((await d.call(sajuReading, { birth: DEFAULT_SAJU_FORM, unlock: { method: "owner" } })).status).toBe(200);
    // This device's free tarot reading is untouched.
    const stranger = await member("203.0.113.71");
    await stranger.call(sajuReading, { birth: DEFAULT_SAJU_FORM });
    const { drawToken } = await drawSelfFlow(stranger);
    expect((await stranger.call(reading, { drawToken, input: MONEY_INPUT })).status).toBe(200);
  });

  it("lets the owner pass skip every quota; a wrong code sets nothing and login attempts are rate limited", async () => {
    vi.stubEnv("BETA_FULL_PER_DAY", "0");
    // The owner pass skips the device's and the network's counts; 오픈 기념 무료 is still once per account.
    const d = await member("198.51.100.1");
    expect((await d.call(owner, { code: "wrong" })).status).toBe(400);
    expect(d.jar.has("sl_owner")).toBe(false);
    const ok = await d.call(owner, { code: "owner-code-for-tests-0001" });
    expect(ok.status).toBe(200);
    expect(ok.headers.getSetCookie()[0]).toMatch(/^sl_owner=.+; Path=\/; Max-Age=31536000; HttpOnly; SameSite=Lax/);

    const { drawToken } = await drawSelfFlow(d);
    expect((await d.call(reading, { drawToken, input: MONEY_INPUT })).status).toBe(200);
    const stranger = device("198.51.100.2");
    const other = await drawSelfFlow(stranger);
    expect((await stranger.call(reading, { drawToken: other.drawToken, input: MONEY_INPUT })).status).toBe(429);

    const guesser = device("198.51.100.3");
    for (let i = 0; i < 4; i++) await guesser.call(owner, { code: `guess-${i}` });
    expect((await guesser.call(owner, { code: "owner-code-for-tests-0001" })).status).toBe(200);
    expect((await guesser.call(owner, { code: "owner-code-for-tests-0001" })).status).toBe(429);
  });

  it("rate limits generation per IP at 60 a minute", async () => {
    const d = device("192.0.2.50");
    const { drawToken } = await drawSelfFlow(d);
    vi.stubEnv("BETA_TEASER_PER_DAY", "1000");
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await d.call(teaser, { drawToken, input: MONEY_INPUT })).status);
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
  });

  it("limits full readings to 20 a minute per IP (25 for the owner), on top of the daily quota", async () => {
    // The limiter answers before anything else is asked: a visitor's 21st request in a minute meets it, not the login.
    const d = device("192.0.2.60");
    const { drawToken } = await drawSelfFlow(d);
    const codes: string[] = [];
    for (let i = 0; i < 21; i++) codes.push((await d.call(reading, { drawToken, input: MONEY_INPUT })).data.code);
    expect(codes.slice(0, 20).every((c) => c === "LOGIN_REQUIRED")).toBe(true);
    expect(codes[20]).toBe("RATE_LIMIT");
    vi.setSystemTime(T0 + 61_000);
    expect((await d.call(reading, { drawToken, input: MONEY_INPUT })).data.code).toBe("LOGIN_REQUIRED");

    const boss = device("192.0.2.61");
    expect((await boss.call(owner, { code: "owner-code-for-tests-0001" })).status).toBe(200);
    const bossDraw = await drawSelfFlow(boss);
    for (let i = 0; i < 21; i++) expect((await boss.call(reading, { drawToken: bossDraw.drawToken, input: MONEY_INPUT, unlock: { method: "owner" } })).status).toBe(200);
  });

  it("lets a crowd on one shared IP (CGNAT, café Wi-Fi) each use their own free reading (final QA Q-01)", async () => {
    const statuses: number[] = [];
    let phone = device("198.18.40.1");
    let drawToken = "";
    for (let i = 0; i < 15; i++) {
      phone = await member("198.18.40.1"); // fresh cookies and an account of its own, same carrier IP, all within one minute
      ({ drawToken } = await drawSelfFlow(phone));
      expect((await phone.call(teaser, { drawToken, input: MONEY_INPUT })).status).toBe(200);
      statuses.push((await phone.call(reading, { drawToken, input: MONEY_INPUT })).status);
    }
    expect(statuses.every((s) => s === 200)).toBe(true);
    // each phone's one free first reading is still its own
    expect((await phone.call(reading, { drawToken, input: MONEY_INPUT })).data).toMatchObject({ code: "BETA_LIMIT", scope: "first" });
  });
});

describe("chapter tokens", () => {
  it("expire 7 days after the reading; follow-ups keep the original expiry", async () => {
    const d = await member();
    const { drawToken } = await drawSelfFlow(d);
    const r = await d.call(reading, { drawToken, input: MONEY_INPUT });
    const chapterToken = await paidChapterOf(r.data.chapterToken, r.data.reading);
    vi.setSystemTime(T0 + 6 * 24 * HOUR);
    const f = await d.call(followup, { chapterToken, reading: r.data.reading, question: "지출은 어떻게 줄이면 좋을까요?" });
    expect(f.status).toBe(200);
    vi.setSystemTime(T0 + 7 * 24 * HOUR + 1);
    const late = await d.call(followup, { chapterToken: f.data.chapterToken, reading: r.data.reading, question: "하나 더 물어봐도 될까요?" });
    expect(late.status).toBe(400);
    expect(late.data.code).toBe("BAD_TOKEN");
  });
});

describe("오픈 기념 무료", () => {
  it("ends with November: from 2026-12-01 00:00 KST the free opening is refused before any generation, nothing set; the owner pass still opens", async () => {
    vi.setSystemTime(Date.parse("2026-11-30T14:59:59Z")); // 23:59:59 KST, the last free second
    const last = await member("203.0.113.80");
    const lastDraw = await drawSelfFlow(last);
    expect((await last.call(reading, { drawToken: lastDraw.drawToken, input: MONEY_INPUT })).status).toBe(200);

    vi.setSystemTime(Date.parse("2026-11-30T15:00:00Z")); // 00:00 KST, 12월 1일
    const d = device("203.0.113.81");
    const { drawToken } = await drawSelfFlow(d);
    const spy = vi.spyOn(mockProvider, "generate");
    const gone = await d.call(reading, { drawToken, input: MONEY_INPUT });
    expect(gone.status).toBe(402);
    expect(gone.data).toMatchObject({ code: "PAYMENT_REQUIRED" });
    expect(gone.headers.getSetCookie()).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    // The teaser stays free, and the owner pass opens with its own method.
    expect((await d.call(teaser, { drawToken, input: MONEY_INPUT })).status).toBe(200);
    expect((await d.call(owner, { code: "owner-code-for-tests-0001" })).status).toBe(200);
    expect((await d.call(reading, { drawToken, input: MONEY_INPUT })).status).toBe(402);
    expect((await d.call(reading, { drawToken, input: MONEY_INPUT, unlock: { method: "owner" } })).status).toBe(200);
  });

  it("is read and kept on the device only: its chapter takes no follow-up, refused before anything is counted", async () => {
    const d = await member("203.0.113.82");
    const { drawToken } = await drawSelfFlow(d);
    const r = await d.call(reading, { drawToken, input: MONEY_INPUT });
    expect(r.status).toBe(200);
    const spy = vi.spyOn(mockProvider, "generate");
    const f = await d.call(followup, { chapterToken: r.data.chapterToken, reading: r.data.reading, question: "지출은 어떻게 줄이면 좋을까요?" });
    expect(f.status).toBe(409);
    expect(f.data).toMatchObject({ code: "NOT_AVAILABLE", reason: "opening" });
    expect(f.data.message).toContain("오픈 기념 무료 풀이는 내 기록에 보관돼요. 이어서 물어보기는 결제한 풀이에서 할 수 있어요.");
    expect(f.headers.getSetCookie()).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    // A reading opened with the owner pass keeps its follow-ups.
    expect((await d.call(owner, { code: "owner-code-for-tests-0001" })).status).toBe(200);
    const paid = await d.call(reading, { drawToken, input: MONEY_INPUT, unlock: { method: "owner" } });
    expect((await d.call(followup, { chapterToken: paid.data.chapterToken, reading: paid.data.reading, question: "지출은 어떻게 줄이면 좋을까요?" })).status).toBe(200);
  });
});

describe("오늘의 한 장", () => {
  /** This device's id, read from its signed (not encrypted) cookie. */
  const deviceId = (d: ReturnType<typeof device>) => JSON.parse(atob(d.jar.get("sl_daily")!.split(".")[0]!.replace(/-/g, "+").replace(/_/g, "/"))).did as string;
  const getDeal = async (d: ReturnType<typeof device>) => {
    const response = await dailyDealState(new Request("http://localhost/api", {
      headers: { "cf-connecting-ip": "203.0.113.7", cookie: [...d.jar].map(([k, v]) => `${k}=${v}`).join("; ") },
    }));
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair!.indexOf("=");
      d.jar.set(pair!.slice(0, index), pair!.slice(index + 1));
    }
    return { status: response.status, text: await response.clone().text(), data: (await response.json()) as Record<string, any> };
  };

  it("deals three face-down slots before the pick, with no card id anywhere (body or cookie)", async () => {
    const d = device();
    const before = await getDeal(d);
    expect(before.status).toBe(200);
    expect(before.data).toEqual({ deal: [{ index: 0 }, { index: 1 }, { index: 2 }] });
    const deal = await dailyDeal(deviceId(d), "2026-09-30", signingSecret()!);
    const cookiePayload = atob(d.jar.get("sl_daily")!.split(".")[0]!.replace(/-/g, "+").replace(/_/g, "/"));
    for (const c of deal) {
      expect(before.text).not.toContain(c.cardId);
      expect(cookiePayload).not.toContain(c.cardId);
    }
    expect(new Set(deal.map((c) => c.cardId)).size).toBe(3); // a real choice: three distinct cards
    expect((await getDeal(d)).data).toEqual(before.data);
  });

  it("deals deterministically per device and day: the picked slot's card, the same on every request", async () => {
    const d = device();
    await getDeal(d);
    const did = deviceId(d);
    const deal = await dailyDeal(did, "2026-09-30", signingSecret()!);
    expect(await dailyDeal(did, "2026-09-30", signingSecret()!)).toEqual(deal);
    const picked = await d.call(daily, { pick: 2 });
    expect(picked.status).toBe(200);
    expect(picked.data.pick).toBe(2);
    expect(picked.data.card).toMatchObject(deal[2]!);
    expect(picked.data).not.toHaveProperty("cards"); // the other two are never revealed
    for (const other of [deal[0]!, deal[1]!]) if (other.cardId !== deal[2]!.cardId) expect(JSON.stringify(picked.data)).not.toContain(other.cardId);
    // Another device gets its own deal; the next KST day deals again.
    expect(await dailyDeal(`${did}x`, "2026-09-30", signingSecret()!)).not.toEqual(deal);
    expect(await dailyDeal(did, "2026-10-01", signingSecret()!)).not.toEqual(deal);
  });

  it("never re-rolls: a second POST, even with another pick, and a GET return the stored result", async () => {
    const spy = vi.spyOn(mockProvider, "generate");
    const d = device();
    const first = await d.call(daily, { pick: 1 });
    expect(first.status).toBe(200);
    const again = await d.call(daily, { pick: 0 });
    expect(again.data).toEqual(first.data);
    expect(again.data.pick).toBe(1);
    expect((await getDeal(d)).data).toEqual(first.data);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("locks the first pick even when its generation failed", async () => {
    const d = device();
    vi.spyOn(mockProvider, "generate").mockRejectedValueOnce(new GenerationError("UPSTREAM"));
    expect((await d.call(daily, { pick: 2 })).status).toBe(502);
    const retry = await d.call(daily, { pick: 0 });
    expect(retry.status).toBe(200);
    expect(retry.data.pick).toBe(2);
    expect(retry.data.card).toMatchObject((await dailyDeal(deviceId(d), "2026-09-30", signingSecret()!))[2]!);
  });

  it("refuses an invalid pick", async () => {
    const d = device();
    for (const pick of [3, -1, 1.5, "1", null]) expect((await d.call(daily, { pick })).status).toBe(400);
  });

  it("returns the identical fortune all day with a single generation, and a new deal the next KST day", async () => {
    const spy = vi.spyOn(mockProvider, "generate");
    const d = device();
    const first = await d.call(daily, {}); // a client from before the deal: pick 0
    expect(first.status).toBe(200);
    expect(first.data).toMatchObject({ pick: 0, card: { cardId: expect.any(String) }, summary: expect.any(String), areas: { love: expect.any(String), money: expect.any(String), work: expect.any(String) } });
    expect(first.data.summary.replace(/\s/g, "").length).toBeLessThanOrEqual(30);
    expect(first.data.lucky.number).toBeGreaterThanOrEqual(1);
    expect(first.data.lucky.number).toBeLessThanOrEqual(45);

    vi.setSystemTime(T0 + 5 * HOUR);
    const again = await d.call(daily, {});
    expect(again.data).toEqual(first.data);
    expect(spy).toHaveBeenCalledTimes(1);

    const did = deviceId(d);
    expect(first.data.card).toMatchObject((await dailyDeal(did, "2026-09-30", signingSecret()!))[0]!);
    vi.setSystemTime(T0 + 13 * HOUR); // 01:00 KST the next day
    expect((await getDeal(d)).data).toEqual({ deal: [{ index: 0 }, { index: 1 }, { index: 2 }] });
    const tomorrow = await d.call(daily, { pick: 1 });
    expect(tomorrow.status).toBe(200);
    expect(tomorrow.data.card).toMatchObject((await dailyDeal(did, "2026-10-01", signingSecret()!))[1]!);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("generates once for concurrent requests from the same device", async () => {
    const d = device();
    await d.call(daily, {}); // sets this device's cookie
    resetDailyStore();
    const spy = vi.spyOn(mockProvider, "generate");
    const [a, b] = await Promise.all([d.call(daily, {}), d.call(daily, {})]);
    expect(a.status).toBe(200);
    expect(b.data).toEqual(a.data);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("serves the stored fortune even after the generation cap is used up", async () => {
    const d = device();
    const first = await d.call(daily, {});
    resetDailyStore();
    await d.call(daily, {}); // second generation (store lost), cap now reached
    const third = await d.call(daily, {});
    expect(third.status).toBe(200);
    expect(third.data.card).toEqual(first.data.card);
  });

  it("regenerates the same card when nothing is stored, at most twice a day, then answers 429 with the card", async () => {
    const d = device();
    const first = await d.call(daily, {});
    resetDailyStore();
    const second = await d.call(daily, {});
    expect(second.status).toBe(200);
    expect(second.data.card).toEqual(first.data.card);
    resetDailyStore();
    const third = await d.call(daily, {});
    expect(third.status).toBe(429);
    expect(third.data).toMatchObject({ code: "BETA_LIMIT", card: { cardId: first.data.card.cardId, orientation: first.data.card.orientation } });
  });
});

describe("saju", () => {
  const birth = { ...DEFAULT_SAJU_FORM, year: 1995, month: 5, day: 20, timeKnown: true, hour: 14, minute: 5, gender: "male" };

  /** A saju full reading opens with a payment or the owner pass only: these use the pass. */
  async function ownerDevice() {
    const d = device();
    expect((await d.call(owner, { code: "owner-code-for-tests-0001" })).status).toBe(200);
    return d;
  }

  it("writes a teaser and a prologue for a non-sample chart, and follow-ups on it", async () => {
    const d = await ownerDevice();
    const t = await d.call(sajuTeaser, { birth });
    expect(t.status).toBe(200);
    // the 한눈에 보기 card, nine sections (이름표 풀이 and 기운 채우기 since 2026-10-08), the observation
    expect(t.data.lockedToc).toHaveLength(11);
    expect(t.data.lockedToc[0]).toMatch(/^한눈에 보기 · /);
    expect(t.data.lockedToc.at(-1)).toBe("앞으로 몇 주 · 확인해 볼 신호");
    const r = await d.call(sajuReading, { birth, unlock: { method: "owner" } });
    expect(r.status).toBe(200);
    expect(r.data.reading.sections).toHaveLength(9);
    expect(r.data.reading.observation.heading).toBe("앞으로 몇 주 · 확인해 볼 신호");
    expect(Object.keys(r.data.reading.glance)).toEqual(["goesWell", "watchOut", "remedy", "thisYear", "thisYearAction"]);
    expect(r.data.reading).not.toHaveProperty("story");
    const f = await d.call(followup, { chapterToken: r.data.chapterToken, reading: r.data.reading, question: "올해는 무엇을 해 보면 좋을까요?" });
    expect(f.status).toBe(200);
    expect(f.data.remaining).toBe(2);
  });

  it("answers on an older chapter whose token still carries a concern, without that concern in the prompt", async () => {
    const d = await ownerDevice();
    const r = await d.call(sajuReading, { birth, unlock: { method: "owner" } });
    expect(r.status).toBe(200);
    const token = await issueChapter(
      { kind: "saju", birth: BirthBody.parse(birth), profile: { loveStatus: "솔로", concern: "이직이 고민이에요" } },
      r.data.reading, [], signingSecret()!, T0,
    );
    const spy = vi.spyOn(mockProvider, "generate");
    const f = await d.call(followup, { chapterToken: token, reading: r.data.reading, question: "올해는 무엇을 해 보면 좋을까요?" });
    expect(f.status).toBe(200);
    const prompt = spy.mock.calls.at(-1)![0].user;
    expect(prompt).toContain("연애 상태: 솔로");
    expect(prompt).not.toContain("이직이 고민이에요");
  });

  it("rejects a birth date in the future with the form's message", async () => {
    const res = await device().call(sajuTeaser, { birth: { ...birth, year: 2027 } });
    expect(res.status).toBe(400);
    expect(res.data).toMatchObject({ code: "BAD_REQUEST", field: "date" });
  });

  it("carries 윤달 모름 from the body to the chart: 1952 음5-30 is only in the 윤달, so it computes instead of being refused", async () => {
    const lunar = { ...birth, calendar: "lunar", year: 1952, month: 5, day: 30, timeKnown: false, hour: null, minute: null };
    const parsed = BirthBody.parse({ ...lunar, leapMonthUnknown: true });
    expect(parsed).toMatchObject({ leapMonthUnknown: true, isLeapMonth: false });
    const checked = checkSajuForm(parsed, todayInKorea(new Date(T0)));
    expect("chart" in checked && [checked.chart.input.isLeapMonth, checked.chart.lunarDate]).toEqual(["unknown", "1952-윤05-30"]);
    expect((await device("203.0.113.51").call(sajuTeaser, { birth: { ...lunar, leapMonthUnknown: true } })).status).toBe(200);
    // without it the 평달 of that year has no 30th
    const refused = await device("203.0.113.52").call(sajuTeaser, { birth: lunar });
    expect(refused.status).toBe(400);
    expect(refused.data).toMatchObject({ code: "BAD_REQUEST", field: "date" });
  });
});

describe("production configuration", () => {
  it("answers 503 AI_UNAVAILABLE without an API key, never the mock", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_AI", "");
    vi.stubEnv("STARLOG_SIGNING_SECRET", "production-secret-0123456789-0123456789");
    const d = device();
    const { drawToken } = await drawSelfFlow(d);
    for (const handler of [teaser, reading]) {
      const res = await d.call(handler, { drawToken, input: MONEY_INPUT });
      expect(res.status).toBe(503);
      expect(res.data.code).toBe("AI_UNAVAILABLE");
    }
    expect((await d.call(daily, {})).data.code).toBe("AI_UNAVAILABLE");
    expect((await d.call(sajuReading, { birth: DEFAULT_SAJU_FORM })).data.code).toBe("AI_UNAVAILABLE");
  });

  it("answers 503 AI_UNAVAILABLE when the model or effort config is invalid", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("STARLOG_MODEL_TAROT_FULL", "claude-haiku-4-5");
    const d = device();
    const { drawToken } = await drawSelfFlow(d);
    const res = await d.call(reading, { drawToken, input: MONEY_INPUT });
    expect(res.status).toBe(503);
    expect(res.data.code).toBe("AI_UNAVAILABLE");
  });

  it("answers 503 without a signing secret in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_SIGNING_SECRET", "");
    const res = await device().call(draw, { templateId: "self-flow", picks: [1, 2, 3] });
    expect(res.status).toBe(503);
  });
});
