import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Gate } from "./http";
import { checkBot } from "./turnstile";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const REFUSED = { code: "BOT_CHECK", message: "보안 확인을 마치지 못했어요. 다시 시도해 주세요.", siteKey: "site-key-1" };

/** checkBot reads only the owner pass from the gate. */
const gate = (owner = false) => ({ owner }) as Gate;

function request(token?: string): Request {
  const headers: Record<string, string> = { "cf-connecting-ip": "203.0.113.7" };
  if (token !== undefined) headers["x-turnstile-token"] = token;
  return new Request("http://localhost/api/tarot/teaser", { method: "POST", headers });
}

/** Siteverify answering `answer` with `status`. */
function siteverify(answer: unknown, status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(answer), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const bodyOf = async (response: Response | null) => (response ? { status: response.status, body: await response.json() } : null);

beforeEach(() => {
  vi.stubEnv("TURNSTILE_SITE_KEY", "site-key-1");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-key-1");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("checkBot (Cloudflare Turnstile)", () => {
  it("is off unless both keys are set: no token asked, Siteverify never called", async () => {
    const fetchMock = siteverify({ success: false });
    for (const [site, secret] of [["", ""], ["site-key-1", ""], ["", "secret-key-1"], ["  ", "secret-key-1"]]) {
      vi.stubEnv("TURNSTILE_SITE_KEY", site);
      vi.stubEnv("TURNSTILE_SECRET_KEY", secret);
      expect(await checkBot(request(), gate()), `${site}/${secret}`).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a missing, blank or oversized token with 403 BOT_CHECK carrying the site key, before Siteverify", async () => {
    const fetchMock = siteverify({ success: true });
    for (const token of [undefined, "", "   ", "x".repeat(2049)]) {
      expect(await bodyOf(await checkBot(request(token), gate())), String(token?.length)).toEqual({ status: 403, body: REFUSED });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Siteverify with the secret, the token and the client IP, and lets a passing token through", async () => {
    const fetchMock = siteverify({ success: true, "error-codes": [], hostname: "starlog.yeolmaeapps.kr" });
    expect(await checkBot(request("token-ok"), gate())).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(SITEVERIFY);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ secret: "secret-key-1", response: "token-ok", remoteip: "203.0.113.7" });
  });

  it("refuses a token Siteverify does not pass (forged, expired or used twice), and logs the codes, never the token", async () => {
    siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] });
    expect(await bodyOf(await checkBot(request("token-used"), gate()))).toEqual({ status: 403, body: REFUSED });
    siteverify({ success: false, "error-codes": ["invalid-input-response"] }, 400);
    expect(await bodyOf(await checkBot(request("token-forged"), gate()))).toEqual({ status: 403, body: REFUSED });
    const logged = vi.mocked(console.info).mock.calls.map((args) => String(args[0])).join("\n");
    expect(logged).toContain("bot_check.refused");
    expect(logged).not.toMatch(/token-used|token-forged|secret-key-1/);
  });

  it("lets the request through, logged, when Siteverify cannot answer: network error, timeout, 5xx, not JSON, its own error or a missing secret", async () => {
    const unreachable: Array<() => unknown> = [
      () => vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed")))),
      () => vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("timed out", "TimeoutError")))),
      () => siteverify({ success: false }, 503),
      () => vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 200 }))),
      () => siteverify({ success: false, "error-codes": ["internal-error"] }),
      () => siteverify({ success: false, "error-codes": ["missing-input-secret"] }, 400),
    ];
    for (const [i, arrange] of unreachable.entries()) {
      arrange();
      expect(await checkBot(request("token-x"), gate()), String(i)).toBeNull();
    }
    const logged = vi.mocked(console.error).mock.calls.map((args) => String(args[0]));
    expect(logged.filter((line) => line.includes("bot_check.unverified"))).toHaveLength(unreachable.length);
    expect(logged.join("\n")).not.toMatch(/token-x|secret-key-1|203\.0\.113\.7/);
  });

  it("refuses, loudly, when Siteverify rejects our secret: a wrong secret must not switch the check off unseen (L-2)", async () => {
    siteverify({ success: false, "error-codes": ["invalid-input-secret"] }, 400);
    expect(await bodyOf(await checkBot(request("token-x"), gate()))).toEqual({ status: 403, body: REFUSED });
    const logged = vi.mocked(console.error).mock.calls.map((args) => String(args[0])).join("\n");
    expect(logged).toContain('"evt":"bot_check.secret_rejected"');
    expect(logged).not.toMatch(/token-x|secret-key-1|203\.0\.113\.7/);
  });

  it("refuses a passing token issued on a host that is not ours, or naming none (L-2)", async () => {
    for (const hostname of ["evil.example", "starlog.yeolmaeapps.kr.evil.example", undefined]) {
      siteverify({ success: true, "error-codes": [], ...(hostname ? { hostname } : {}) });
      expect(await bodyOf(await checkBot(request("token-ok"), gate())), String(hostname)).toEqual({ status: 403, body: REFUSED });
    }
    const logged = vi.mocked(console.warn).mock.calls.map((args) => String(args[0])).join("\n");
    expect(logged).toContain('"evt":"bot_check.refused"');
    expect(logged).toContain('"reason":"hostname"');
  });

  it("lets a passing token through from either production host, or the host the request came to (a local or preview run)", async () => {
    for (const hostname of ["starlog.yeolmaeapps.kr", "yeolmaeapps.kr", "localhost"]) {
      siteverify({ success: true, "error-codes": [], hostname });
      expect(await checkBot(request("token-ok"), gate()), hostname).toBeNull();
    }
  });

  it("skips the owner pass", async () => {
    const fetchMock = siteverify({ success: false });
    expect(await checkBot(request(), gate(true))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Turnstile configuration", () => {
  it("warns once per isolate when only one key is set (by name, never a value); an error in production when the secret is missing", async () => {
    vi.resetModules();
    let { turnstileConfig } = await import("./turnstile");
    expect(turnstileConfig({ TURNSTILE_SITE_KEY: "", TURNSTILE_SECRET_KEY: "" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
    expect(turnstileConfig({ TURNSTILE_SITE_KEY: "", TURNSTILE_SECRET_KEY: "secret-key-1" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(turnstileConfig({ TURNSTILE_SITE_KEY: "", TURNSTILE_SECRET_KEY: "secret-key-1" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(console.warn).mock.calls[0]![0])).toContain("TURNSTILE_SITE_KEY");
    expect(String(vi.mocked(console.warn).mock.calls[0]![0])).not.toContain("secret-key-1");

    vi.resetModules();
    ({ turnstileConfig } = await import("./turnstile"));
    const env = { NODE_ENV: "production", TURNSTILE_SITE_KEY: "site-key-1", TURNSTILE_SECRET_KEY: "" } as unknown as NodeJS.ProcessEnv;
    expect(turnstileConfig(env)).toBeNull();
    expect(turnstileConfig(env)).toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(console.error).mock.calls[0]![0])).toContain("TURNSTILE_SECRET_KEY");

    expect(turnstileConfig({ TURNSTILE_SITE_KEY: " site-key-1 ", TURNSTILE_SECRET_KEY: "secret-key-1" } as unknown as NodeJS.ProcessEnv)).toEqual({
      siteKey: "site-key-1",
      secret: "secret-key-1",
    });
  });
});
