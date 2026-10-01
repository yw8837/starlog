import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
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

/**
 * Skew protection (owner: a tab opened before a deploy kept showing the old /today). With a
 * deploymentId, Next tags its assets with it and, when a page from an older deployment navigates,
 * the server's newer id makes the client reload the page instead of mixing old JS with new pages.
 * OpenNext Cloudflare hands it to the Worker (process.env.DEPLOYMENT_ID). Production builds only:
 * NEXT_DEPLOYMENT_ID when set, otherwise the commit plus a hash of uncommitted changes, so the same
 * tree always gets the same id (the config is read more than once during a build).
 */
function deploymentId(): string | undefined {
  if (process.env.NEXT_DEPLOYMENT_ID) return process.env.NEXT_DEPLOYMENT_ID;
  if (process.env.NODE_ENV !== "production") return undefined;
  try {
    const git = (args: string) => execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 }).toString();
    const head = git("rev-parse --short=12 HEAD").trim();
    const changes = git("status --porcelain") ? git("diff HEAD") + git("ls-files --others --exclude-standard") : "";
    return changes ? `${head}-${createHash("sha256").update(changes).digest("hex").slice(0, 8)}` : head;
  } catch {
    return undefined;
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  deploymentId: deploymentId(),
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
