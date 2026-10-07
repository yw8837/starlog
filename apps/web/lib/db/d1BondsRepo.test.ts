import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { D1Binding, D1Statement } from "./d1";
import { createD1BondsRepo } from "./d1BondsRepo";

/**
 * How the D1 repository reads: SQLite's query plan for the SQL it sends, on node:sqlite with every
 * migration applied. What it returns is the contract's job (d1BondsRepo.int.test.ts, on local D1).
 */

const MIGRATIONS = fileURLToPath(new URL("../../migrations/", import.meta.url));

/** The plan for `sql` on the migrated schema, one line per step. */
function plan(sql: string): string[] {
  const db = new DatabaseSync(":memory:");
  for (const name of readdirSync(MIGRATIONS).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort()) db.exec(readFileSync(`${MIGRATIONS}${name}`, "utf8"));
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map((row) => String((row as { detail: string }).detail));
}

/** A D1 that answers nothing and keeps every statement it was asked to prepare. */
function recordingD1(sent: string[]): D1Binding {
  const statement: D1Statement = {
    bind: () => statement,
    first: async () => null,
    all: async () => ({ results: [], success: true }),
    run: async () => ({ results: [], success: true }),
  };
  return {
    prepare: (sql) => (sent.push(sql), statement),
    batch: async (statements) => statements.map(() => ({ results: [], success: true })),
  };
}

describe("D1 BondsRepo reads", () => {
  it("reads every sign's leaders through the ranking index with a LIMIT, never by scanning every constellation", async () => {
    const sent: string[] = [];
    await createD1BondsRepo(recordingD1(sent)).topsBySign(null, 3);
    expect(sent.length).toBeGreaterThan(0);
    for (const sql of sent) {
      const steps = plan(sql);
      expect(sql).toMatch(/\bLIMIT\b/);
      expect(steps.some((step) => step.startsWith("SEARCH c USING INDEX constellations_rank")), steps.join(" | ")).toBe(true);
      expect(steps.filter((step) => /^SCAN (c|constellations)\b/.test(step)), steps.join(" | ")).toEqual([]);
    }
  });
});
