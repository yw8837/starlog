import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe } from "vitest";
import { bondsRepoContract } from "./contract";
import type { D1Binding } from "./d1";
import { createD1BondsRepo } from "./d1BondsRepo";

/**
 * The D1 repository against a real local D1 (workerd through wrangler's getPlatformProxy, in memory),
 * with every migration in apps/web/migrations applied first. Skipped with CI_NO_WORKERD=1.
 */

const MIGRATIONS = fileURLToPath(new URL("../../migrations/", import.meta.url));
const TABLES_CHILD_FIRST = ["stars", "constellations", "invites", "owners"];

/** The statements of every migration, in file order. */
function migrationStatements(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
    .flatMap((name) => readFileSync(join(MIGRATIONS, name), "utf8").replace(/^--.*$/gm, "").split(/;\s*(?:\n|$)/))
    .map((sql) => sql.trim())
    .filter(Boolean);
}

describe.skipIf(process.env.CI_NO_WORKERD === "1")("D1 BondsRepo (local D1)", () => {
  let db: D1Binding;
  let dispose: (() => Promise<void>) | undefined;
  let dir: string;

  beforeAll(async () => {
    const { getPlatformProxy } = await import("wrangler");
    // A config with only the D1 binding: the app's own config also names assets and services this test does not run.
    dir = mkdtempSync(join(tmpdir(), "starlog-d1-"));
    const configPath = join(dir, "wrangler.jsonc");
    writeFileSync(configPath, JSON.stringify({
      name: "starlog-d1-test",
      compatibility_date: "2026-09-01",
      d1_databases: [{ binding: "DB", database_name: "starlog", database_id: "local-test" }],
    }));
    const proxy = await getPlatformProxy<{ DB: D1Binding }>({ configPath, persist: false });
    db = proxy.env.DB;
    dispose = proxy.dispose;
    for (const sql of migrationStatements()) await db.prepare(sql).run();
  }, 120_000);

  afterAll(async () => {
    await dispose?.();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  bondsRepoContract(async () => {
    await db.batch(TABLES_CHILD_FIRST.map((table) => db.prepare(`DELETE FROM ${table}`)));
    return createD1BondsRepo(db);
  });
});
