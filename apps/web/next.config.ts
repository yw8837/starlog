import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import { hostHeaders, hostRedirects, hostRewrites } from "./lib/hostRoutes";

/** HSTS: https only for two years (browsers ignore it on http://localhost). */
const HSTS_MAX_AGE = "max-age=63072000";

/**
 * Baseline security headers on every response. No script-src CSP yet: Next injects inline
 * scripts, so a strict policy needs nonces first. frame-ancestors backs up X-Frame-Options.
 * HSTS includes subdomains, except on the root domain (lib/hostRoutes.ts hostHeaders).
 */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: `${HSTS_MAX_AGE}; includeSubDomains` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/**
 * Dev servers only: says whether generation runs on the mock provider, so the e2e suite can refuse
 * to run against a server that would call the real API (apps/web/.env.local holds a real key).
 * Never sent by a production build.
 */
function devProviderHeader(): Array<{ key: string; value: string }> {
  if (process.env.NODE_ENV === "production") return [];
  return [{ key: "X-Starlog-Dev-Provider", value: process.env.STARLOG_AI === "mock" ? "mock" : "live" }];
}

/*
 * No `deploymentId` here: on OpenNext Cloudflare the RSC responses don't carry the id back, so the
 * client treated every navigation as version skew and hard-reloaded the page (which also reset the
 * question flow). Stale tabs are handled by components/layout/VersionCheck instead.
 */

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // STARLOG_DEV_FS_CACHE=0 turns Turbopack's on-disk dev cache off: on this exFAT disk its restore
    // panics now and then ("Restore of All … restoring failed") and takes the dev server down.
    turbopackFileSystemCacheForDev: process.env.STARLOG_DEV_FS_CACHE !== "0",
  },
  // @starlog/core is resolved through tsconfig "paths" (D: is exFAT, so pnpm cannot symlink it).
  transpilePackages: ["@starlog/core"],
  images: { unoptimized: true },
  // The root domain's HSTS entry comes last: of the entries that match, the last one wins a header.
  headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS, ...devProviderHeader()] }, ...hostHeaders(HSTS_MAX_AGE)];
  },
  // The guides live on the root domain and the app on starlog: the host rules (lib/hostRoutes.ts) come
  // first and carry a `host` condition. They exist only in the deploy build (NEXT_PUBLIC_SPLIT_HOSTS=1),
  // so next dev, the preview and e2e have none.
  // The guide index is split into tabs (/guide/tarot, /guide/saju). /guide moved to the first tab
  // for good: a 308 before rendering, so search engines carry its signals over to the tab.
  // /tarot and /saju have no page of their own (the entries are /tarot/new and /saju/new), and are what a
  // person or an article guesses: they go to the entry for good, after the host rules.
  async redirects() {
    return [
      ...hostRedirects(),
      { source: "/guide", destination: "/guide/tarot", permanent: true },
      { source: "/tarot", destination: "/tarot/new", permanent: true },
      { source: "/saju", destination: "/saju/new", permanent: true },
    ];
  },
  // The root domain's / shows the guide index. Before the files: the app's own page for / exists.
  async rewrites() {
    return { beforeFiles: hostRewrites(), afterFiles: [], fallback: [] };
  },
};

export default nextConfig;

// STARLOG_CF_DEV=1: `next dev` gets the Worker's bindings from wrangler.jsonc through Miniflare (local
// D1 for accounts and payments, simulated KV and rate limiters). Run `pnpm --filter @starlog/web
// db:migrate:local` first. Off by default, so P3's memory repos keep serving plain `next dev`.
if (process.env.STARLOG_CF_DEV === "1") void initOpenNextCloudflareForDev();
