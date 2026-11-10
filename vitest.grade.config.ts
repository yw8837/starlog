import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `pnpm grade:table`: scores the whole 사주 등급 population (spec 2026-11-11 A6–A7), writes the cut and rank tables the web
// reads (apps/web/lib/sajuGrade*.generated.json) and checks the distribution. Never part of `pnpm test`.
const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: { alias: { "@starlog/core": fromRoot("./packages/core/src/index.ts") } },
  test: {
    include: ["scripts/saju-grade-report.test.ts"],
    environment: "node",
    testTimeout: 600_000,
    silent: false,
  },
});
