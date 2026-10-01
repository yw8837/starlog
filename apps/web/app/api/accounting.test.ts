import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError, type GenerationHooks } from "@/lib/ai/provider";
import { logKvError, resetDailyStore } from "@/lib/api/dailyStore";
import { clientKey, ipGroup } from "@/lib/api/http";
import { BUDGET_TRIP, SpendLedger, clientCount, resetSpendState, spentTodayKrw } from "@/lib/api/spend";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { kstDay } from "@/lib/security/quota";
import { keyedHash, signToken } from "@/lib/security/sign";
import { POST as daily } from "./tarot/daily/route";
import { POST as draw } from "./tarot/draw/route";
import { POST as followup } from "./followup/route";
import { POST as owner } from "./owner/route";
import { POST as reading } from "./tarot/reading/route";
import { POST as teaser } from "./tarot/teaser/route";
import { POST as sajuTeaser } from "./saju/teaser/route";

type Handler = (request: Request) => Promise<Response>;

const SECRET = "accounting-test-secret-0123456789-abcdef";
const MONEY_INPUT = { topicId: "money", whoId: "me", whenId: "week", question: "", conditions: [], note: "" };

/** A browser-like device (keeps cookies unless `cookieless`) behind one IP. */
function device(ip: string, { cookieless = false } = {}) {
  const jar = new Map<string, string>();
  const request = (body: unknown, accept?: string) => new Request("http://localhost/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": ip,
      cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      ...(accept ? { accept } : {}),
    },
    body: JSON.stringify(body),
  });
  const keep = (response: Response) => {
    if (cookieless) return;
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair!.indexOf("=");
      jar.set(pair!.slice(0, index), pair!.slice(index + 1));
    }
  };
  const call = async (handler: Handler, body: unknown) => {
    const response = await handler(request(body));
    keep(response);
    return { status: response.status, data: (await response.json()) as Record<string, any>, headers: response.headers };
  };
  /** NDJSON, and never POSTs the commit: the client that skips /api/commit. */
  const stream = async (handler: Handler, body: unknown) => {
    const response = await handler(request(body, "application/x-ndjson"));
    keep(response);
    const text = await response.text();
    if (!response.headers.get("content-type")?.includes("ndjson")) return { status: response.status, events: [JSON.parse(text)] };
    return { status: response.status, events: text.trim().split("\n").map((line) => JSON.parse(line) as Record<string, any>) };
  };
  return { call, stream, jar };
}

const drawFor = async (d: ReturnType<typeof device>) => (await d.call(draw, { templateId: "self-flow", picks: [3, 30, 60] })).data.drawToken as string;

/** Usage that the price table prices at 2,800원 (Opus 5.5: 100k output tokens = $2 × 1,400). */
const EXPENSIVE = [{ model: "claude-opus-5-5", inputTokens: 0, outputTokens: 100_000, cacheReadTokens: 0, cacheWriteTokens: 0 }];
/** Half of EXPENSIVE: 1,400원. */
const HALF = [{ ...EXPENSIVE[0]!, outputTokens: 50_000 }];
const spent = async () => Math.round((await spentTodayKrw(Date.now())) ?? -1);

/** The mock provider, reporting `usage` as billed like the real one does. */
function billing(usage = EXPENSIVE) {
  const real = mockProvider.generate.bind(mockProvider);
  return vi.spyOn(mockProvider, "generate").mockImplementation(async (task, attempt, feedback, hooks?: GenerationHooks) => {
    hooks?.onUsage?.(usage);
    return real(task, attempt, feedback, hooks);
  });
}

