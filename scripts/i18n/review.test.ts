// `I18N_REVIEW=ja I18N_MATCH='messages:common:*' I18N_REVIEWER='name' pnpm i18n:review` — for reviewers,
// after they read (and fixed) the matching translations. Units whose Korean changed stay draft.
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "vitest";
import { isLocale } from "@/lib/i18n/locales";
import { markReviewed } from "./ledger.mjs";
import { allUnits } from "./units";

test("mark reviewed", () => {
  const locale = process.env.I18N_REVIEW?.trim();
  const match = process.env.I18N_MATCH?.trim();
  const reviewer = process.env.I18N_REVIEWER?.trim();
  if (!isLocale(locale) || locale === "ko" || !match || !reviewer) throw new Error("Set I18N_REVIEW, I18N_MATCH and I18N_REVIEWER");
  const file = new URL(`../../content/i18n/review/${locale}.json`, import.meta.url);
  const ledger = JSON.parse(readFileSync(file, "utf8"));
  const next = markReviewed(ledger, allUnits(), match, reviewer, new Date().toISOString().slice(0, 10));
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
});
