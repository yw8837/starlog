import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anthropicProxyProvider } from "@/lib/ai/anthropic";
import { FollowUpAnswerSchema } from "@/lib/ai/schemas";

/**
 * starlog-ai (ai-proxy/worker.mjs), the Anthropic API proxy behind the main Worker's AI_PROXY binding.
 * The global fetch stands in for api.anthropic.com and cdn-cgi/trace.
 */
const { default: proxy } = await import("./worker.mjs");

const upstream = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const KEY = "sk-ant-proxy-test";
const call = (path: string, init?: RequestInit, env: Record<string, string> = { ANTHROPIC_API_KEY: KEY }) =>
  proxy.fetch(new Request(`https://api.anthropic.com${path}`, init), env) as Promise<Response>;

beforeEach(() => {
  upstream.mockReset();
  upstream.mockImplementation(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", upstream);
});
afterEach(() => vi.unstubAllGlobals());

describe("forwarding", () => {
  it("sends the call to the API with its own key, the API headers only, the same body, query and abort signal", async () => {
    const controller = new AbortController();
    const body = JSON.stringify({ model: "claude-opus-5-5", stream: true });
    await call("/v1/messages?beta=true", {
      method: "POST",
      body,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "x-api-key": "sk-ant-callers-key",
        authorization: "Bearer callers-token",
        cookie: "starlog=1",
        "x-stainless-retry-count": "0",
      },
    });
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages?beta=true");
    expect(init.method).toBe("POST");
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(body);
    const headers = new Headers(init.headers);
    expect(Object.fromEntries(headers)).toEqual({
      "content-type": "application/json",
      accept: "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "server-side-fallback-2026-07-01",
      "x-api-key": KEY,
    });
    controller.abort();
    expect(init.signal?.aborted).toBe(true);
  });

  it("streams the API's answer back untouched: status, headers and the event stream as it arrives", async () => {
    const events = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode("event: message_start\ndata: {}\n\n"));
        c.close();
      },
    });
    const answer = new Response(events, { status: 200, headers: { "content-type": "text/event-stream", "request-id": "req_1" } });
    upstream.mockResolvedValueOnce(answer);
    const response = await call("/v1/messages", { method: "POST", body: "{}" });
    expect(response).toBe(answer);
    expect(await response.text()).toBe("event: message_start\ndata: {}\n\n");
  });

  it("passes the API's own errors through (a 429 stays a 429 for the SDK's retry)", async () => {
    upstream.mockResolvedValueOnce(new Response('{"type":"error","error":{"type":"rate_limit_error"}}', { status: 429 }));
    expect((await call("/v1/messages", { method: "POST", body: "{}" })).status).toBe(429);
  });

  it("answers 502 in the API's error shape when the API cannot be reached, logging the error class only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    upstream.mockRejectedValueOnce(new TypeError("connect failed to api.anthropic.com sk-ant-secret"));
    const response = await call("/v1/messages", { method: "POST", body: "{}" });
    expect(response.status).toBe(502);
    expect((await response.json()).error.type).toBe("upstream_unreachable");
    expect(log.mock.calls.flat().join(" ")).not.toContain("sk-ant");
    log.mockRestore();
  });
});

describe("a caller that left", () => {
  it("answers without logging an upstream failure when the abort came from the caller", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const controller = new AbortController();
    upstream.mockImplementationOnce(async () => {
      controller.abort();
      throw new DOMException("The operation was aborted", "AbortError");
    });
    const response = await call("/v1/messages", { method: "POST", body: "{}", signal: controller.signal });
    expect(response.status).toBe(499);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("refusals", () => {
  it("forwards nothing without its key", async () => {
    const response = await call("/v1/messages", { method: "POST", body: "{}" }, {});
    expect(response.status).toBe(503);
    expect((await response.json()).error.type).toBe("proxy_not_configured");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses paths the app does not call, and methods other than POST", async () => {
    expect((await call("/v1/models")).status).toBe(404);
    expect((await call("/v1/messages/batches", { method: "POST", body: "{}" })).status).toBe(404);
    expect((await call("/v1/messages")).status).toBe(405);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("/_placement", () => {
  it("reports where it runs and what the API says to a keyless call from there", async () => {
    upstream.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "https://cloudflare.com/cdn-cgi/trace") return new Response("fl=1\nh=cloudflare.com\ncolo=MIA\nloc=KR\n");
      expect(new Headers(init?.headers).has("x-api-key")).toBe(false);
      return new Response('{"type":"error","error":{"type":"authentication_error","message":"x-api-key header is required"}}', { status: 401 });
    });
    const response = await call("/_placement");
    expect(await response.json()).toEqual({ colo: "MIA", anthropic: 401, error: "authentication_error" });
  });

  it("shows a refused region as 403", async () => {
    upstream.mockImplementation(async (url: string) =>
      url.endsWith("/cdn-cgi/trace")
        ? new Response("colo=HKG\n")
        : new Response('{"type":"error","error":{"type":"forbidden","message":"Request not allowed"}}', { status: 403 }),
    );
    expect(await (await call("/_placement")).json()).toEqual({ colo: "HKG", anthropic: 403, error: "forbidden" });
  });
});

describe("end to end: the app's SDK client → AI_PROXY binding → this Worker → the API", () => {
  it("sends what the SDK sends minus its key, with the proxy's key, and streams the reading back", async () => {
    const answer = JSON.stringify({ kind: "clarify", answer: "그림 속 노인은 등불을 높이 들었어요." });
    const sse = [
      { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 9, output_tokens: 1 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: answer } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 7 } },
      { type: "message_stop" },
    ].map((e) => `event: ${e.type}
data: ${JSON.stringify(e)}

`).join("");
    upstream.mockImplementation(async () => new Response(sse, { headers: { "content-type": "text/event-stream" } }));
    // A service binding hands the callee a Request built from the caller's (input, init).
    const binding = { fetch: (input: string | URL | Request, init?: RequestInit) => call(new URL(String(input)).pathname + new URL(String(input)).search, init) };
    const task = { name: "followup" as const, system: "s", user: "u", schema: FollowUpAnswerSchema, effort: "low" as const, maxTokens: 100, mock: () => ({ kind: "clarify" as const, answer: "x" }) };
    const result = await anthropicProxyProvider(binding).generate(task, 1);
    expect(result.data).toEqual(JSON.parse(answer));
    expect(result.usage[0]).toMatchObject({ inputTokens: 9, outputTokens: 7 });
    const [url, init] = upstream.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages?beta=true");
    const headers = new Headers(init.headers);
    expect(headers.get("x-api-key")).toBe(KEY);
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(new TextDecoder().decode(init.body as ArrayBuffer))).toMatchObject({ stream: true, model: "claude-opus-5-5" });
  });
});