beforeEach(() => {
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("STARLOG_SIGNING_SECRET", SECRET);
  vi.stubEnv("STARLOG_OWNER_CODE", "owner-code-for-tests-0001");
  vi.stubEnv("KRW_PER_USD", "1400");
  resetMemoryLimiter();
  resetDailyStore();
  resetSpendState();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("server-side day counters (per client network, whatever the cookies say)", () => {
  it("charges the network when a streamed generation starts (no /api/commit needed), and stops it at its limit", async () => {
    vi.stubEnv("BETA_IP_TEASER_PER_DAY", "2");
    const ip = "198.51.100.10";
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const d = device(ip); // a fresh device each time: no cookie carries over
      const drawToken = await drawFor(d);
      const res = await d.stream(teaser, { drawToken, input: MONEY_INPUT });
      statuses.push(res.status === 200 && res.events.at(-1)!.type === "done" ? 200 : (res.events[0]!.code === "BETA_LIMIT" ? 429 : res.status));
    }
    expect(statuses).toEqual([200, 200, 429]);
    // The network is counted under an HMAC of its IP, never the IP itself.
    const hashed = await keyedHash(`client:${ip}`, SECRET);
    expect(await clientCount(hashed, "teaser", Date.now())).toBe(2);
    expect(await clientCount(ip, "teaser", Date.now())).toBe(0);
  });

  it("stops a cookie-less client on the JSON path too, and full readings separately from teasers", async () => {
    vi.stubEnv("BETA_IP_FULL_PER_DAY", "1");
    vi.stubEnv("BETA_FULL_PER_DAY", "100");
    const d = device("198.51.100.11", { cookieless: true });
    const drawToken = await drawFor(d);
    expect((await d.call(reading, { drawToken, input: MONEY_INPUT })).status).toBe(200);
    const limited = await d.call(reading, { drawToken, input: MONEY_INPUT });
    expect(limited.status).toBe(429);
    expect(limited.data).toMatchObject({ code: "BETA_LIMIT", scope: "network" });
    expect(limited.data.message).toContain("와이파이·통신사");
    expect((await d.call(teaser, { drawToken, input: MONEY_INPUT })).status).toBe(200);
  });

  it("charges a failed generation too: it was started and billed (the device cookie still is not spent)", async () => {
    vi.stubEnv("BETA_IP_TEASER_PER_DAY", "2");
    const d = device("198.51.100.12");
    const drawToken = await drawFor(d);
    vi.spyOn(mockProvider, "generate").mockRejectedValueOnce(new GenerationError("UPSTREAM"));
    expect((await d.call(teaser, { drawToken, input: MONEY_INPUT })).status).toBe(502);
    expect(d.jar.has("sl_q")).toBe(false);
    expect((await d.call(teaser, { drawToken, input: MONEY_INPUT })).status).toBe(200);
    expect((await d.call(teaser, { drawToken, input: MONEY_INPUT })).status).toBe(429);
  });

  it("counts a client that disconnects mid-stream: the network charge and the reserved cost both stay", async () => {
    let aborted = false;
    vi.spyOn(mockProvider, "generate").mockImplementation((_task, _attempt, _feedback, hooks?: GenerationHooks) => new Promise((_, reject) => {
      hooks?.onReserve?.(EXPENSIVE); // the real provider reserves before each upstream call
      hooks?.onText?.('{"cards": [{');
      hooks?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new GenerationError("UPSTREAM", ["aborted"]));
      });
    }));
    const ip = "198.51.100.15";
    const d = device(ip);
    const drawToken = await drawFor(d);
    const client = new AbortController();
    const response = await teaser(new Request("http://localhost/api", {
      method: "POST", signal: client.signal,
      headers: { "content-type": "application/json", "cf-connecting-ip": ip, accept: "application/x-ndjson" },
      body: JSON.stringify({ drawToken, input: MONEY_INPUT }),
    }));
    const reader = response.body!.getReader();
    const seen = new TextDecoder().decode((await reader.read()).value);
    expect(seen).toContain('"type":"start"');
    client.abort(); // gone before done: no /api/commit, no cookie
    await vi.waitFor(() => expect(aborted).toBe(true));
    await vi.waitFor(async () => expect(await spent()).toBe(2800));
    expect(await clientCount(await keyedHash(`client:${ip}`, SECRET), "teaser", Date.now())).toBe(1);
  });

  it("shares one counter across an IPv6 /64", async () => {
    vi.stubEnv("BETA_IP_TEASER_PER_DAY", "1");
    const first = device("2001:db8:1:2::a", { cookieless: true });
    const drawToken = await drawFor(first);
    expect((await first.call(teaser, { drawToken, input: MONEY_INPUT })).status).toBe(200);
    const sameNet = device("2001:0db8:0001:0002:ffff:1:2:3", { cookieless: true });
    expect((await sameNet.call(teaser, { drawToken, input: MONEY_INPUT })).status).toBe(429);
    const otherNet = device("2001:db8:1:3::a", { cookieless: true });
    expect((await otherNet.call(teaser, { drawToken, input: MONEY_INPUT })).status).toBe(200);
  });

  it("counts the daily card's generations per network", async () => {
    vi.stubEnv("BETA_IP_DAILY_PER_DAY", "1");
    expect((await device("198.51.100.13").call(daily, {})).status).toBe(200);
    const next = await device("198.51.100.13").call(daily, {});
    expect(next.status).toBe(429);
    expect(next.data.card).toBeDefined();
    expect(next.headers.getSetCookie().filter((c) => c.startsWith("sl_daily=")).length).toBe(1);
  });

  it("leaves the owner out of the network counters", async () => {
    vi.stubEnv("BETA_IP_TEASER_PER_DAY", "1");
    const boss = device("198.51.100.14");
    expect((await boss.call(owner, { code: "owner-code-for-tests-0001" })).status).toBe(200);
    const drawToken = await drawFor(boss);
    for (let i = 0; i < 3; i++) expect((await boss.call(teaser, { drawToken, input: MONEY_INPUT })).status).toBe(200);
  });
});

