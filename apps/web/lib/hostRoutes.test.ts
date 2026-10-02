import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import { SITE } from "./config";
import { guideIndexPath } from "./guide";
import { hostRedirects, hostRewrites } from "./hostRoutes";

/**
 * The host rules as production runs them. `next build` turns next.config.ts into the entries of
 * routes-manifest.json (Next's own loader and builder run here), and two matchers apply them the way
 * the two runtimes do: Next's server (resolve-routes.js), and the OpenNext Worker, which has its own
 * copy of the logic (@opennextjs/aws 4.1.6, core/routing/matcher.js: the host regex is tested
 * unanchored and with the port, a source that matched nothing leaves its params unfilled, and the
 * destination is compiled with path-to-regexp's strict segment check). A rule has to give the same
 * answer in both, because Next never runs in production: only the Worker does.
 */

const APEX = new URL(SITE.guideUrl).host;
const STARLOG = new URL(SITE.url).host;

const nodeRequire = createRequire(import.meta.url);

type Has = { type: string; key?: string; value?: string };
type Params = Record<string, string | string[]>;
/** One entry of routes-manifest.json, as `next build` writes it. */
interface Entry {
  source: string;
  destination: string;
  regex: string;
  has?: Has[];
  missing?: Has[];
  internal?: boolean;
  statusCode?: number;
}

const { default: loadCustomRoutes } = nodeRequire("next/dist/lib/load-custom-routes") as {
  default: (config: unknown) => Promise<{ redirects: object[]; rewrites: { beforeFiles: object[] } }>;
};
const { buildCustomRoute } = nodeRequire("next/dist/lib/build-custom-route") as {
  buildCustomRoute: (type: "redirect" | "rewrite", route: object, restrictedRedirectPaths?: string[]) => Entry;
};
const { getPathMatch } = nodeRequire("next/dist/shared/lib/router/utils/path-match") as {
  getPathMatch: (source: string, options: { removeUnnamedParams: boolean; strict: boolean }) => (pathname: string) => false | Params;
};
const { matchHas, prepareDestination } = nodeRequire("next/dist/shared/lib/router/utils/prepare-destination") as {
  matchHas: (req: { headers: { host: string } }, query: object, has?: Has[], missing?: Has[]) => false | Params;
  prepareDestination: (args: { appendParamsToQuery: boolean; destination: string; params: Params; query: object }) => {
    parsedDestination: { origin?: string | null; pathname: string };
  };
};
const { match, compile } = nodeRequire("next/dist/compiled/path-to-regexp") as {
  match: (source: string) => (pathname: string) => false | { params: Params };
  compile: (destination: string) => (params: Params) => string;
};

/** What the manifest holds after a build: every redirect, and the rewrites that run before the files. */
const custom = await loadCustomRoutes(nextConfig);
const REDIRECTS = custom.redirects.map((route) => buildCustomRoute("redirect", route, ["/_next"]));
const REWRITES = custom.rewrites.beforeFiles.map((route) => buildCustomRoute("rewrite", route));

type Outcome = { status?: number; to: string } | null;

