import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { D1Binding } from "../d1";

const MIGRATIONS = fileURLToPath(new URL("../../../migrations/", import.meta.url));

/** P4 tables, children before parents, for emptying a shared local D1 between tests. */
export const P4_TABLES_CHILD_FIRST = ["readings", "ledger", "unlocks", "credit_lots", "payments", "orders", "gift_claims", "sessions", "users", "meta"];

/** Every migration's statements in file order (comment-only lines dropped, split at a ";" that ends a line). */
export function migrationStatements(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
    .flatMap((name) => readFileSync(join(MIGRATIONS, name), "utf8").replace(/^--.*$/gm, "").split(/;\s*(?:\n|$)/))
    .map((sql) => sql.trim())
    .filter(Boolean);
}

/**
 * A real local D1 (workerd through wrangler's getPlatformProxy, in memory) with every migration
 * applied: the same approach as P3's d1BondsRepo.int.test.ts. Tests only; *.int.test.ts files skip
 * themselves with CI_NO_WORKERD=1.
 */
export async function openLocalD1(): Promise<{ db: D1Binding; dispose: () => Promise<void> }> {
  const { getPlatformProxy } = await import("wrangler");
  // A config with only the D1 binding: the app's own config also names assets and services the test does not run.
  const dir = mkdtempSync(join(tmpdir(), "starlog-p4-d1-"));
  const configPath = join(dir, "wrangler.jsonc");
  writeFileSync(configPath, JSON.stringify({
    name: "starlog-p4-d1-test",
    compatibility_date: "2026-09-01",
    d1_databases: [{ binding: "DB", database_name: "starlog", database_id: "local-test" }],
  }));
  const proxy = await getPlatformProxy<{ DB: D1Binding }>({ configPath, persist: false });
  for (const sql of migrationStatements()) await proxy.env.DB.prepare(sql).run();
  return {
    db: proxy.env.DB,
    dispose: async () => {
      await proxy.dispose();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
