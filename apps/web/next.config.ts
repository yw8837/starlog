import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

/**
 * Baseline security headers on every response. No script-src CSP yet: Next injects inline
 * scripts, so a strict policy needs nonces first. frame-ancestors backs up X-Frame-Options.
 */
const SECURITY_HEADERS = [
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
  headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS, ...devProviderHeader()] }];
  },
  // The guide index is split into tabs (/guide/tarot, /guide/saju). /guide moved to the first tab
  // for good: a 308 before rendering, so search engines carry its signals over to the tab.
  async redirects() {
    return [{ source: "/guide", destination: "/guide/tarot", permanent: true }];
  },
};

export default nextConfig;

// STARLOG_CF_DEV=1: `next dev` gets the Worker's bindings from wrangler.jsonc through Miniflare (local
// D1 for accounts and payments, simulated KV and rate limiters). Run `pnpm --filter @starlog/web
// db:migrate:local` first. Off by default, so P3's memory repos keep serving plain `next dev`.
if (process.env.STARLOG_CF_DEV === "1") void initOpenNextCloudflareForDev();
