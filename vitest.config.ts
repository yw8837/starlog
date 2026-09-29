import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    projects: [
      { test: { name: "core", include: ["packages/core/tests/**/*.test.ts"], environment: "node" } },
      { test: { name: "web", include: ["apps/web/**/*.test.{ts,tsx}"], exclude: ["apps/web/e2e/**", "**/node_modules/**"], environment: "node" } }
    ]
  }
});
