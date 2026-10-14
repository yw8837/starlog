import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@/lib/ai/mock";
import { GenerationError, type GenerationHooks } from "@/lib/ai/provider";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { respondGeneration } from "@/lib/api/stream";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { ownerCookie } from "@/lib/security/owner";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { POST as commit } from "./commit/route";
import { POST as daily } from "./tarot/daily/route";
import { POST as draw } from "./tarot/draw/route";
import { POST as reading } from "./tarot/reading/route";
import { POST as teaser } from "./tarot/teaser/route";
import { POST as sajuReading } from "./saju/reading/route";
import { POST as sajuTeaser } from "./saju/teaser/route";

type Handler = (request: Request) => Promise<Response>;
type Event = Record<string, any> & { type: string };

const MONEY_INPUT = {
  topicId: "money", whoId: "me", whenId: "week", question: "",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }, { label: "관심 방향", value: "지출 줄이기" }],
  note: "이번 달 카드값이 많이 나왔어요",
};

/** A device that keeps cookies; `stream` reads an NDJSON response to the end. */
function device(ip = "203.0.113.20") {
  const jar = new Map<string, string>();
  const keep = (response: Response) => {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair!.indexOf("=");
      jar.set(pair!.slice(0, index), pair!.slice(index + 1));
    }
  };
  const request = (body: unknown, init: { accept?: string; signal?: AbortSignal } = {}) => new Request("http://localhost/api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": ip,
      cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      ...(init.accept ? { accept: init.accept } : {}),
    },
    body: JSON.stringify(body),
    ...(init.signal ? { signal: init.signal } : {}),
  });
  const call = async (handler: Handler, body: unknown) => {
    const response = await handler(request(body));
    keep(response);
    return { status: response.status, data: (await response.json()) as Record<string, any> };
  };
  const stream = async (handler: Handler, body: unknown) => {
    const response = await handler(request(body, { accept: "application/x-ndjson" }));
    keep(response);
    const text = await response.text();
    return { response, events: text.trim().split("\n").map((line) => JSON.parse(line) as Event) };
  };
  return { jar, call, stream, request };
}

async function drawSelfFlow(d: ReturnType<typeof device>) {
  return (await d.call(draw, { templateId: "self-flow", picks: [3, 30, 60] })).data as { drawToken: string };
}

