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

describe("D1 BondsRepo, stars.score_public (0016) and constellations.scores_private (0017), owner and review 2026-10-23", () => {
  /** A D1 whose tables lack the `missing` columns; it records every batch's SQL and answers reads with `record`. */
  function bondsD1(missing: string[], batches: string[][], record: Record<string, unknown> | null = null): D1Binding {
    const after = { id: "c1", owner_id: "o1", sign: "aries", status: "filling", total: 87, started_at: 1, completed_at: null, scores_private: 0 };
    const statement = (sql: string): D1Statement & { sql: string } => {
      const s = { sql, bind: () => s, first: async () => record, all: async () => ({ results: [], success: true }), run: async () => ({ results: [], success: true }) };
      return s as D1Statement & { sql: string };
    };
    return {
      prepare: (sql) => statement(sql),
      batch: async (statements) => {
        const sqls = statements.map((st) => (st as unknown as { sql: string }).sql);
        batches.push(sqls);
        const gone = missing.find((column) => sqls.some((sql) => sql.includes(column)));
        if (gone) throw new Error(`D1_ERROR: no such column: ${gone}: SQLITE_ERROR`);
        return statements.map((_, i) => ({ results: i === statements.length - 1 ? [after] : [], success: true }));
      },
    };
  }
  const row = { id: "s1", constellationId: "c1", slot: 0, nickname: "하늘", message: null, cardId: "cups-02", orientation: "upright" as const, score: 87, parts: [], friendKey: "k", createdAt: 1, scorePublic: true };
  const earlier = { ...row, scorePublic: false };
  const marks = (sqls: string[]) => sqls.some((sql) => sql.includes("SET scores_private = 1"));

  it("writes the star's flag, and leaves the constellation's alone for a star that saw the notice", async () => {
    const batches: string[][] = [];
    await createD1BondsRepo(bondsD1([], batches)).joinStar(row, 4, "2026-10-23", 1);
    expect(batches).toHaveLength(1);
    expect(batches[0]![0]).toContain("score_public");
    expect(marks(batches[0]!)).toBe(false);
  });

  it("marks the constellation private in the same batch (one transaction) for a star without the notice", async () => {
    const batches: string[][] = [];
    await createD1BondsRepo(bondsD1([], batches)).joinStar(earlier, 4, "2026-10-23", 1);
    expect(batches).toHaveLength(1);
    expect(marks(batches[0]!)).toBe(true);
    batches.length = 0;
    await createD1BondsRepo(bondsD1([], batches)).insertStar(earlier);
    expect(batches).toHaveLength(1);
    expect(marks(batches[0]!)).toBe(true);
  });

  it("still joins on a database without 0016 and 0017 (code deployed first): the star goes in as an earlier one", async () => {
    const batches: string[][] = [];
    const after = await createD1BondsRepo(bondsD1(["score_public", "scores_private"], batches)).joinStar(row, 4, "2026-10-23", 1);
    expect(after.id).toBe("c1");
    expect(batches).toHaveLength(2);
    expect(batches[1]!.join(" ")).not.toMatch(/score_public|scores_private/);
  });

  it("still joins on a database with 0016 but not 0017", async () => {
    const batches: string[][] = [];
    expect((await createD1BondsRepo(bondsD1(["scores_private"], batches)).joinStar(earlier, 4, "2026-10-23", 1)).id).toBe("c1");
    expect(batches).toHaveLength(2);
    expect(batches[1]!.join(" ")).not.toMatch(/score_public|scores_private/);
  });

  it("reads a constellation as private where the column is missing or 1, as shown only where it is 0", async () => {
    const base = { id: "c1", owner_id: "o1", sign: "aries", status: "filling", total: 87, started_at: 1, completed_at: null };
    const read = async (record: Record<string, unknown>) => (await createD1BondsRepo(bondsD1([], [], record)).getConstellation("c1"))?.scoresPrivate;
    expect(await read(base)).toBe(true);
    expect(await read({ ...base, scores_private: 1 })).toBe(true);
    expect(await read({ ...base, scores_private: 0 })).toBeUndefined();
  });

  it("adds both columns at 0 for rows written after, and 0017 marks every constellation already holding a star", () => {
    const files = readdirSync(MIGRATIONS).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
    const at = files.indexOf("0017_constellation_scores_private.sql");
    expect(files.slice(at - 1, at + 1)).toEqual(["0016_star_score_public.sql", "0017_constellation_scores_private.sql"]);
    const db = new DatabaseSync(":memory:");
    for (const name of files.slice(0, at)) db.exec(readFileSync(`${MIGRATIONS}${name}`, "utf8"));
    db.exec(`INSERT INTO owners (id, nickname, ranking_public, basis_json, created_at) VALUES ('o1', '용우', 1, '{}', 1), ('o2', '민지', 1, '{}', 1);
      INSERT INTO constellations (id, owner_id, sign, status, total, started_at) VALUES ('with', 'o1', 'aries', 'filling', 80, 1), ('empty', 'o2', 'leo', 'filling', 0, 1);
      INSERT INTO stars (id, constellation_id, slot, nickname, card_id, orientation, score, parts_json, friend_key, created_at) VALUES ('s', 'with', 0, '하늘', 'cups-02', 'upright', 80, '[]', 'k', 1);`);
    for (const name of files.slice(at)) db.exec(readFileSync(`${MIGRATIONS}${name}`, "utf8"));
    const flags = Object.fromEntries(db.prepare("SELECT id, scores_private FROM constellations").all().map((r) => [(r as { id: string }).id, (r as { scores_private: number }).scores_private]));
    expect(flags).toEqual({ with: 1, empty: 0 });
    const columns = (table: string) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c as { name: string; dflt_value: string | null });
    expect(columns("stars").find((c) => c.name === "score_public")?.dflt_value).toBe("0");
    expect(columns("constellations").find((c) => c.name === "scores_private")?.dflt_value).toBe("0");
  });

  it("0019 gives owners an account column, NULL for owners made before, one owner per account (owner 2026-10-27)", () => {
    const files = readdirSync(MIGRATIONS).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
    expect(files).toContain("0019_owner_account.sql");
    // 0018 is another branch's (C:/starlog-ops/opening, 0018_opening_claims.sql): this one never takes that number
    expect(files.filter((file) => file.startsWith("0018_") && file !== "0018_opening_claims.sql")).toEqual([]);
    const db = new DatabaseSync(":memory:");
    for (const name of files) db.exec(readFileSync(`${MIGRATIONS}${name}`, "utf8"));
    expect(db.prepare("PRAGMA table_info(owners)").all().map((c) => (c as { name: string }).name)).toContain("user_id");
    db.exec(`INSERT INTO owners (id, nickname, ranking_public, basis_json, created_at) VALUES ('a', '가', 1, '{}', 1), ('b', '나', 1, '{}', 1), ('c', '다', 1, '{}', 1)`);
    db.exec("UPDATE owners SET user_id = 'u1' WHERE id = 'a'");
    expect(() => db.exec("UPDATE owners SET user_id = 'u1' WHERE id = 'b'")).toThrow(/UNIQUE/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM owners WHERE user_id IS NULL").get()).toEqual({ n: 2 });
  });

  it("0020 adds star_blocks and stars.basis_hash; without it nobody is kept out and stars still join (code deployed first)", async () => {
    const files = readdirSync(MIGRATIONS).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
    expect(files).toContain("0020_star_guards.sql");
    const db = new DatabaseSync(":memory:");
    for (const name of files) db.exec(readFileSync(`${MIGRATIONS}${name}`, "utf8"));
    expect(db.prepare("PRAGMA table_info(stars)").all().map((c) => (c as { name: string }).name)).toContain("basis_hash");
    expect(db.prepare("PRAGMA table_info(star_blocks)").all().map((c) => (c as { name: string }).name)).toEqual(["constellation_id", "friend_key", "created_at"]);
    const batches: string[][] = [];
    const legacy = createD1BondsRepo(bondsD1(["basis_hash", "star_blocks"], batches));
    expect((await legacy.joinStar({ ...row, basisHash: "h" }, 4, "2026-10-27", 1)).id).toBe("c1");
    expect(batches.at(-1)!.join(" ")).not.toContain("basis_hash");
    const missing: D1Binding = {
      prepare: () => {
        const s: D1Statement = {
          bind: () => s,
          first: (async () => { throw new Error("D1_ERROR: no such table: star_blocks: SQLITE_ERROR"); }) as D1Statement["first"],
          all: async () => ({ results: [], success: true }),
          run: async () => { throw new Error("D1_ERROR: no such table: star_blocks: SQLITE_ERROR"); },
        };
        return s;
      },
      batch: async (statements) => statements.map(() => ({ results: [], success: true })),
    };
    const old = createD1BondsRepo(missing);
    expect(await old.isBlocked("c1", "f")).toBe(false);
    await expect(old.blockFriend("c1", "f", 1)).resolves.toBeUndefined();
  });

  it("reads owners and joins on a database without 0019 (code deployed first): nobody belongs to an account", async () => {
    const missing: D1Binding = {
      prepare: (sql) => {
        const fail = async () => {
          if (sql.includes("user_id")) throw new Error("D1_ERROR: no such column: user_id: SQLITE_ERROR");
          return null;
        };
        const s: D1Statement = { bind: () => s, first: fail as D1Statement["first"], all: async () => ({ results: [], success: true }), run: async () => ({ results: [], success: true }) };
        return s;
      },
      batch: async (statements) => statements.map(() => ({ results: [], success: true })),
    };
    const repo = createD1BondsRepo(missing);
    expect(await repo.ownerOfUser("u1")).toBeNull();
    expect(await repo.linkOwner("o1", "u1")).toBe("unsupported");
  });
});
