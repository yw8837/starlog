import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// `pnpm ai:smoke`: real Claude calls (costs money, needs ANTHROPIC_API_KEY). Never part of `pnpm test`.
const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const resolveModule = createRequire(import.meta.url).resolve;

export default defineConfig({
  resolve: {
    alias: {
      "@starlog/core": fromRoot("./packages/core/src/index.ts"),
      "@": fromRoot("./apps/web"),
      "@content": fromRoot("./content"),
      "server-only": resolveModule("next/dist/compiled/server-only/empty.js"),
    },
  },
  test: {
    include: ["scripts/ai-smoke.test.ts"],
    environment: "node",
    // apps/web/.env.local (gitignored) may hold the key; the shell environment wins.
    env: { ...loadEnv("", fromRoot("./apps/web"), ""), ...process.env } as Record<string, string>,
    // SMOKE_RUNS=5 makes ~25 sequential model calls; allow up to an hour.
    testTimeout: 3_600_000,
    silent: false,
  },
});
