// Builds apps/web/lib/kb/i18n.generated.json from content/kb/i18n/<locale>/<id>.json (P6 Task 13):
// the fields prompts and validators read, per locale and card. Fails on a missing card or locale.
// Stale translations (sourceHash ≠ the Korean now) are listed, not fatal: the review gate decides.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { hashKo } from "./i18n/ledger.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = ["en", "ja", "zh-hant"];

/**
 * The Korean a card's translation is made from, in a fixed order. Glosses of school "waite-1911" are left out,
 * as in scripts/build-kb-runtime.mjs (they duplicate `core` and never reach a prompt); a fact can also carry
 * one of those next to a modern gloss, which a Record keyed by fact id cannot hold.
 */
export function koSource(card) {
  return JSON.stringify([
    card.names.ko, card.keywordsKo,
    card.imagery.facts.map((f) => [f.id, f.ko]),
    card.imagery.glosses.filter((g) => g.school !== "waite-1911").map((g) => [g.factId, g.ko]),
    card.reversedModes.gloss,
    card.imagery.commonMisdescriptions.map((m) => m.wrong),
  ]);
}

/** The 78 card ids, in the KB index's order. */
export function cardIds() {
  const { ids } = JSON.parse(readFileSync(join(root, "content/kb/cards/_index.json"), "utf8"));
  if (!Array.isArray(ids) || ids.length !== 78) throw new Error("content/kb/cards/_index.json: expected 78 ids");
  return ids;
}

function build() {
  const ids = cardIds();
  const out = {};
  const stale = [];
  for (const locale of LOCALES) {
    out[locale] = {};
    const dir = join(root, "content/kb/i18n", locale);
    const files = new Set(readdirSync(dir));
    for (const id of ids) {
      if (!files.has(`${id}.json`)) throw new Error(`content/kb/i18n/${locale}/${id}.json is missing`);
      const t = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8"));
      const card = JSON.parse(readFileSync(join(root, "content/kb/cards", `${id}.json`), "utf8"));
      if (t.sourceHash !== hashKo(koSource(card))) stale.push(`${locale}/${id} (now ${hashKo(koSource(card))})`);
      out[locale][id] = { name: t.name, aliases: t.aliases, keywords: t.keywords, facts: t.facts, glosses: t.glosses, reversedGloss: t.reversedGloss, misdescriptions: t.misdescriptions };
    }
  }
  const json = `${JSON.stringify(out)}\n`;
  writeFileSync(join(root, "apps/web/lib/kb/i18n.generated.json"), json);
  console.log(`kb i18n: ${(json.length / 1024).toFixed(0)} KiB raw, ${(gzipSync(json).length / 1024).toFixed(0)} KiB gzip; ${stale.length} stale`);
  if (stale.length) console.log(stale.join("\n"));
}

// Importing this file (scripts/i18n/units/kb.ts uses koSource) must not rebuild anything.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) build();
