import { DatabaseSync } from "node:sqlite";
import type { D1Binding, D1Result, D1Statement } from "../d1";

/**
 * P3's D1Binding over node:sqlite in memory, for Vitest. Foreign keys are on, as D1 enforces them.
 * batch() is one transaction that rolls back and rejects on the first failing statement, as D1's
 * does. Tests only: app code never imports this file (node:sqlite does not exist on Workers).
 */
export interface TestD1 extends D1Binding {
  /** raw SQL, several statements allowed (migrations, fixtures) */
  exec(sql: string): void;
}

type SqlValue = string | number | null;

/** D1 refuses undefined and stores booleans as 0/1. */
function sqlValue(value: unknown): SqlValue {
  if (value === undefined) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  throw new Error(`D1_TYPE_ERROR: Type '${typeof value}' not supported`);
}

/** Statements that hand rows back: reads, and writes with RETURNING. */
const RETURNS_ROWS = /^\s*(select|with|pragma)\b|\breturning\b/i;
const READ_ONLY = /^\s*(select|with|pragma)\b/i;

interface TestStatement extends D1Statement {
  execute(): D1Result;
}

export function createTestD1(): TestD1 {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");

  const execute = (sql: string, raw: unknown[]): D1Result => {
    const values = raw.map(sqlValue);
    const statement = db.prepare(sql);
    if (RETURNS_ROWS.test(sql)) {
      const results = statement.all(...values).map((row) => ({ ...row }));
      const changes = READ_ONLY.test(sql) ? 0 : Number((db.prepare("SELECT changes() AS n").get() as { n: number }).n);
      return { results, success: true, meta: { changes } };
    }
    const info = statement.run(...values);
    return { results: [], success: true, meta: { changes: Number(info.changes) } };
  };

  const prepared = (sql: string, values: unknown[]): TestStatement => ({
    bind: (...next: unknown[]) => prepared(sql, next),
    first: async <T>() => (execute(sql, values).results[0] as T | undefined) ?? null,
    all: async <T>() => execute(sql, values) as unknown as D1Result<T>,
    run: async () => execute(sql, values),
    execute: () => execute(sql, values),
  });

  return {
    prepare: (sql) => prepared(sql, []),
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = statements.map((statement) => (statement as TestStatement).execute());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    exec: (sql) => db.exec(sql),
  };
}