describe("global daily spend cap", () => {
  it("adds the billed usage of every call and answers 503 to new generations, owner included, at 80% of the budget", async () => {
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "7000"); // trips at 5,600
    expect(BUDGET_TRIP).toBe(0.8);
    billing();
    const d = device("198.51.100.20");
    const drawToken = await drawFor(d);
    expect((await d.call(teaser, { drawToken, input: MONEY_INPUT })).status).toBe(200);
    expect(await spent()).toBe(2800);
    expect((await d.call(teaser, { drawToken, input: MONEY_INPUT })).status).toBe(200);
    expect(await spent()).toBe(5600); // under the budget, at the trip point
    const over = await d.call(teaser, { drawToken, input: MONEY_INPUT });
    expect(over.status).toBe(503);
    expect(over.data).toMatchObject({ code: "AI_UNAVAILABLE", reason: "budget", message: "오늘 준비한 풀이가 모두 나갔어요. 자정에 다시 열려요." });
    expect(Date.parse(over.data.resetsAt)).toBeGreaterThan(Date.now());
    expect((await d.call(sajuTeaser, { birth: DEFAULT_SAJU_FORM })).status).toBe(503);

    const boss = device("198.51.100.21");
    await boss.call(owner, { code: "owner-code-for-tests-0001" });
    const bossDraw = await drawFor(boss);
    expect((await boss.call(teaser, { drawToken: bossDraw, input: MONEY_INPUT })).status).toBe(503);
  });

  it("counts what a failed generation billed", async () => {
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "100000");
    const real = mockProvider.generate.bind(mockProvider);
    vi.spyOn(mockProvider, "generate").mockImplementation(async (task, attempt, feedback, hooks?: GenerationHooks) => {
      hooks?.onUsage?.(EXPENSIVE);
      const result = await real(task, attempt, feedback, hooks);
      return { ...result, data: { ...(result.data as object), firstCard: { heading: "h", body: "짧아요" } } as never };
    });
    const d = device("198.51.100.22");
    const drawToken = await drawFor(d);
    const res = await d.stream(teaser, { drawToken, input: MONEY_INPUT });
    expect(res.events.at(-1)).toMatchObject({ type: "error", body: { code: "QUALITY" } });
    expect(await spent()).toBe(5600); // both attempts
  });

  it("reconciles each call's reservation to its real usage", async () => {
    const real = mockProvider.generate.bind(mockProvider);
    vi.spyOn(mockProvider, "generate").mockImplementation(async (task, attempt, feedback, hooks?: GenerationHooks) => {
      hooks?.onReserve?.(EXPENSIVE);
      const result = await real(task, attempt, feedback, hooks);
      hooks?.onUsage?.(HALF);
      return result;
    });
    const d = device("198.51.100.25");
    const drawToken = await drawFor(d);
    expect((await d.call(teaser, { drawToken, input: MONEY_INPUT })).status).toBe(200);
    expect(await spent()).toBe(1400);
  });

  it("keeps a reservation whose call never reported usage, and adds usage beyond a reservation", async () => {
    const ledger = new SpendLedger();
    ledger.reserve(HALF); // a call cut off: billed for an unknown share
    ledger.reserve(HALF); // next call (e.g. the max_tokens re-call)
    ledger.bill(EXPENSIVE); // used more than reserved
    await ledger.finish();
    expect(await spent()).toBe(1400 + 2800);
  });

  it("releases the reservation of a call that failed before the model began answering", async () => {
    const ledger = new SpendLedger();
    ledger.reserve(EXPENSIVE); // a 529 or credit error before message_start: never billed
    ledger.release();
    ledger.reserve(HALF);
    ledger.bill(HALF);
    await ledger.finish();
    expect(await spent()).toBe(1400);
  });

  it("settles a call into the KST day it was reserved in, across midnight", async () => {
    const beforeMidnight = Date.parse("2026-10-01T14:59:00Z"); // 23:59 KST
    let now = beforeMidnight;
    const ledger = new SpendLedger(() => now);
    ledger.reserve(EXPENSIVE);
    now = beforeMidnight + 2 * 60_000; // 00:01 KST the next day
    ledger.bill(HALF);
    await ledger.finish();
    expect(Math.round((await spentTodayKrw(beforeMidnight)) ?? -1)).toBe(1400);
    expect(Math.round((await spentTodayKrw(now)) ?? -1)).toBe(0);
    expect(kstDay(beforeMidnight)).not.toBe(kstDay(now));
  });

  it("never rejects its write chain, and logs a failure instead", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const ledger = new SpendLedger(() => Number.NaN); // an unusable clock makes the write throw
    ledger.reserve(EXPENSIVE);
    await expect(ledger.finish()).resolves.toBeUndefined();
    expect(errors.mock.calls.some((args: unknown[]) => String(args[0]).includes('"op":"ledger"'))).toBe(true);
  });

  it("serves a stored daily fortune over budget, but generates no new one", async () => {
    const d = device("198.51.100.23");
    expect((await d.call(daily, {})).status).toBe(200);
    vi.stubEnv("BETA_DAILY_BUDGET_KRW", "0");
    expect((await d.call(daily, {})).status).toBe(200);
    expect((await device("198.51.100.24").call(daily, {})).status).toBe(503);
  });
});

