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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @starlog/core is resolved through tsconfig "paths" (D: is exFAT, so pnpm cannot symlink it).
  transpilePackages: ["@starlog/core"],
  images: { unoptimized: true },
  headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
