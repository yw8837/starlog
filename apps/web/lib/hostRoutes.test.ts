import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "@/next.config";
import { SITE } from "./config";
import { guideIndexPath } from "./guide";
import { hostHeaders, hostRedirects, hostRewrites } from "./hostRoutes";

/**
 * The host rules as production runs them. `next build` turns next.config.ts into the entries of
 * routes-manifest.json (Next's own loader and builder run here), and two matchers apply them the way
 * the two runtimes do: Next's server (resolve-routes.js), and the OpenNext Worker, which has its own
 * copy of the logic (@opennextjs/aws 4.1.6, core/routing/matcher.js: the host regex is tested
 * unanchored and with the port, the manifest regex is tested case-sensitively while the params come
 * from path-to-regexp case-insensitively, a source that matched nothing leaves its params unfilled,
 * the destination is compiled with path-to-regexp's strict segment check, and of the header entries
 * that match, the last one wins a key). A rule has to give the same answer in both, because Next
 * never runs in production: only the Worker does.
 *
 * The rules exist only in the deploy build, NEXT_PUBLIC_SPLIT_HOSTS=1: `wrangler dev`, and so the
 * OpenNext preview and e2e, hands the Worker every request with the first route's host (starlog).
 */

const FLAG = "NEXT_PUBLIC_SPLIT_HOSTS";
const APEX = new URL(SITE.guideUrl).host;
const STARLOG = new URL(SITE.url).host;
const HSTS = "Strict-Transport-Security";
const APP_HSTS = "max-age=63072000; includeSubDomains";
const APEX_HSTS = "max-age=63072000";

const nodeRequire = createRequire(import.meta.url);

type Has = { type: string; key?: string; value?: string };
type Params = Record<string, string | string[]>;
/** One redirect or rewrite of routes-manifest.json, as `next build` writes it. */
interface Entry {
  source: string;
  destination: string;
  regex: string;
  has?: Has[];
  missing?: Has[];
  internal?: boolean;
  statusCode?: number;
}
/** One header entry of routes-manifest.json. */
interface HeaderEntry {
  source: string;
  regex: string;
  headers: Array<{ key: string; value: string }>;
  has?: Has[];
  missing?: Has[];
}

const { default: loadCustomRoutes } = nodeRequire("next/dist/lib/load-custom-routes") as {
  default: (config: unknown) => Promise<{ headers: object[]; redirects: object[]; rewrites: { beforeFiles: object[] } }>;
};
const { buildCustomRoute } = nodeRequire("next/dist/lib/build-custom-route") as {
  buildCustomRoute: (type: "redirect" | "rewrite" | "header", route: object, restrictedRedirectPaths?: string[]) => Entry;
};
const { getPathMatch } = nodeRequire("next/dist/shared/lib/router/utils/path-match") as {
  getPathMatch: (source: string, options: { removeUnnamedParams: boolean; strict: boolean; regexModifier: (regex: string) => string }) => (pathname: string) => false | Params;
};
const { modifyRouteRegex } = nodeRequire("next/dist/lib/redirect-status") as {
  modifyRouteRegex: (regex: string, restrictedPaths?: string[]) => string;
};

/** A custom route's matcher, built the way Next's server builds it (server/lib/router-utils/filesystem.js buildCustomRoute). */
const nextMatcher = (source: string, type: "redirect" | "rewrite" | "header") =>
  getPathMatch(source, { strict: true, removeUnnamedParams: true, regexModifier: (regex) => modifyRouteRegex(regex, type === "redirect" ? ["/_next"] : undefined) });
const { compileNonPath, matchHas, prepareDestination } = nodeRequire("next/dist/shared/lib/router/utils/prepare-destination") as {
  compileNonPath: (value: string, params: Params) => string;
  matchHas: (req: { headers: { host: string } }, query: object, has?: Has[], missing?: Has[]) => false | Params;
  prepareDestination: (args: { appendParamsToQuery: boolean; destination: string; params: Params; query: object }) => {
    parsedDestination: { origin?: string | null; pathname: string };
  };
};
const { match, compile } = nodeRequire("next/dist/compiled/path-to-regexp") as {
  match: (source: string) => (pathname: string) => false | { params: Params };
  compile: (destination: string) => (params: Params) => string;
};