describe("follow-ups per chapter, counted server-side", () => {
  it("does not reset the chapter cap when an older chapter token is sent again", async () => {
    vi.stubEnv("BETA_FOLLOWUPS_PER_CHAPTER", "2");
    const d = device("198.51.100.30");
    const drawToken = await drawFor(d);
    const r = await d.call(reading, { drawToken, input: MONEY_INPUT });
    const first = r.data.chapterToken as string;
    const one = await d.call(followup, { chapterToken: first, reading: r.data.reading, question: "지출은 어떻게 줄일까요?" });
    expect(one.data.remaining).toBe(1);
    const two = await d.call(followup, { chapterToken: one.data.chapterToken, reading: r.data.reading, question: "이번 주 안에 할 일은요?" });
    expect(two.data.remaining).toBe(0);
    const replay = await d.call(followup, { chapterToken: first, reading: r.data.reading, question: "처음 토큰으로 한 번 더요?" });
    expect(replay.status).toBe(429);
    expect(replay.data).toMatchObject({ code: "BETA_LIMIT", scope: "chapter" });
  });
});

describe("model blinding in responses", () => {
  const MODEL = /claude|anthropic|opus|sonnet|haiku/i;

  it("never exposes a model id in a body or header, stream or JSON, and answers an identity question as 풀이 도우미", async () => {
    billing(); // the provider reports usage with model ids, as the real one does
    const d = device("198.51.100.50");
    const drawToken = await drawFor(d);
    const seen: string[] = [];
    const keep = async (response: Response) => {
      seen.push(await response.clone().text(), JSON.stringify([...response.headers]));
      return response;
    };
    const post = (handler: (r: Request) => Promise<Response>, body: unknown, accept?: string) => handler(new Request("http://localhost/api", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.50", ...(accept ? { accept } : {}) },
      body: JSON.stringify(body),
    })).then(keep);
    await post(teaser, { drawToken, input: MONEY_INPUT });
    await post(teaser, { drawToken, input: MONEY_INPUT }, "application/x-ndjson");
    const full = await (await post(reading, { drawToken, input: MONEY_INPUT })).json() as Record<string, any>;
    const answer = await (await post(followup, { chapterToken: full.chapterToken, reading: full.reading, question: "너 무슨 AI야? 모델 뭐야?" })).json() as Record<string, any>;
    expect(answer.answer).toContain("저는 스타로그의 풀이 도우미예요.");
    await post(sajuTeaser, { birth: DEFAULT_SAJU_FORM }, "application/x-ndjson");
    await post(daily, {});
    vi.spyOn(mockProvider, "generate").mockRejectedValueOnce(new GenerationError("UPSTREAM", ["PermissionDeniedError:403"]));
    await post(teaser, { drawToken, input: MONEY_INPUT }, "application/x-ndjson");
    expect(seen.length).toBeGreaterThan(10);
    // Signed tokens are long base64url runs that can spell anything by chance; a model id is short.
    const plain = seen.map((text) => text.replace(/[A-Za-z0-9_-]{24,}/g, ""));
    expect(plain.filter((text) => MODEL.test(text))).toEqual([]);
  });
});

