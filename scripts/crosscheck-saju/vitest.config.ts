import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate from the root config on purpose: `pnpm test` never runs the cross-check.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: { include: ["ours.crosscheck.ts"], environment: "node", testTimeout: 300_000 },
});
