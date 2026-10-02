import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// The i18n jobs (P6 Task 7): `pnpm i18n:ledger`, `i18n:status`, `i18n:review`, and (Task 14) `i18n:draft`,
// which calls the API and costs money. Never part of `pnpm test`.
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
    // Each package script names its one job file (a CLI filter), so no env prefix is needed on Windows.
    include: ["scripts/i18n/*.test.ts"],
    environment: "node",
    env: { ...loadEnv("", fromRoot("./apps/web"), ""), ...process.env } as Record<string, string>,
    testTimeout: 3_600_000,
    silent: false,
  },
});
