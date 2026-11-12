import { afterEach, describe, expect, it, vi } from "vitest";
import globalSetup from "@/e2e/global-setup";
import { retryFetch } from "@/e2e/retryFetch";

/**
 * e2e/global-setup.ts's warm-up requests (11/12): on a machine short on memory the dev server dropped a connection
 * (`TypeError: fetch failed … read ECONNRESET`) before any test ran. A request that fails on the network is tried 3 more
 * times after 2, 4 and 8 s; any answer, a 5xx included, comes back at once. Lives here, not in e2e/: vitest skips e2e/.
 */

const URL_ = "http://localhost:3100/";
const networkError = (n: number) => new TypeError(`fetch failed ${n}`, { cause: { code: "ECONNRESET" } });

/** A fetch that throws for the first `failures` calls, then answers `status`; and the pauses it was given. */
function fake(failures: number, status = 200) {
  const urls: string[] = [];
  const pauses: number[] = [];
  const fetchImpl = async (url: URL | string) => {
    urls.push(String(url));
    if (urls.length <= failures) throw networkError(urls.length);
    return new Response("ok", { status });
  };
  const sleep = async (ms: number) => void pauses.push(ms);
  return { urls, pauses, options: { fetchImpl, sleep } };
}

describe("retryFetch (e2e/global-setup.ts warm-up)", () => {
  it("answers on the first try without a pause", async () => {
    const f = fake(0);
    expect((await retryFetch(URL_, f.options)).status).toBe(200);
    expect(f.urls).toEqual([URL_]);
    expect(f.pauses).toEqual([]);
  });

  it("tries again after 2 s and 4 s when the network fails twice", async () => {
    const f = fake(2);
    expect((await retryFetch(URL_, f.options)).status).toBe(200);
    expect(f.urls).toEqual([URL_, URL_, URL_]);
    expect(f.pauses).toEqual([2_000, 4_000]);
  });

  it("throws the last network error after 4 failed tries (2, 4 and 8 s apart)", async () => {
    const f = fake(4);
    await expect(retryFetch(URL_, f.options)).rejects.toThrow("fetch failed 4");
    expect(f.urls).toHaveLength(4);
    expect(f.pauses).toEqual([2_000, 4_000, 8_000]);
  });

  it("returns an HTTP 500 at once, never tried again (the caller decides what it means)", async () => {
    const f = fake(0, 500);
    expect((await retryFetch(URL_, f.options)).status).toBe(500);
    expect(f.urls).toEqual([URL_]);
    expect(f.pauses).toEqual([]);
  });
});

describe("e2e/global-setup.ts keeps its checks: only a network failure is tried again", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const config = { projects: [{ use: { baseURL: URL_ } }] } as never;

  function server(answer: (path: string) => Response) {
    const paths: string[] = [];
    vi.stubEnv("E2E_ALLOW_LIVE", "");
    vi.stubGlobal("fetch", async (url: URL) => {
      paths.push(url.pathname + url.search);
      return answer(url.pathname);
    });
    return paths;
  }

  it("refuses a server that is not in mock mode after one request", async () => {
    const paths = server(() => new Response("ok", { headers: { "x-starlog-dev-provider": "anthropic" } }));
    await expect(globalSetup(config)).rejects.toThrow("not in mock mode (X-Starlog-Dev-Provider: anthropic)");
    expect(paths).toEqual(["/"]);
    const missing = server(() => new Response("ok"));
    await expect(globalSetup(config)).rejects.toThrow("not in mock mode (X-Starlog-Dev-Provider: missing)");
    expect(missing).toEqual(["/"]);
  });

  it("stops at once on a route that answers 5xx", async () => {
    const paths = server((path) => (path === "/tarot/new" ? new Response("boom", { status: 500 }) : new Response("ok", { headers: { "x-starlog-dev-provider": "mock" } })));
    await expect(globalSetup(config)).rejects.toThrow("global-setup: /tarot/new answered 500");
    expect(paths).toEqual(["/", "/", "/?visit=first", "/tarot/new"]);
  });
});