/** Next's server: getPathMatch, matchHas, prepareDestination, in manifest order. */
function viaNext(entries: Entry[], host: string, pathname: string): Outcome {
  for (const entry of entries) {
    if (entry.internal) continue;
    const params = getPathMatch(entry.source, { removeUnnamedParams: true, strict: true })(pathname);
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
  const entry = entries.find(
    (candidate) => !candidate.internal && new RegExp(candidate.regex).test(pathname) && (candidate.has ?? []).every((has) => has.type === "host" && new RegExp(has.value ?? "").test(host)),
  );
  if (!entry) return null;
  const external = /^(https?:\/\/[^/\s?]+)(\/[^?]*)?/.exec(entry.destination);
  const destination = external ? (external[2] ?? "") : entry.destination;
  const matched = match(entry.source)(pathname);
  const params = matched ? matched.params : {};
  const to = Object.keys(params).length > 0 ? compile(destination)(params) : destination;
  return { status: entry.statusCode, to: `${external?.[1] ?? ""}${to}` };
}

const runtimes = [
  ["Next's server", viaNext],
  ["the OpenNext Worker", viaOpenNext],
] as const;

/** Both runtimes must give `expected` for a redirect. */
function expectRedirect(host: string, pathname: string, expected: Outcome) {
  for (const [name, run] of runtimes) expect(run(REDIRECTS, host, pathname), `${name}: ${host} ${pathname}`).toEqual(expected);
}

const to = (status: number, location: string): Outcome => ({ status, to: location });

describe("the rules", () => {
  it("rewrite the root domain's / to the tarot tab, so it shows the guide index at the same address", () => {
    expect(hostRewrites()).toEqual([{ source: "/", has: [{ type: "host", value: expect.any(String) }], destination: "/guide/tarot" }]);
    expect(hostRewrites()[0]?.destination).toBe(guideIndexPath("tarot"));
  });

  it("send the app's /guide pages to the root domain for good (308), the root domain's other paths to the app for now (307)", () => {
    const redirects = hostRedirects();
    expect(redirects.filter((rule) => rule.permanent)).toHaveLength(redirects.length - 1);
    expect(redirects.at(-1)?.permanent).toBe(false);
    expect(redirects.at(-1)?.destination.startsWith(`${SITE.url}/`)).toBe(true);
    for (const rule of redirects.filter((r) => r.permanent)) {
      expect(rule.source.startsWith("/guide")).toBe(true);
      expect(rule.destination.startsWith(`${SITE.guideUrl}/guide`)).toBe(true);
    }
  });

  it("steer clear of what the OpenNext Worker rewrites or ignores: (.) escapes in a source, named groups in a host value", () => {
    for (const rule of [...hostRedirects(), ...hostRewrites()]) {
      expect(rule.source, rule.source).not.toMatch(/\(\.{1,3}\)/);
      for (const has of rule.has) expect(has.value, has.value).not.toContain("(?<");
    }
  });

  it("match a host exactly, read either way: unanchored with the port (OpenNext) or anchored without it (Next)", () => {
    const values = [...new Set([...hostRedirects(), ...hostRewrites()].flatMap((rule) => rule.has.map((has) => has.value)))];
    expect(values).toHaveLength(2);
    const readings = [(value: string, host: string) => new RegExp(value).test(host), (value: string, host: string) => new RegExp(`^${value}$`).test(host)];
    const matched = (host: string) => readings.map((reads) => values.filter((value) => reads(value, host)));
    const [apexValue] = matched(APEX)[0] ?? [];
    const [starlogValue] = matched(STARLOG)[0] ?? [];
    expect(apexValue).not.toBe(starlogValue);
    expect(matched(APEX)).toEqual([[apexValue], [apexValue]]);
    expect(matched(STARLOG)).toEqual([[starlogValue], [starlogValue]]);
    for (const host of ["localhost:3100", "localhost:8787", "127.0.0.1:3100", "starlog.example.workers.dev", "evil-yeolmaeapps.kr", "yeolmaeapps.kr.example.com", "xyeolmaeapps.kr", "yeolmaeappsxkr", ""]) {
      expect(matched(host), host).toEqual([[], []]);
    }
  });
});

describe("on https://yeolmaeapps.kr", () => {
  it("shows the guide index at /, without changing the address", () => {
    for (const [name, run] of runtimes) {
      expect(run(REWRITES, APEX, "/"), name).toEqual({ to: "/guide/tarot" });
      expect(run(REWRITES, APEX, "/guide/tarot"), name).toBeNull();
      expect(run(REWRITES, APEX, "/me"), name).toBeNull();
    }
  });

  it("sends every app path to the same path on the app host, temporarily (307)", () => {
    for (const path of ["/tarot/new", "/saju/new", "/tarot/new/situation", "/saju/chart", "/me", "/story", "/faq", "/now", "/today", "/pricing", "/b/ABC234", "/ranking/aries", "/invite/abc_DEF-123", "/guidebook", "/apiary"]) {
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
    ];
    for (const path of own) expectRedirect(APEX, path, null);
  });

  it("keeps /guide's own rule: a permanent redirect to the first tab, on the same host", () => {
    expectRedirect(APEX, "/guide", to(308, "/guide/tarot"));
  });
});

describe("on https://starlog.yeolmaeapps.kr", () => {
  it("sends every /guide page to the same path on the root domain, for good (308)", () => {
    expectRedirect(STARLOG, "/guide", to(308, `${SITE.guideUrl}/guide`));
    expectRedirect(STARLOG, "/guide/tarot", to(308, `${SITE.guideUrl}/guide/tarot`));
    expectRedirect(STARLOG, "/guide/saju", to(308, `${SITE.guideUrl}/guide/saju`));
    expectRedirect(STARLOG, "/guide/the-fool", to(308, `${SITE.guideUrl}/guide/the-fool`));
    expectRedirect(STARLOG, "/guide/a/b", to(308, `${SITE.guideUrl}/guide/a/b`));
  });

  it("leaves everything else alone, files and the API included", () => {
    for (const path of ["/", "/tarot/new", "/saju/new", "/me", "/story", "/faq", "/guidebook", "/api/version", "/robots.txt", "/sitemap.xml", "/rss.xml", "/llms.txt", "/opengraph-image", "/cards/major-00-fool.webp", "/_next/static/a.js"]) {
      expectRedirect(STARLOG, path, null);
    }
    for (const [name, run] of runtimes) expect(run(REWRITES, STARLOG, "/"), name).toBeNull();
  });
});

describe("on every other host (localhost, the OpenNext preview, e2e, previews)", () => {
  it("applies none of the host rules: / is the app's own page, and /guide pages are served in place", () => {
    for (const host of ["localhost:3100", "localhost:8787", "127.0.0.1:3100", "starlog.example.workers.dev", "evil-yeolmaeapps.kr", "yeolmaeapps.kr.example.com"]) {
      for (const path of ["/tarot/new", "/me", "/guide/tarot", "/guide/the-fool", "/robots.txt"]) expectRedirect(host, path, null);
      for (const [name, run] of runtimes) expect(run(REWRITES, host, "/"), `${name}: ${host}`).toBeNull();
      // The rule that has always been there keeps working everywhere.
      expectRedirect(host, "/guide", to(308, "/guide/tarot"));
    }
  });
});

describe("next.config.ts", () => {
  it("hands Next the host rules ahead of the existing /guide rule, and the apex rewrite before the files", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects.slice(0, hostRedirects().length)).toEqual(hostRedirects());
    expect(redirects).toContainEqual({ source: "/guide", destination: "/guide/tarot", permanent: true });
    expect(await nextConfig.rewrites?.()).toEqual({ beforeFiles: hostRewrites(), afterFiles: [], fallback: [] });
  });

  it("loads the rules through relative imports only: its loader has no '@/' alias", () => {
    for (const file of ["hostRoutes.ts", "config.ts"]) {
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
