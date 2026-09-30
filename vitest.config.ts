import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));
// Node resolution walks up, so a git worktree without its own node_modules finds the hoisted copy.
const resolveModule = createRequire(import.meta.url).resolve;

export default defineConfig({
  test: {
    projects: [
      { test: { name: "core", include: ["packages/core/tests/**/*.test.ts"], environment: "node" } },
      {
        // D: is exFAT (no symlinks), so @starlog/core is resolved by path alias, not node_modules.
        resolve: {
          alias: {
            "@starlog/core": fromRoot("./packages/core/src/index.ts"),
            "@": fromRoot("./apps/web"),
            "@content": fromRoot("./content"),
            // lib/fixtures.ts is server-only; tests run on the server side, so use Next's empty stub.
            "server-only": resolveModule("next/dist/compiled/server-only/empty.js"),
          },
        },
        test: { name: "web", include: ["apps/web/**/*.test.{ts,tsx}"], exclude: ["apps/web/e2e/**", "**/node_modules/**"], environment: "node" },
      },
    ],
  },
});
