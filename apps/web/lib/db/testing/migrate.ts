import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTestD1, type TestD1 } from "./sqliteD1";

const MIGRATIONS = fileURLToPath(new URL("../../../migrations/", import.meta.url));

/**
 * A fresh in-memory test D1 with every apps/web/migrations/NNNN_*.sql applied in name order, as wrangler does.
 * `without`: leave out the migrations whose file name contains it (a deploy that runs ahead of a migration).
 */
export function migratedTestD1(options: { without?: string } = {}): TestD1 {
  const db = createTestD1();
  for (const name of readdirSync(MIGRATIONS).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort()) {
    if (options.without && name.includes(options.without)) continue;
    db.exec(readFileSync(`${MIGRATIONS}${name}`, "utf8"));
  }
  return db;
}