/** routes-manifest.json as `next build` writes it with NEXT_PUBLIC_SPLIT_HOSTS set to `flag`. */
async function buildManifest(flag: string) {
  vi.stubEnv(FLAG, flag);
  try {
    const custom = await loadCustomRoutes(nextConfig);
    return {
      redirects: custom.redirects.map((route) => buildCustomRoute("redirect", route, ["/_next"])),
      beforeFiles: custom.rewrites.beforeFiles.map((route) => buildCustomRoute("rewrite", route)),
      headers: custom.headers.map((route) => buildCustomRoute("header", route) as unknown as HeaderEntry),
    };
  } finally {
    vi.unstubAllEnvs();
  }
}

/** The deploy build. */
const SPLIT = await buildManifest("1");
/** Every other build: next dev, the OpenNext preview, e2e. */
const LOCAL = await buildManifest("");

type Outcome = { status?: number; to: string } | null;

/** OpenNext's host check (routeHasMatcher): the value as a regex against the Host header as it came, port included. */
const hostPasses = (has: Has[] | undefined, host: string) => (has ?? []).every((item) => item.type === "host" && host !== "" && new RegExp(item.value ?? "").test(host));

/** Next's server: its matcher, matchHas, prepareDestination, in manifest order. */
function viaNext(entries: Entry[], host: string, pathname: string): Outcome {
  for (const entry of entries) {
    if (entry.internal) continue;
    const params = nextMatcher(entry.source, entry.statusCode ? "redirect" : "rewrite")(pathname);
    if (!params) continue;
    const hasParams = matchHas({ headers: { host } }, {}, entry.has, entry.missing);
    if (!hasParams) continue;
    const { parsedDestination } = prepareDestination({ appendParamsToQuery: false, destination: entry.destination, params: { ...params, ...hasParams }, query: {} });
    return { status: entry.statusCode, to: `${parsedDestination.origin ?? ""}${parsedDestination.pathname}` };
  }
  return null;
}

/** The OpenNext Worker: the first entry whose regex and host regex pass, params from `match`, destination from `compile`. */
function viaOpenNext(entries: Entry[], host: string, pathname: string): Outcome {
  const entry = entries.find((candidate) => !candidate.internal && new RegExp(candidate.regex).test(pathname) && hostPasses(candidate.has, host));
  if (!entry) return null;
  const external = /^(https?:\/\/[^/\s?]+)(\/[^?]*)?/.exec(entry.destination);
  const destination = external ? (external[2] ?? "") : entry.destination;
  const matched = match(entry.source)(pathname);
  const params = matched ? matched.params : {};
  const to = Object.keys(params).length > 0 ? compile(destination)(params) : destination;
  return { status: entry.statusCode, to: `${external?.[1] ?? ""}${to}` };
}

type HeaderMap = Record<string, string>;

/** Next's server (resolve-routes.js): every matching entry in order, a later value for a key replacing an earlier one. */
function headersViaNext(entries: HeaderEntry[], host: string, pathname: string): HeaderMap {
  const out: HeaderMap = {};
  for (const entry of entries) {
    const params = nextMatcher(entry.source, "header")(pathname);
    if (!params || !matchHas({ headers: { host } }, {}, entry.has, entry.missing)) continue;
    const fill = (text: string) => (Object.keys(params).length > 0 ? compileNonPath(text, params) : text);
    for (const { key, value } of entry.headers) out[fill(key)] = fill(value);
  }
  return out;
}

/** The OpenNext Worker (getNextConfigHeaders): the same walk with its own regex, host check and compile. */
function headersViaOpenNext(entries: HeaderEntry[], host: string, pathname: string): HeaderMap {
  const out: HeaderMap = {};
  for (const entry of entries) {
    if (!new RegExp(entry.regex).test(pathname) || !hostPasses(entry.has, host)) continue;
    const matched = match(entry.source)(pathname);
    const fill = (text: string) => (matched && Object.keys(matched.params).length > 0 ? compile(text)(matched.params) : text);
    for (const { key, value } of entry.headers) {
      try {
        out[fill(key)] = fill(value);
      } catch {
        out[key] = value;
      }
    }
  }
  return out;
}

const runtimes = [
  ["Next's server", viaNext],
  ["the OpenNext Worker", viaOpenNext],
] as const;

