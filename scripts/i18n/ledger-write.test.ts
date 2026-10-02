// `pnpm i18n:ledger -- <locale>`: after writing or changing translations, record them as drafts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { test } from "vitest";
import { isLocale } from "@/lib/i18n/locales";
import { emptyLedger, recordDrafts } from "./ledger.mjs";
import { allUnits, presentIn } from "./units";

test("record drafts", () => {
  const locale = process.env.I18N_LOCALE?.trim();
  if (!isLocale(locale) || locale === "ko") throw new Error("Set I18N_LOCALE to en, ja or zh-hant");
  const file = new URL(`../../content/i18n/review/${locale}.json`, import.meta.url);
  mkdirSync(new URL("../../content/i18n/review/", import.meta.url), { recursive: true });
  const ledger = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : emptyLedger(locale);
  const units = allUnits().filter((unit) => presentIn(locale, unit));
  const next = recordDrafts(ledger, units);
  const sorted = { ...next, entries: Object.fromEntries(Object.entries(next.entries).sort(([a], [b]) => a.localeCompare(b))) };
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`${locale}: ${units.length} units present, ledger written`);
});
