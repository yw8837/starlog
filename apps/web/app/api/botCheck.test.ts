import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { setTestDb } from "@/lib/db";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { openerCookies, useTestDb } from "@/lib/testing/p4";
import { POST as owner } from "./owner/route";
import { POST as premiumTeaser } from "./premium/tarot-deep/teaser/route";
import { POST as sajuReading } from "./saju/reading/route";
import { POST as sajuTeaser } from "./saju/teaser/route";
import { POST as daily } from "./tarot/daily/route";
import { POST as draw } from "./tarot/draw/route";
import { POST as reading } from "./tarot/reading/route";
import { POST as teaser } from "./tarot/teaser/route";

/**
 * Turnstile on (both keys set): the free generations that cost model money ask for a browser check
 * before anything is generated or counted. Siteverify is stubbed: it passes the token "human" only.
 */

type Handler = (request: Request) => Promise<Response>;

function device(ip = "203.0.113.7") {
  const jar = new Map<string, string>();
  const call = async (handler: Handler, body: unknown, token?: string) => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "cf-connecting-ip": ip,
      origin: "http://localhost",
      cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    };
    if (token) headers["x-turnstile-token"] = token;
    const response = await handler(new Request("http://localhost/api", { method: "POST", headers, body: JSON.stringify(body) }));
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair!.indexOf("=");
      jar.set(pair!.slice(0, index), pair!.slice(index + 1));
    }
    return { status: response.status, data: (await response.json()) as Record<string, any> };
  };
  return { call, jar };
}

/** A device logged in to an account of its own: 오픈 기념 무료 opens once per logged-in account (owner 2026-10-27). */
async function member(ip?: string) {
  const d = device(ip);
  for (const [name, value] of await openerCookies()) d.jar.set(name, value);
  return d;
}

const INPUT = {
  topicId: "money", whoId: "me", whenId: "week",
  question: "이번 주, 나의 재물 흐름은 어떨까",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }],
  note: "이번 달 카드값이 많이 나왔어요",
};
const BIRTH = { ...DEFAULT_SAJU_FORM, year: 1995, month: 5, day: 20, timeKnown: true, hour: 14, minute: 5, gender: "male" };
const REFUSED = { code: "BOT_CHECK", message: "보안 확인을 마치지 못했어요. 다시 시도해 주세요.", siteKey: "site-key-1" };

let siteverify: ReturnType<typeof vi.fn>;
let db: ReturnType<typeof useTestDb>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-09-30T03:00:00Z")); // 12:00 KST, while 오픈 기념 무료 runs
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("STARLOG_OWNER_CODE", "owner-code-for-tests-0001");
  vi.stubEnv("TURNSTILE_SITE_KEY", "site-key-1");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key-1");
  // 오픈 기념 무료 needs an account (member): sign-up open, mock Kakao, a test D1.
  vi.stubEnv("STARLOG_PAYMENTS", "on");
  vi.stubEnv("STARLOG_KAKAO", "mock");
  db = useTestDb();
  siteverify = vi.fn(async (_url: string, init?: RequestInit) => {
    const passed = (JSON.parse(String(init?.body)) as { response: string }).response === "human";
    // Siteverify names the host the challenge ran on: these requests come to localhost.
    return Response.json({ success: passed, "error-codes": passed ? [] : ["invalid-input-response"], ...(passed ? { hostname: "localhost" } : {}) });
  });
  vi.stubGlobal("fetch", siteverify);
  resetMemoryLimiter();
  resetDailyStore();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setTestDb(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function drawn(d: ReturnType<typeof device>): Promise<string> {
  const res = await d.call(draw, { templateId: "self-flow", picks: [3, 30, 60] });
  expect(res.status).toBe(200);
  return res.data.drawToken as string;
}

describe("bot check on the free generations", () => {
  it("refuses 타로 첫 장, 사주 미리보기, 오늘의 한 장 and 오픈 기념 무료 without a passing token: nothing generated, nothing counted", async () => {
    const generate = vi.spyOn(mockProvider, "generate");
    const d = await member();
    const drawToken = await drawn(d);
    const calls: Array<[string, Handler, unknown]> = [
      ["tarot teaser", teaser, { drawToken, input: INPUT }],
      ["saju teaser", sajuTeaser, { birth: BIRTH }],
      ["daily", daily, { pick: 0 }],
      ["opening reading", reading, { drawToken, input: INPUT }],
    ];
    for (const [name, handler, body] of calls) {
      for (const token of [undefined, "a-script"]) {
        const res = await d.call(handler, body, token);
        expect({ status: res.status, data: res.data }, `${name} ${token}`).toEqual({ status: 403, data: REFUSED });
      }
    }
    expect(generate).not.toHaveBeenCalled();
    expect([...d.jar.keys()].filter((name) => ["sl_q", "sl_first", "sl_daily"].includes(name))).toEqual([]);
    // The account's 오픈 기념 무료 is not held either.
    expect(await db.prepare("SELECT COUNT(*) AS n FROM opening_claims").first()).toEqual({ n: 0 });
  });

  it("lets a browser with a passing token through, one Siteverify call per request", async () => {
    const d = await member();
    const drawToken = await drawn(d);
    siteverify.mockClear();
    expect((await d.call(teaser, { drawToken, input: INPUT }, "human")).status).toBe(200);
    expect((await d.call(sajuTeaser, { birth: BIRTH }, "human")).status).toBe(200);
    expect((await d.call(daily, { pick: 1 }, "human")).status).toBe(200);
    expect((await d.call(reading, { drawToken, input: INPUT }, "human")).status).toBe(200);
    expect(siteverify).toHaveBeenCalledTimes(4);
  });

  it("guards the premium previews too (checked before the product or the body)", async () => {
    const res = await device().call(premiumTeaser, {});
    expect({ status: res.status, data: res.data }).toEqual({ status: 403, data: REFUSED });
  });

  it("asks nothing of the owner pass, nor of openings that are not free", async () => {
    const d = await member("198.51.100.1");
    expect((await d.call(owner, { code: "owner-code-for-tests-0001" })).status).toBe(200);
    const drawToken = await drawn(d);
    siteverify.mockClear();
    expect((await d.call(teaser, { drawToken, input: INPUT })).status).toBe(200);
    expect((await d.call(reading, { drawToken, input: INPUT })).status).toBe(200);
    expect((await d.call(sajuReading, { birth: BIRTH, unlock: { method: "owner" } })).status).toBe(200);
    expect(siteverify).not.toHaveBeenCalled();
    // A paid saju reading without the pass is refused for payment, not for a bot check.
    expect((await device("198.51.100.2").call(sajuReading, { birth: BIRTH })).data).toMatchObject({ code: "PAYMENT_REQUIRED" });
  });
});
