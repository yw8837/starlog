import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { dailyCard } from "@/lib/security/drawToken";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { POST as daily } from "./tarot/daily/route";
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
  resetMemoryLimiter();
  resetDailyStore();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
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
    const d = device();
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

    let token = r.data.chapterToken as string;
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

  it("rejects a tampered or expired draw token and a reading that does not match its chapter token", async () => {
    const d = device();
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
    expect(res.data.message).toContain("109");
    expect(d.jar.has("sl_q")).toBe(false);
  });
});

describe("quota", () => {
  it("stops at the daily full-reading limit and opens again after KST midnight; no quota spent on failure", async () => {
    vi.stubEnv("BETA_FULL_PER_DAY", "1");
    const d = device();
    const { drawToken } = await drawSelfFlow(d);
    expect((await d.call(reading, { drawToken, input: MONEY_INPUT })).status).toBe(200);
    const limited = await d.call(reading, { drawToken, input: MONEY_INPUT });
    expect(limited.status).toBe(429);
    expect(limited.data).toMatchObject({ code: "BETA_LIMIT", resetsAt: "2026-09-30T15:00:00.000Z" });

    vi.setSystemTime(Date.parse("2026-09-30T15:00:01Z")); // 00:00:01 KST the next day
    const next = await drawSelfFlow(d);
    expect((await d.call(reading, { drawToken: next.drawToken, input: MONEY_INPUT })).status).toBe(200);
  });

  it("lets the owner pass skip every quota; a wrong code sets nothing and login attempts are rate limited", async () => {
    vi.stubEnv("BETA_FULL_PER_DAY", "0");
    const d = device("198.51.100.1");
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

  it("rate limits generation per IP", async () => {
    const d = device("192.0.2.50");
    const { drawToken } = await drawSelfFlow(d);
    vi.stubEnv("BETA_TEASER_PER_DAY", "1000");
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await d.call(teaser, { drawToken, input: MONEY_INPUT })).status;
    expect(last).toBe(429);
  });

  it("limits full readings to 5 a minute per IP (25 for the owner), on top of the daily quota", async () => {
    vi.stubEnv("BETA_FULL_PER_DAY", "100");
    const d = device("192.0.2.60");
    const { drawToken } = await drawSelfFlow(d);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await d.call(reading, { drawToken, input: MONEY_INPUT })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    vi.setSystemTime(T0 + 61_000);
    expect((await d.call(reading, { drawToken, input: MONEY_INPUT })).status).toBe(200);

    const boss = device("192.0.2.61");
    expect((await boss.call(owner, { code: "owner-code-for-tests-0001" })).status).toBe(200);
    const bossDraw = await drawSelfFlow(boss);
    for (let i = 0; i < 6; i++) expect((await boss.call(reading, { drawToken: bossDraw.drawToken, input: MONEY_INPUT })).status).toBe(200);
  });
});

describe("chapter tokens", () => {
  it("expire 7 days after the reading; follow-ups keep the original expiry", async () => {
    const d = device();
    const { drawToken } = await drawSelfFlow(d);
    const r = await d.call(reading, { drawToken, input: MONEY_INPUT });
    vi.setSystemTime(T0 + 6 * 24 * HOUR);
    const f = await d.call(followup, { chapterToken: r.data.chapterToken, reading: r.data.reading, question: "지출은 어떻게 줄이면 좋을까요?" });
    expect(f.status).toBe(200);
    vi.setSystemTime(T0 + 7 * 24 * HOUR + 1);
    const late = await d.call(followup, { chapterToken: f.data.chapterToken, reading: r.data.reading, question: "하나 더 물어봐도 될까요?" });
    expect(late.status).toBe(400);
    expect(late.data.code).toBe("BAD_TOKEN");
  });
});

describe("오늘의 한 장", () => {
  it("returns the identical fortune all day with a single generation, and a new card the next KST day", async () => {
    const spy = vi.spyOn(mockProvider, "generate");
    const d = device();
    const first = await d.call(daily, {});
    expect(first.status).toBe(200);
    expect(first.data).toMatchObject({ card: { cardId: expect.any(String) }, summary: expect.any(String), areas: { love: expect.any(String), money: expect.any(String), work: expect.any(String) } });
    expect(first.data.summary.replace(/\s/g, "").length).toBeLessThanOrEqual(30);
    expect(first.data.lucky.number).toBeGreaterThanOrEqual(1);
    expect(first.data.lucky.number).toBeLessThanOrEqual(45);

    vi.setSystemTime(T0 + 5 * HOUR);
    const again = await d.call(daily, {});
    expect(again.data).toEqual(first.data);
    expect(spy).toHaveBeenCalledTimes(1);

    // The card is fixed by the device id and the KST day (dailyCard; "changes the next day" is pinned in
    // security.test.ts with a fixed id). Read this device's id from its signed cookie.
    const did = JSON.parse(atob(d.jar.get("sl_daily")!.split(".")[0]!.replace(/-/g, "+").replace(/_/g, "/"))).did as string;
    expect(first.data.card).toMatchObject(dailyCard(did, "2026-09-30"));
    vi.setSystemTime(T0 + 13 * HOUR); // 01:00 KST the next day
    const tomorrow = await d.call(daily, {});
    expect(tomorrow.status).toBe(200);
    expect(tomorrow.data.card).toMatchObject(dailyCard(did, "2026-10-01"));
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

  it("writes a teaser and a prologue for a non-sample chart, and follow-ups on it", async () => {
    const d = device();
    const t = await d.call(sajuTeaser, { birth });
    expect(t.status).toBe(200);
    expect(t.data.lockedToc).toHaveLength(7);
    const r = await d.call(sajuReading, { birth });
    expect(r.status).toBe(200);
    expect(r.data.reading.sections).toHaveLength(7);
    const f = await d.call(followup, { chapterToken: r.data.chapterToken, reading: r.data.reading, question: "올해는 무엇을 해 보면 좋을까요?" });
    expect(f.status).toBe(200);
    expect(f.data.remaining).toBe(2);
  });

  it("rejects a birth date in the future with the form's message", async () => {
    const res = await device().call(sajuTeaser, { birth: { ...birth, year: 2027 } });
    expect(res.status).toBe(400);
    expect(res.data).toMatchObject({ code: "BAD_REQUEST", field: "date" });
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

  it("answers 503 without a signing secret in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_SIGNING_SECRET", "");
    const res = await device().call(draw, { templateId: "self-flow", picks: [1, 2, 3] });
    expect(res.status).toBe(503);
  });
});
