import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
