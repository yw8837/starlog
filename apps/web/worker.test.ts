import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * worker.mjs in front of OpenNext's generated handler. `.open-next/worker.js` only exists after
 * `pnpm cf:build`, so the handler is replaced here: these tests are about what the Worker does
 * before (or instead of) handing a request over. The trailing-slash rule is tested against the app's
 * real redirect rules in lib/hostRoutes.test.ts.
 */
const app = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./.open-next/worker.js", () => ({ default: app }));

const { default: worker } = await import("./worker.mjs");

const call = (url: string, init?: RequestInit) => worker.fetch(new Request(url, init), {}, {}) as Promise<Response>;

beforeEach(() => {
  app.fetch.mockReset();
  app.fetch.mockImplementation(async () => new Response("page", { status: 200 }));
});

describe("trailing-slash URLs", () => {
  it("asks the app for the slash-less address first, and returns its redirect as the answer", async () => {
    app.fetch.mockImplementation(async (request: Request) =>
      new URL(request.url).pathname === "/guide/the-hermit"
        ? new Response(null, { status: 308, headers: { location: "https://yeolmaeapps.kr/guide/the-hermit" } })
        : new Response("page"),
    );
    const response = await call("https://starlog.yeolmaeapps.kr/guide/the-hermit/");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://yeolmaeapps.kr/guide/the-hermit");
    expect(app.fetch).toHaveBeenCalledTimes(1);
  });

  it("answers the original request when the slash-less address is a page", async () => {
    const response = await call("https://yeolmaeapps.kr/guide/saju/");
    expect(response.status).toBe(200);
    expect(app.fetch.mock.calls.map(([request]) => (request as Request).url)).toEqual(["https://yeolmaeapps.kr/guide/saju", "https://yeolmaeapps.kr/guide/saju/"]);
  });
});

describe("plain http", () => {
  it.each([
    ["http://yeolmaeapps.kr/", "https://yeolmaeapps.kr/"],
    ["http://starlog.yeolmaeapps.kr/", "https://starlog.yeolmaeapps.kr/"],
    ["http://yeolmaeapps.kr/guide/the-hermit", "https://yeolmaeapps.kr/guide/the-hermit"],
    ["http://starlog.yeolmaeapps.kr/tarot/new?new=1&a=%EA%B0%80", "https://starlog.yeolmaeapps.kr/tarot/new?new=1&a=%EA%B0%80"],
    ["http://yeolmaeapps.kr/guide/the-hermit/", "https://yeolmaeapps.kr/guide/the-hermit/"],
    ["http://yeolmaeapps.kr:8080/robots.txt", "https://yeolmaeapps.kr/robots.txt"],
  ])("%s: 301 to the same address on https, before the app is asked", async (from, to) => {
    const response = await call(from);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(to);
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it("is answered for every method and path, API included", async () => {
    for (const [method, path] of [["GET", "/api/version"], ["HEAD", "/"], ["POST", "/api/tarot/draw"]] as const) {
      const response = await call(`http://starlog.yeolmaeapps.kr${path}`, { method });
      expect(response.status, `${method} ${path}`).toBe(301);
    }
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it("leaves https alone", async () => {
    const response = await call("https://yeolmaeapps.kr/guide/the-hermit");
    expect(response.status).toBe(200);
    expect(app.fetch).toHaveBeenCalledTimes(1);
  });

  it("leaves wrangler dev alone: the preview and e2e reach the Worker as http://starlog.yeolmaeapps.kr/ (Miniflare marks those requests), and a redirect would send them to the live site", async () => {
    const response = await call("http://starlog.yeolmaeapps.kr/guide/the-hermit", { headers: { "mf-original-hostname": "starlog.yeolmaeapps.kr" } });
    expect(response.status).toBe(200);
    expect(app.fetch).toHaveBeenCalledTimes(1);
  });
});
