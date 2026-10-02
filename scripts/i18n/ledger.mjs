// Review ledger (P6 spec §5.3, §6.1): one JSON per locale, content/i18n/review/<locale>.json, mapping a
// translation unit id to the hash of the Korean it was translated from, its status and its reviewer.
// A unit is "stale" when its Korean changed after the entry was written. Pure functions; the vitest
// jobs in scripts/i18n/*.test.ts do the file reading and writing.
import { createHash } from "node:crypto";

export const hashKo = (text) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

export const emptyLedger = (locale) => ({ schema: "starlog-i18n-review/1", locale, entries: {} });

/** New or changed units become drafts with the current hash; an unchanged entry keeps its status. */
export function recordDrafts(ledger, units) {
  const entries = { ...ledger.entries };
  for (const unit of units) {
    const koHash = hashKo(unit.ko);
    const entry = entries[unit.id];
    if (!entry || entry.koHash !== koHash) entries[unit.id] = { koHash, status: "draft", reviewer: null, date: null };
  }
  return { ...ledger, entries };
}

const globToRegex = (glob) => new RegExp(`^${glob.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);

/** Marks matching units reviewed, only where the entry's hash is the current Korean's. */
export function markReviewed(ledger, units, match, reviewer, date) {
  const re = globToRegex(match);
  const entries = { ...ledger.entries };
  for (const unit of units) {
    const entry = entries[unit.id];
    if (!re.test(unit.id) || !entry || entry.koHash !== hashKo(unit.ko)) continue;
    entries[unit.id] = { ...entry, status: "reviewed", reviewer, date };
  }
  return { ...ledger, entries };
}

export function unitStatus(entry, unit, present) {
  if (!present(unit)) return "missing";
  if (!entry) return "draft";
  if (entry.koHash !== hashKo(unit.ko)) return "stale";
  return entry.status === "reviewed" ? "reviewed" : "draft";
}

export function summarize(ledger, units, present) {
  const counts = { reviewed: 0, draft: 0, stale: 0, missing: 0, total: units.length };
  for (const unit of units) counts[unitStatus(ledger.entries[unit.id], unit, present)]++;
  return counts;
}
