import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// `pnpm ai:premium` (stage 4 eval, scripts/premium-smoke.test.ts): real model calls unless SMOKE_PROVIDER=mock. Never
// part of `pnpm test`. Its own config, not merged with another: a merged config once concatenated include arrays and
// ran every smoke file, so this one includes the eval file and nothing else, whatever the command line adds.
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
    include: ["scripts/premium-smoke.test.ts"],
    environment: "node",
    // The budget defaults to 7,000원 here (an env prefix on the npm script would not work in Windows' shell); the
    // shell environment wins, then apps/web/.env.local (gitignored, may hold the key).
    env: { SMOKE_BUDGET_KRW: "7000", ...loadEnv("", fromRoot("./apps/web"), ""), ...process.env } as Record<string, string>,
    // Six readings with their parts, previews and follow-ups, one after another.
    testTimeout: 3_600_000,
    maxWorkers: 1,
    silent: false,
  },
});
