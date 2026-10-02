// Worker upload-size gate (P6 spec §4.4). Bundles the Worker as `wrangler deploy` would (--dry-run:
// nothing is uploaded), reads wrangler's "Total Upload … / gzip …" line and compares the gzip size with
// scripts/worker-size-baseline.json. Fails above baseline + budget, or above the plan's limit.
// usage (after `pnpm cf:build`):
//   node scripts/check-worker-size.mjs              measure and check
//   node scripts/check-worker-size.mjs --baseline   measure and record the baseline (Task 1 only)
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselineFile = join(root, "scripts/worker-size-baseline.json");

/** KiB figures from wrangler's summary line, or null when the line is missing. */
export function parseUploadSize(output) {
  const m = /Total Upload:\s*([\d.,]+)\s*KiB\s*\/\s*gzip:\s*([\d.,]+)\s*KiB/i.exec(output);
  if (!m) return null;
  const num = (s) => Number(s.replace(/,/g, ""));
  return { rawKiB: num(m[1]), gzipKiB: num(m[2]) };
}

/** What is wrong with `gzipKiB` against the baseline; empty when it is within budget. */
export function budgetProblems(gzipKiB, baseline) {
  const problems = [];
  const ceiling = baseline.gzipKiB + baseline.budgetKiB;
  if (gzipKiB > ceiling) problems.push(`gzip ${gzipKiB} KiB > baseline ${baseline.gzipKiB} + budget ${baseline.budgetKiB} KiB`);
  if (gzipKiB > baseline.limitKiB) problems.push(`gzip ${gzipKiB} KiB > the ${baseline.plan} plan limit ${baseline.limitKiB} KiB`);
  return problems;
}

function measure() {
  const out = mkdtempSync(join(tmpdir(), "starlog-worker-"));
  try {
    const run = spawnSync("npx", ["wrangler", "deploy", "--dry-run", "--outdir", out], {
      cwd: join(root, "apps/web"),
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    const text = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
    const size = parseUploadSize(text);
    if (!size) throw new Error(`wrangler printed no "Total Upload" line:\n${text}`);
    return size;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const size = measure();
  const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
  if (process.argv.includes("--baseline")) {
    const next = { ...baseline, gzipKiB: size.gzipKiB, rawKiB: size.rawKiB, measuredAt: new Date().toISOString().slice(0, 10) };
    writeFileSync(baselineFile, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`baseline recorded: gzip ${size.gzipKiB} KiB (raw ${size.rawKiB} KiB)`);
  } else {
    const problems = budgetProblems(size.gzipKiB, baseline);
    console.log(`worker gzip ${size.gzipKiB} KiB (raw ${size.rawKiB}); baseline ${baseline.gzipKiB} + budget ${baseline.budgetKiB}; ${baseline.plan} limit ${baseline.limitKiB}`);
    if (problems.length) {
      console.error(problems.join("\n"));
      process.exit(1);
    }
  }
}
