import "server-only";
import type { BondsRepo } from "./bondsRepo";
import { getDb } from "./d1";
import { createD1BondsRepo } from "./d1BondsRepo";
import { createMemoryBondsRepo } from "./memoryBondsRepo";

/**
 * Data access (Cloudflare D1, binding `DB`). The pattern every feature follows:
 * - Schema: `apps/web/migrations/NNNN_<name>.sql`, applied with
 *   `npx wrangler d1 migrations apply starlog --local|--remote` (from apps/web). An applied migration is
 *   never edited; changes go in the next number.
 * - Per feature: `<x>Repo.ts` (interface + camelCase row types), `d1<X>Repo.ts` (prepared statements,
 *   JSON columns as `*_json`, booleans as 0/1), `memory<X>Repo.ts` (tests and `next dev`), and one contract
 *   suite in `contract.ts` that both pass: `memory<X>Repo.test.ts`, and `d1<X>Repo.int.test.ts` on local D1
 *   with every migration applied.
 * - A factory below picks the store: D1 from `getDb()` on Workers; the in-memory one outside Workers,
 *   except in production, where a missing binding is an error (routes answer 503).
 * - Never store birth dates, questions or notes.
 */

export { getDb } from "./d1";

/** One memory store per server process, kept on globalThis so every route bundle in `next dev` shares it. */
function memoryStore<T>(key: string, make: () => T): T {
  const bag = globalThis as unknown as Record<string, T | undefined>;
  return (bag[key] ??= make());
}

export function bondsRepo(): BondsRepo {
  const db = getDb();
  if (db) return createD1BondsRepo(db);
  if (process.env.NODE_ENV === "production") throw new Error("DB binding missing");
  return memoryStore("__starlogMemoryBondsRepo", createMemoryBondsRepo);
}