const headerRuntimes = [
  ["Next's server", headersViaNext],
  ["the OpenNext Worker", headersViaOpenNext],
] as const;

/** Both runtimes must give `expected` for a redirect. */
function expectRedirect(host: string, pathname: string, expected: Outcome, redirects: Entry[] = SPLIT.redirects) {
  for (const [name, run] of runtimes) expect(run(redirects, host, pathname), `${name}: ${host} ${pathname}`).toEqual(expected);
}

/** Both runtimes must give `expected` for a beforeFiles rewrite. */
function expectRewrite(host: string, pathname: string, expected: Outcome, rewrites: Entry[] = SPLIT.beforeFiles) {
  for (const [name, run] of runtimes) expect(run(rewrites, host, pathname), `${name}: ${host} ${pathname}`).toEqual(expected);
}

/** Both runtimes must send `expected` as the HSTS header. */
function expectHsts(host: string, pathname: string, expected: string, headers: HeaderEntry[] = SPLIT.headers) {
  for (const [name, run] of headerRuntimes) expect(run(headers, host, pathname)[HSTS], `${name}: ${host} ${pathname}`).toBe(expected);
}

const to = (status: number, location: string): Outcome => ({ status, to: location });

/** First segments the root domain serves itself, in other letter cases (and the guide's path itself). */
const MIXED_CASE = [
  "/Guide",
  "/GUIDE",
  "/GUIDE/",
  "/Guide/tarot",
  "/GUIDE/tarot",
  "/gUiDe/the-fool",
  "/Guide/a/b",
  "/API",
  "/Api/version",
  "/API/a/b",
  "/Cards",
  "/Cards/major-00-fool.webp",
  "/CARDS/x.webp",
  "/OG",
  "/Og/x",
  "/_Next",
  "/_Next/static/a.js",
  "/_NEXT/static/media/font.woff2",
  "/Opengraph-Image",
  "/OPENGRAPH-IMAGE",
];

// What follows is the deploy build's; the block for the other builds turns the flag off again.
beforeEach(() => vi.stubEnv(FLAG, "1"));
afterEach(() => vi.unstubAllEnvs());

describe("the rules (NEXT_PUBLIC_SPLIT_HOSTS=1, the deploy build)", () => {
  it("rewrite the root domain's / to the tarot tab, so it shows the guide index at the same address", () => {
    expect(hostRewrites()).toEqual([{ source: "/", has: [{ type: "host", value: expect.any(String) }], destination: "/guide/tarot" }]);
    expect(hostRewrites()[0]?.destination).toBe(guideIndexPath("tarot"));
  });

  it("send the app's /guide pages to the root domain for good (308), /guide itself straight to the tarot tab, the root domain's other paths to the app for now (307)", () => {
    const redirects = hostRedirects();
    expect(redirects.filter((rule) => rule.permanent)).toHaveLength(redirects.length - 1);
    expect(redirects.at(-1)?.permanent).toBe(false);
    expect(redirects.at(-1)?.destination.startsWith(`${SITE.url}/`)).toBe(true);
    for (const rule of redirects.filter((r) => r.permanent)) {
      expect(rule.source.startsWith("/guide")).toBe(true);
      expect(rule.destination.startsWith(`${SITE.guideUrl}/guide`)).toBe(true);
    }
    expect(redirects.find((rule) => rule.source === "/guide")?.destination).toBe(`${SITE.guideUrl}${guideIndexPath("tarot")}`);
  });

  it("send HSTS without includeSubDomains, with the max-age given, on the root domain only", () => {
    expect(hostHeaders(APEX_HSTS)).toEqual([{ source: "/:path*", has: [{ type: "host", value: expect.any(String) }], headers: [{ key: HSTS, value: APEX_HSTS }] }]);
    expect(hostHeaders(APEX_HSTS)[0]?.has).toEqual(hostRewrites()[0]?.has);
  });

  it("steer clear of what the OpenNext Worker rewrites or ignores: (.) escapes in a source, named groups in a host value", () => {
    for (const rule of [...hostRedirects(), ...hostRewrites(), ...hostHeaders(APEX_HSTS)]) {
      expect(rule.source, rule.source).not.toMatch(/\(\.{1,3}\)/);
      for (const has of rule.has) expect(has.value, has.value).not.toContain("(?<");
    }
  });

  it("match a host exactly, with or without a port, read either way: as it came, port included (OpenNext), or anchored without the port (Next)", () => {
    const values = [...new Set([...hostRedirects(), ...hostRewrites(), ...hostHeaders(APEX_HSTS)].flatMap((rule) => rule.has.map((has) => has.value)))];
    expect(values).toHaveLength(2);
    // The Worker tests a value against the Host header as it came; Next drops the port, lowercases the host and anchors the value.
    const readings = [
      (value: string, host: string) => host !== "" && new RegExp(value).test(host),
      (value: string, host: string) => new RegExp(`^${value}$`).test(host.split(":", 1)[0]?.toLowerCase() ?? ""),
    ];
    const matched = (host: string) => readings.map((reads) => values.filter((value) => reads(value, host)));
    const [apexValue] = matched(APEX)[0] ?? [];
    const [starlogValue] = matched(STARLOG)[0] ?? [];
    expect(apexValue).not.toBe(starlogValue);
    for (const host of [APEX, `${APEX}:443`, `${APEX}:8443`]) expect(matched(host), host).toEqual([[apexValue], [apexValue]]);
    for (const host of [STARLOG, `${STARLOG}:443`]) expect(matched(host), host).toEqual([[starlogValue], [starlogValue]]);
    const others = [
      "localhost:3100",
      "localhost:8787",
      "127.0.0.1:3100",
      "starlog.example.workers.dev",
      "evil-yeolmaeapps.kr",
      "evil-yeolmaeapps.kr:443",
      "yeolmaeapps.kr.example.com",
      "yeolmaeapps.kr.example.com:443",
      "starlog.yeolmaeapps.kr.example.com",
      "xyeolmaeapps.kr",
      "yeolmaeappsxkr",
      "",
    ];
    for (const host of others) expect(matched(host), host).toEqual([[], []]);
  });
});

