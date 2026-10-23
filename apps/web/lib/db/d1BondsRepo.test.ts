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

describe("D1 BondsRepo and stars.score_public (owner 2026-10-23, migration 0016)", () => {
  /** A D1 whose stars table has or lacks score_public; it records every batch's SQL. */
  function starsD1(hasColumn: boolean, batches: string[][]): D1Binding {
    const after = { id: "c1", owner_id: "o1", sign: "aries", status: "filling", total: 87, started_at: 1, completed_at: null };
    const statement = (sql: string): D1Statement & { sql: string } => {
      const s = { sql, bind: () => s, first: async () => null, all: async () => ({ results: [], success: true }), run: async () => ({ results: [], success: true }) };
      return s as D1Statement & { sql: string };
    };
    return {
      prepare: (sql) => statement(sql),
      batch: async (statements) => {
        const sqls = statements.map((st) => (st as unknown as { sql: string }).sql);
        batches.push(sqls);
        if (!hasColumn && sqls.some((sql) => sql.includes("score_public"))) throw new Error("D1_ERROR: table stars has no column named score_public: SQLITE_ERROR");
        return statements.map((_, i) => ({ results: i === statements.length - 1 ? [after] : [], success: true }));
      },
    };
  }
  const row = { id: "s1", constellationId: "c1", slot: 0, nickname: "하늘", message: null, cardId: "cups-02", orientation: "upright" as const, score: 87, parts: [], friendKey: "k", createdAt: 1, scorePublic: true };

  it("writes the flag where the column exists", async () => {
    const batches: string[][] = [];
    await createD1BondsRepo(starsD1(true, batches)).joinStar(row, 4, "2026-10-23", 1);
    expect(batches).toHaveLength(1);
    expect(batches[0]![0]).toContain("score_public");
  });

  it("still joins on a database without 0016 (code deployed first): the star goes in without the flag, as an earlier star", async () => {
    const batches: string[][] = [];
    const after = await createD1BondsRepo(starsD1(false, batches)).joinStar(row, 4, "2026-10-23", 1);
    expect(after.id).toBe("c1");
    expect(batches).toHaveLength(2);
    expect(batches[1]![0]).not.toContain("score_public");
  });

  it("is a column of stars after every migration, 0 for a star written before", () => {
    const db = new DatabaseSync(":memory:");
    for (const name of readdirSync(MIGRATIONS).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort()) db.exec(readFileSync(`${MIGRATIONS}${name}`, "utf8"));
    const columns = db.prepare("PRAGMA table_info(stars)").all().map((c) => (c as { name: string; dflt_value: string | null }));
    expect(columns.find((c) => c.name === "score_public")?.dflt_value).toBe("0");
    expect(readdirSync(MIGRATIONS).filter((file) => /^\d{4}_/.test(file)).sort().slice(-3)).toEqual(["0014_more_share_kinds.sql", "0015_reading_origin.sql", "0016_star_score_public.sql"]);
  });
});