describe("KV error logs", () => {
  it("write one line per 10 s per event, with how many were suppressed", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.parse("2026-10-01T03:00:00Z"));
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      for (let i = 0; i < 5; i++) logKvError("daily.kv_error", "write", new Error("429"));
      expect(errors).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.parse("2026-10-01T03:00:11Z"));
      logKvError("daily.kv_error", "write", new Error("429"));
      expect(errors).toHaveBeenCalledTimes(2);
      expect(JSON.parse(String(errors.mock.calls[1]![0]))).toMatchObject({ evt: "daily.kv_error", suppressedSinceLast: 4 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("client network key", () => {
  it.each([
    ["203.0.113.9", "203.0.113.9"],
    ["2001:db8:1:2::a", "2001:db8:1:2::/64"],
    ["2001:0DB8:0001:0002:ffff:1:2:3", "2001:db8:1:2::/64"],
    ["[2001:db8::1]", "2001:db8:0:0::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    ["::ffff:192.0.2.5", "192.0.2.5"],
    ["::ffff:c000:205", "192.0.2.5"],
    ["0:0:0:0:0:ffff:192.0.2.5", "192.0.2.5"],
    ["0000:0000:0000:0000:0000:FFFF:C000:0205", "192.0.2.5"],
    ["::ffff:1.2.3.999", "::ffff:1.2.3.999"],
    ["2001:db8:1:2::192.0.2.5", "2001:db8:1:2::/64"],
    ["::1", "0:0:0:0::/64"],
    ["not-an-ip", "not-an-ip"],
  ])("groups %s as %s", (ip, group) => {
    expect(ipGroup(ip)).toBe(group);
  });

  it("keys requests by that group", () => {
    const req = (ip: string) => new Request("http://localhost/api", { headers: { "cf-connecting-ip": ip } });
    expect(clientKey(req("2001:db8:1:2::a"))).toBe(clientKey(req("2001:db8:1:2:9:9:9:9")));
    expect(clientKey(req("2001:db8:1:2::a"))).not.toBe(clientKey(req("2001:db8:1:3::a")));
    expect(clientKey(new Request("http://localhost/api"))).toBe("local");
    expect(clientKey(req("::ffff:c000:205"))).toBe(clientKey(req("192.0.2.5")));
  });

  it("names a network by a subkey derived from the secret, never the token-signing key itself", async () => {
    const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const direct = Buffer.from(await crypto.subtle.sign("HMAC", raw, new TextEncoder().encode("client:192.0.2.5"))).toString("base64url");
    const id = await keyedHash("client:192.0.2.5", SECRET);
    expect(id).not.toBe(direct);
    expect(id).toBe(await keyedHash("client:192.0.2.5", SECRET));
    expect(id).not.toBe(await keyedHash("client:192.0.2.5", `${SECRET}x`));
  });

  it("does not cache a failed subkey derivation", async () => {
    const secret = `${SECRET}-fresh`;
    await signToken({ k: "warm" }, secret); // the signing key is cached first
    vi.spyOn(crypto.subtle, "importKey").mockRejectedValueOnce(new Error("transient"));
    await expect(keyedHash("client:192.0.2.6", secret)).rejects.toThrow("transient");
    await expect(keyedHash("client:192.0.2.6", secret)).resolves.toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