describe("on https://yeolmaeapps.kr", () => {
  it("shows the guide index at /, without changing the address", () => {
    expectRewrite(APEX, "/", { to: "/guide/tarot" });
    expectRewrite(APEX, "/guide/tarot", null);
    expectRewrite(APEX, "/me", null);
  });

  it("sends every app path to the same path on the app host, temporarily (307)", () => {
    for (const path of ["/tarot/new", "/saju/new", "/tarot/new/situation", "/saju/chart", "/me", "/story", "/faq", "/now", "/today", "/pricing", "/b/ABC234", "/ranking/aries", "/invite/abc_DEF-123", "/guidebook", "/apiary", "/TAROT/new"]) {
      expectRedirect(APEX, path, to(307, `${SITE.url}${path}`));
    }
    expectRedirect(APEX, "/한글/경로", to(307, `${SITE.url}/한글/경로`));
    expectRedirect(APEX, "/%ED%95%9C/x", to(307, `${SITE.url}/%ED%95%9C/x`));
  });

  it("serves the guide, Next's files and API, the crawler files, and the assets the guide pages load itself", () => {
    const own = [
      "/guide/tarot",
      "/guide/saju",
      "/guide/the-fool",
      "/_next/static/chunks/0a1b2c.js",
      "/_next/static/media/font.woff2",
      "/api/version",
      "/api/anything/deep",
      "/robots.txt",
      "/sitemap.xml",
      "/ads.txt",
      "/llms.txt",
      "/llms-full.txt",
      "/rss.xml",
      "/favicon.ico",
      "/icon.png",
      "/apple-icon.png",
      "/manifest.webmanifest",
      "/logo.png",
      "/74d8adb0a0b4d02a28602f80b163bf31.txt",
      "/.well-known/security.txt",
      "/opengraph-image",
      "/og/anything",
      "/cards/major-00-fool.webp",
      "/cards/major-00-fool-sm.webp",
      "/cards/starlog/major-00-fool.webp",
      "/cards/starlog/manifest.json",
      "/cards/backs/constellation.webp",
      "/cards/backs/constellation-sm.webp",
    ];
    for (const path of own) expectRedirect(APEX, path, null);
  });

  it("serves those paths itself in any letter case too, instead of sending them to the app", () => {
    for (const path of MIXED_CASE.filter((path) => !/^\/guide\/?$/i.test(path))) expectRedirect(APEX, path, null);
    // /Guide alone: the Worker, which matches the manifest case-sensitively, leaves it alone too.
    for (const path of ["/Guide", "/GUIDE", "/GUIDE/"]) expect(viaOpenNext(SPLIT.redirects, APEX, path), path).toBeNull();
  });

  it("keeps /guide's own rule: a permanent redirect to the first tab, on the same host", () => {
    expectRedirect(APEX, "/guide", to(308, "/guide/tarot"));
  });
});

