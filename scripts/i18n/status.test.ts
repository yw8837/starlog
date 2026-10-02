// `pnpm i18n:status`: counts per locale and kind. `I18N_GATE=<locale>` fails unless every Phase A unit
// and every Phase B unit listed in I18N_GATE_B (comma list of kinds, e.g. "decision,guide") is reviewed.
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { LOCALES, type Locale } from "@/lib/i18n/locales";
import { emptyLedger, summarize, unitStatus } from "./ledger.mjs";
import { allUnits, presentIn, type Unit } from "./units";

const ledgerFile = (locale: Locale) => new URL(`../../content/i18n/review/${locale}.json`, import.meta.url);
const readLedger = (locale: Locale) => (existsSync(ledgerFile(locale)) ? JSON.parse(readFileSync(ledgerFile(locale), "utf8")) : emptyLedger(locale));

test("translation status", () => {
  const units = allUnits();
  const kinds = [...new Set(units.map((u) => u.kind))];
  for (const locale of LOCALES.filter((l) => l !== "ko")) {
    const ledger = readLedger(locale);
    const present = (unit: Unit) => presentIn(locale, unit);
    for (const kind of kinds) {
      console.log(locale.padEnd(8), kind.padEnd(9), JSON.stringify(summarize(ledger, units.filter((u) => u.kind === kind), present)));
    }
  }
  const gate = process.env.I18N_GATE?.trim();
  if (!gate) return;
  const locale = gate as Locale;
  const phaseB = new Set((process.env.I18N_GATE_B ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const ledger = readLedger(locale);
  const blocking = units
    .filter((unit) => unit.phase === "A" || phaseB.has(unit.kind))
    .filter((unit) => unitStatus(ledger.entries[unit.id], unit, (u: Unit) => presentIn(locale, u)) !== "reviewed")
    .map((unit) => unit.id);
  if (blocking.length) console.error(`${locale}: ${blocking.length} units not reviewed, e.g.\n${blocking.slice(0, 40).join("\n")}`);
  expect(blocking).toEqual([]);
});
