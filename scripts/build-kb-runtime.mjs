// Builds apps/web/lib/kb/cards.generated.json: the fields of content/kb/cards/*.json that reading
// prompts and validators need, in one compact module bundled into the Worker (no fs at runtime).
// usage: node scripts/build-kb-runtime.mjs   (re-run after editing the KB, then commit the output)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const kbDir = join(root, "content/kb/cards");
const outFile = join(root, "apps/web/lib/kb/cards.generated.json");

const index = JSON.parse(readFileSync(join(kbDir, "_index.json"), "utf8"));

/** Drops null/undefined fields so the bundle stays small. */
const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined));

function slim(card) {
  const { imagery, core } = card;
  return compact({
    id: card.id,
    names: compact({ ko: card.names.ko, en: card.names.en, koAliases: card.names.koAliases }),
    arcana: card.arcana,
    suit: card.suit,
    rank: card.rank,
    number: card.number,
    roman: card.roman,
    element: card.element,
    keywordsKo: card.keywordsKo,
    imagery: {
      facts: imagery.facts.map(({ id, ko, salience }) => ({ id, ko, salience })),
      misdescriptions: imagery.commonMisdescriptions.map(({ wrong, correct, regex }) => ({ wrong, correct, regex })),
      // Waite-1911 glosses duplicate `core`; the modern/editorial ones carry the symbol readings prompts use.
      glosses: imagery.glosses.filter((g) => g.school !== "waite-1911").map(({ factId, ko }) => ({ factId, ko })),
    },
    core: { upright: core.upright, reversed: core.reversed, oneLine: core.oneLine, shadow: core.shadow },
    reversedModes: card.reversedModes,
    topics: card.topics,
    positionHints: card.positionHints,
    actionHints: card.actionHints,
    cautions: card.cautions.map(({ code, doNotClaim, instead }) => ({ code, doNotClaim, instead })),
    combinations: card.combinations,
    court: card.court ? { asAttitude: card.court.asAttitude } : undefined,
    stage: card.numerology?.stage,
    safety: card.safety,
  });
}

const cards = index.ids.map((id) => {
  const card = JSON.parse(readFileSync(join(kbDir, `${id}.json`), "utf8"));
  if (card.id !== id) throw new Error(`${id}.json has id ${card.id}`);
  for (const m of card.imagery.commonMisdescriptions) new RegExp(m.regex); // fail the build on a bad regex
  return slim(card);
});

const files = readdirSync(kbDir).filter((name) => name.endsWith(".json") && name !== "_index.json");
if (files.length !== cards.length) throw new Error(`index lists ${cards.length} cards, folder has ${files.length}`);

const out = {
  schema: index.schema,
  schemaVersion: index.schemaVersion,
  topicMap: index.topicMap,
  positionFallback: index.positionFallback,
  highRisk: index.highRisk,
  cards,
};

const json = JSON.stringify(out);
writeFileSync(outFile, `${json}\n`);
const raw = Buffer.byteLength(json);
const gz = gzipSync(json).length;
console.log(`build-kb-runtime: ${cards.length} cards -> ${outFile.slice(root.length + 1)} (${(raw / 1024).toFixed(0)} KB raw, ${(gz / 1024).toFixed(0)} KB gzip)`);