beforeEach(() => {
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  resetMemoryLimiter();
  resetDailyStore();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("NDJSON streaming", () => {
  it("streams start → sections → done, and done carries exactly the JSON body", async () => {
    const d = device();
    const { drawToken } = await drawSelfFlow(d);
    const plain = await device("203.0.113.21").call(teaser, { drawToken, input: MONEY_INPUT });
    const { response, events } = await d.stream(teaser, { drawToken, input: MONEY_INPUT });
    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(events[0]).toEqual({ type: "start" });
    expect(events.at(-1)!.type).toBe("done");
    const sections = events.filter((e) => e.type === "section").map((e) => `${e.key}#${e.index}`);
    expect(sections).toEqual(["cards#0", "cards#1", "cards#2", "firstCard#0", "secondCard#0"]);
    // the seal is sealed afresh each time (a random IV); the rest is the very same body
    const { seal, ...rest } = events.at(-1)!.data as Record<string, unknown>;
    const { seal: plainSeal, ...plainRest } = plain.data as Record<string, unknown>;
    expect(rest).toEqual(plainRest);
    expect([typeof seal, typeof plainSeal]).toEqual(["string", "string"]);
    expect(JSON.stringify(events.filter((e) => e.type === "section"))).not.toContain(plain.data.firstCard.body.slice(0, 10));
  });

  it("spends the free first reading through /api/commit after done; a stale commit changes nothing", async () => {
    const d = device("203.0.113.22");
    const { drawToken } = await drawSelfFlow(d);
    const first = await d.stream(reading, { drawToken, input: MONEY_INPUT });
    const done = first.events.at(-1)!;
    expect(done.type).toBe("done");
    expect(typeof done.commit).toBe("string");
    expect(d.jar.has("sl_first")).toBe(false); // nothing spent by the stream itself
    expect((await d.call(commit, { commit: done.commit })).status).toBe(200);
    expect(d.jar.has("sl_first")).toBe(true);
    expect((await d.call(commit, { commit: done.commit })).data.code).toBe("BAD_TOKEN"); // replay after the cookie moved on
    const limited = await d.call(reading, { drawToken, input: MONEY_INPUT });
    expect(limited.status).toBe(429);
  });

  it("emits retry when the validated draft fails and the regeneration starts", async () => {
    const real = mockProvider.generate.bind(mockProvider);
    vi.spyOn(mockProvider, "generate").mockImplementationOnce(async (task, attempt, feedback, hooks?: GenerationHooks) => {
      const result = await real(task, attempt, feedback, hooks);
      return { ...result, data: { ...(result.data as object), summary: "짧아요" } as never };
    });
    const { events } = await device("203.0.113.23").stream(sajuTeaser, { birth: DEFAULT_SAJU_FORM });
    expect(events.map((e) => (e.type === "section" ? `section:${e.key}` : e.type))).toEqual([
      "start", "section:title", "section:summary", "retry", "section:title", "section:summary", "done",
    ]);
    expect(events.find((e) => e.type === "retry")).toEqual({ type: "retry", reason: "quality" });
  });

  it("streams the 정통 reading's nine sections once each, 7·8절 from their own call included, and done carries all nine", async () => {
    // A saju full reading opens with a payment or the owner pass only.
    vi.stubEnv("STARLOG_OWNER_CODE", "owner-code-for-tests-0001");
    const d = device("203.0.113.29");
    d.jar.set("sl_owner", await ownerCookie(signingSecret()!, Date.now(), "owner-code-for-tests-0001"));
    const { events } = await d.stream(sajuReading, { birth: DEFAULT_SAJU_FORM, unlock: { method: "owner" } });
    const indexes = events.filter((e) => e.type === "section" && e.key === "sections").map((e) => e.index as number);
    expect([...indexes].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const done = events.at(-1)!;
    expect(done.type).toBe("done");
    expect(done.data.reading.sections.map((s: { heading: string }) => s.heading)).toEqual([...SAJU_PROLOGUE_SECTIONS]);
  });

  it("reports a failure after the stream started as an error event with the JSON status and body", async () => {
    vi.spyOn(mockProvider, "generate").mockRejectedValue(new GenerationError("REFUSED"));
    const d = device("203.0.113.24");
    const { drawToken } = await drawSelfFlow(d);
    const { response, events } = await d.stream(teaser, { drawToken, input: MONEY_INPUT });
    expect(response.status).toBe(200);
    expect(events.map((e) => e.type)).toEqual(["start", "error"]);
    expect(events[1]).toMatchObject({ status: 422, body: { code: "REFUSED" } });
    expect(d.jar.has("sl_q")).toBe(false);
  });

  it("answers input errors before streaming as plain JSON", async () => {
    const d = device("203.0.113.25");
    const response = await teaser(d.request({ drawToken: "nope", input: MONEY_INPUT }, { accept: "application/x-ndjson" }));
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("aborts the upstream generation when the client disconnects", async () => {
    let aborted = false;
    vi.spyOn(mockProvider, "generate").mockImplementation((_task, _attempt, _feedback, hooks?: GenerationHooks) => new Promise((_, reject) => {
      hooks?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new GenerationError("UPSTREAM", ["aborted"]));
      });
    }));
    const d = device("203.0.113.26");
    const { drawToken } = await drawSelfFlow(d);
    const client = new AbortController();
    const response = await reading(d.request({ drawToken, input: MONEY_INPUT }, { accept: "application/x-ndjson", signal: client.signal }));
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(JSON.parse(first.split("\n")[0]!)).toEqual({ type: "start" });
    client.abort();
    await vi.waitFor(() => expect(aborted).toBe(true));
  });

  it("aborts upstream when the reader cancels the stream", async () => {
    let aborted = false;
    vi.spyOn(mockProvider, "generate").mockImplementation((_task, _attempt, _feedback, hooks?: GenerationHooks) => new Promise((_, reject) => {
      hooks?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new GenerationError("UPSTREAM", ["aborted"]));
      });
    }));
    const d = device("203.0.113.27");
    const { drawToken } = await drawSelfFlow(d);
    const response = await teaser(d.request({ drawToken, input: MONEY_INPUT }, { accept: "application/x-ndjson" }));
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await vi.waitFor(() => expect(aborted).toBe(true));
  });

  it("sets the daily device cookie on the stream and commits only the generation count", async () => {
    const d = device("203.0.113.28");
    const first = await d.stream(daily, {});
    expect(d.jar.has("sl_daily")).toBe(true);
    const done = first.events.at(-1)!;
    expect(done.type).toBe("done");
    expect((await d.call(commit, { commit: done.commit })).status).toBe(200);
    const again = await d.stream(daily, {});
    expect(again.events.at(-1)).toMatchObject({ type: "done", data: done.data });
    expect(again.events.at(-1)!.commit).toBeUndefined(); // stored: nothing to spend
  });
});

describe("respondGeneration timing", () => {
  const gate = { secret: "test-secret-0123456789-0123456789-abcdef", provider: mockProvider, owner: false, now: Date.now(), cookies: {}, client: "test-client" };
  const ndjson = (signal?: AbortSignal) => new Request("http://localhost/api", { method: "POST", headers: { accept: "application/x-ndjson" }, ...(signal ? { signal } : {}) });
  const eventsOf = async (response: Response) => (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as Event);

  it("pings while the generation waits", async () => {
    const response = await respondGeneration(ndjson(), async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { body: { ok: true }, cookies: [] };
    }, { gate, pingMs: 15 });
    const events = await eventsOf(response);
    expect(events.filter((e) => e.type === "ping").length).toBeGreaterThanOrEqual(1);
    expect(events.at(-1)).toEqual({ type: "done", data: { ok: true } });
  });

  it("aborts at the generation budget and reports UPSTREAM", async () => {
    const response = await respondGeneration(ndjson(), (hooks) => new Promise((_, reject) => {
      hooks.signal?.addEventListener("abort", () => reject(new GenerationError("UPSTREAM", ["timeout"])));
    }), { gate, budgetMs: 20 });
    const events = await eventsOf(response);
    expect(events.at(-1)).toMatchObject({ type: "error", status: 502, body: { code: "UPSTREAM" } });
  });

  it("answers plain JSON without the NDJSON accept header", async () => {
    const response = await respondGeneration(new Request("http://localhost/api", { method: "POST" }), async () => ({ body: { ok: 1 }, cookies: [] }), { gate });
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: 1 });
  });
});
