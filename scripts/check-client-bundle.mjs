// Fails when paid reading text reaches the client bundle (apps/web/.next/static), when an AI
// model or vendor name does (model names stay blind on every user surface; ids like claude-…), or
// when a secret does (Toss secret-key prefixes, and the real values this shell holds).
// Paid text may only travel as server-rendered props of an opened chapter, never in static JS/CSS.
// usage: pnpm check:bundle   (after `pnpm build`; `pnpm build` runs it too)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = join(root, "apps/web/.next/static");
const samples = ["content/samples/saju-prologue.ko.json", "content/samples/tarot-contact.ko.json"];

/** Every long string under `paid` (headings excepted: they are the free locked list) and the story body. */
function probesFrom(sample) {
  const out = [];
  const walk = (value, key) => {
    if (typeof value === "string") {
      if (key !== "heading" && value.length >= 20) out.push(value.slice(0, 24));
    } else if (Array.isArray(value)) {
      value.forEach((item) => walk(item, key));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(sample.paid, "paid");
  if (sample.story?.body) out.push(sample.story.body.slice(0, 24));
  return out;
}

const probes = [
  // The review's probe strings, kept verbatim.
  "태어난 달의 지지 자수(子水)는 병화에게 정관",
  "먼저 보내도 괜찮아요. 다만 카드가 힘을 실어",
  ...samples.flatMap((file) => probesFrom(JSON.parse(readFileSync(join(root, file), "utf8")))),
];

// A probe must be real paid text, and never also free text (or the check would be meaningless).
for (const file of samples) {
  const sample = JSON.parse(readFileSync(join(root, file), "utf8"));
  const freeText = JSON.stringify(sample.free);
  for (const probe of probes) {
    if (freeText.includes(probe)) throw new Error(`probe is free text in ${file}: ${probe}`);
  }
}

/**
 * Model and vendor names that must never ship to the browser (case-sensitive, as written). Not the
 * bare word "Gemini": it is also the zodiac sign 쌍둥이자리 in the 별자리 인연 catalog.
 */
const blindProbes = ["claude-", "Claude", "클로드", "Opus", "오푸스", "Sonnet", "GPT", "gemini-", "Google Gemini", "제미나이"];

// Secrets must never reach the browser: Toss secret-key prefixes, and the real values when this shell
// has them (reported by name only, never printed).
const SECRET_PREFIXES = ["test_gsk_", "live_gsk_", "test_sk_", "live_sk_"];
const SECRET_NAMES = ["TOSS_SECRET_KEY", "KAKAO_CLIENT_SECRET", "STARLOG_ACCOUNT_SECRET", "STARLOG_SIGNING_SECRET", "STARLOG_CRON_SECRET", "ANTHROPIC_API_KEY", "STARLOG_OWNER_CODE"];
const secretProbes = [
  ...SECRET_PREFIXES.map((prefix) => ({ label: `secret key prefix ${prefix}`, value: prefix })),
  ...SECRET_NAMES.flatMap((name) => {
    const value = process.env[name]?.trim();
    return value && value.length >= 8 ? [{ label: `value of ${name}`, value }] : [];
  }),
];

if (!existsSync(staticDir)) {
  console.error(`check-client-bundle: ${relative(root, staticDir)} not found. Run \`pnpm build\` first.`);
  process.exit(2);
}

const escapeNonAscii = (text) => text.replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

/**
 * The forms a probe can take inside a bundle: as written, with its double quotes escaped (a string
 * literal or JSON inside JS), and each of those with non-ASCII as \uXXXX escapes (either case).
 */
function forms(probe) {
  const quoted = [...new Set([probe, probe.replaceAll('"', '\\"')])];
  return [...new Set(quoted.flatMap((text) => [text, escapeNonAscii(text), escapeNonAscii(text).toLowerCase()]))];
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

let scanned = 0;
const hits = [];
for (const path of files(staticDir)) {
  if (!/\.(js|mjs|css|json|txt|html|map)$/.test(path)) continue;
  scanned++;
  const text = readFileSync(path, "utf8");
  for (const probe of probes) {
    if (forms(probe).some((form) => text.includes(form))) hits.push(`${relative(root, path)}: ${probe}`);
  }
  for (const name of blindProbes) {
    if (forms(name).some((form) => text.includes(form))) hits.push(`${relative(root, path)}: model/vendor name "${name}"`);
  }
  for (const probe of secretProbes) {
    if (text.includes(probe.value)) hits.push(`${relative(root, path)}: ${probe.label}`);
  }
}

if (hits.length > 0) {
  console.error(`check-client-bundle: paid text, model names or secrets found in the client bundle (${hits.length} hits):`);
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log(`check-client-bundle: ok, ${probes.length} paid-text probes, ${blindProbes.length} model-name probes, ${secretProbes.length} secret probes, ${scanned} static files, 0 hits`);