describe("on https://starlog.yeolmaeapps.kr", () => {
  it("sends every /guide page to the same path on the root domain for good (308), and /guide straight to the tarot tab", () => {
    expectRedirect(STARLOG, "/guide", to(308, `${SITE.guideUrl}/guide/tarot`));
    expectRedirect(STARLOG, "/guide/tarot", to(308, `${SITE.guideUrl}/guide/tarot`));
    expectRedirect(STARLOG, "/guide/saju", to(308, `${SITE.guideUrl}/guide/saju`));
    expectRedirect(STARLOG, "/guide/the-fool", to(308, `${SITE.guideUrl}/guide/the-fool`));
    expectRedirect(STARLOG, "/guide/a/b", to(308, `${SITE.guideUrl}/guide/a/b`));
  });

  it("leaves everything else alone, files and the API included", () => {
    for (const path of ["/", "/tarot/new", "/saju/new", "/me", "/story", "/faq", "/guidebook", "/api/version", "/robots.txt", "/sitemap.xml", "/rss.xml", "/llms.txt", "/opengraph-image", "/cards/major-00-fool.webp", "/_next/static/a.js"]) {
      expectRedirect(STARLOG, path, null);
    }
    expectRewrite(STARLOG, "/", null);
  });
});

describe("with a port in the Host header", () => {
  it("still knows the two hosts", () => {
    expectRedirect(`${APEX}:443`, "/me", to(307, `${SITE.url}/me`));
    expectRedirect(`${APEX}:443`, "/guide/tarot", null);
    expectRewrite(`${APEX}:443`, "/", { to: "/guide/tarot" });
    expectRedirect(`${STARLOG}:443`, "/guide", to(308, `${SITE.guideUrl}/guide/tarot`));
    expectRedirect(`${STARLOG}:443`, "/guide/the-fool", to(308, `${SITE.guideUrl}/guide/the-fool`));
    expectRedirect(`${STARLOG}:443`, "/me", null);
  });

  it("and no other", () => {
    for (const host of ["evil-yeolmaeapps.kr:443", "yeolmaeapps.kr.example.com:443", "starlog.example.workers.dev:443", "localhost:8787"]) {
      for (const path of ["/me", "/guide/tarot", "/tarot/new"]) expectRedirect(host, path, null);
      expectRewrite(host, "/", null);
    }
  });
});

describe("Location headers", () => {
  it("never carry an unfilled :param, whatever the host, path or letter case", () => {
    const paths = [...MIXED_CASE, "/", "/me", "/tarot/new", "/guide", "/guide/tarot", "/guide/a/b", "/api/version", "/robots.txt", "/TAROT/new", "/guidebook"];
    for (const host of [APEX, STARLOG, `${APEX}:443`, `${STARLOG}:443`]) {
      for (const path of paths) {
        for (const [name, run] of runtimes) expect(run(SPLIT.redirects, host, path)?.to ?? "", `${name}: ${host} ${path}`).not.toMatch(/\/:/);
      }
    }
  });
});

describe("HSTS", () => {
  it("drops includeSubDomains on the root domain, everywhere on it, port or not", () => {
    for (const path of ["/", "/guide/tarot", "/guide/the-fool", "/robots.txt", "/sitemap.xml", "/ads.txt", "/api/version", "/_next/static/a.js", "/me"]) {
      expectHsts(APEX, path, APEX_HSTS);
      expectHsts(`${APEX}:443`, path, APEX_HSTS);
    }
  });

  it("keeps the app's header on the app host and on every other host", () => {
    for (const host of [STARLOG, `${STARLOG}:443`, "localhost:8787", "evil-yeolmaeapps.kr", "yeolmaeapps.kr.example.com"]) {
      for (const path of ["/", "/guide/tarot", "/me", "/api/version"]) expectHsts(host, path, APP_HSTS);
    }
  });

  it("changes nothing else: the root domain gets every other security header the app host gets", () => {
    for (const [name, run] of headerRuntimes) {
      for (const path of ["/", "/guide/tarot"]) {
        const apex = run(SPLIT.headers, APEX, path);
        const app = run(SPLIT.headers, STARLOG, path);
        expect(apex["X-Frame-Options"], name).toBe("DENY");
        expect({ ...apex, [HSTS]: "" }, `${name}: ${path}`).toEqual({ ...app, [HSTS]: "" });
      }
    }
  });
});

