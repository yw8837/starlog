import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @starlog/core is resolved through tsconfig "paths" (D: is exFAT, so pnpm cannot symlink it).
  transpilePackages: ["@starlog/core"],
  images: { unoptimized: true },
};

export default nextConfig;
