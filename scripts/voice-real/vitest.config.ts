import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// One real saju reading for the voice check (costs money). Git-ignored scratch, never part of `pnpm test`.
const fromRoot = (path: string) => fileURLToPath(new URL(path, new URL("../../", import.meta.url)));
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
    root: fromRoot("."),
    include: ["scripts/voice-real/*.real.test.ts"],
    environment: "node",
    env: { ...loadEnv("", fromRoot("./apps/web"), ""), ...process.env } as Record<string, string>,
    testTimeout: 900_000,
    silent: false,
  },
});