describe("without NEXT_PUBLIC_SPLIT_HOSTS (next dev, the OpenNext preview, e2e)", () => {
  beforeEach(() => vi.stubEnv(FLAG, ""));

  it("has no host rules at all", async () => {
    expect(hostRedirects()).toEqual([]);
    expect(hostRewrites()).toEqual([]);
    expect(hostHeaders(APEX_HSTS)).toEqual([]);
    expect(await nextConfig.redirects?.()).toEqual([{ source: "/guide", destination: "/guide/tarot", permanent: true }]);
    expect(await nextConfig.rewrites?.()).toEqual({ beforeFiles: [], afterFiles: [], fallback: [] });
    expect(await nextConfig.headers?.()).toHaveLength(1);
    expect(LOCAL.beforeFiles).toEqual([]);
    expect(LOCAL.redirects.filter((entry) => !entry.internal).map((entry) => entry.source)).toEqual(["/guide"]);
    expect(LOCAL.headers.filter((entry) => entry.has)).toEqual([]);
  });

  it("serves every /guide page in place on the host wrangler dev hands the Worker (starlog), and on every other host", () => {
    for (const host of [STARLOG, APEX, "localhost:8787", "localhost:3100", "example.com"]) {
      for (const path of ["/guide/tarot", "/guide/saju", "/guide/the-fool", "/me", "/tarot/new", "/Guide/tarot"]) expectRedirect(host, path, null, LOCAL.redirects);
      expectRedirect(host, "/guide", to(308, "/guide/tarot"), LOCAL.redirects);
      expectRewrite(host, "/", null, LOCAL.beforeFiles);
      expectHsts(host, "/guide/tarot", APP_HSTS, LOCAL.headers);
    }
  });
});

describe("on every other host, with the flag on", () => {
  it("applies none of the host rules: / is the app's own page, and /guide pages are served in place", () => {
    for (const host of ["localhost:3100", "localhost:8787", "127.0.0.1:3100", "starlog.example.workers.dev", "evil-yeolmaeapps.kr", "yeolmaeapps.kr.example.com"]) {
      for (const path of ["/tarot/new", "/me", "/guide/tarot", "/guide/the-fool", "/robots.txt"]) expectRedirect(host, path, null);
      expectRewrite(host, "/", null);
      // The rule that has always been there keeps working everywhere.
      expectRedirect(host, "/guide", to(308, "/guide/tarot"));
    }
  });
});

describe("next.config.ts", () => {
  it("hands Next the host rules ahead of the existing /guide rule, the apex rewrite before the files, and the apex HSTS after the global headers", async () => {
    expect(await nextConfig.redirects?.()).toEqual([...hostRedirects(), { source: "/guide", destination: "/guide/tarot", permanent: true }]);
    expect(await nextConfig.rewrites?.()).toEqual({ beforeFiles: hostRewrites(), afterFiles: [], fallback: [] });
    const headers = (await nextConfig.headers?.()) ?? [];
    expect(headers).toHaveLength(2);
    expect(headers[0]?.headers).toContainEqual({ key: HSTS, value: APP_HSTS });
    expect(headers.slice(1)).toEqual(hostHeaders(APEX_HSTS));
  });

  it("loads the rules through relative imports only: its loader has no '@/' alias", () => {
    for (const file of ["hostRoutes.ts", "hosts.ts", "config.ts"]) {
      expect(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"), file).not.toMatch(/from\s+["']@\//);
    }
  });
});

describe("wrangler.jsonc", () => {
  it("serves both hosts from the one Worker, as custom domains", () => {
    const raw = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
    const { routes } = JSON.parse(raw) as { routes: Array<{ pattern: string; custom_domain: boolean }> };
    expect(routes).toEqual([
      { pattern: STARLOG, custom_domain: true },
      { pattern: APEX, custom_domain: true },
    ]);
  });
});
