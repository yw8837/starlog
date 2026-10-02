import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const WEB = fileURLToPath(new URL("../..", import.meta.url));
const SKIP = new Set(["node_modules", ".next", ".open-next", "test-results", "e2e"]);
/**
 * Value imports of the server-side catalog modules: from a client file they would ship all four
 * languages. `import type` lines are erased at build time and are allowed.
 */
const SERVER_ONLY = /^\s*import\s+(?!type\b)[^;]*?from\s+["'](?:@\/lib\/i18n\/(?:messages|translate|server)(?:\/[^"']*)?|(?:\.{1,2}\/)+(?:[\w-]+\/)*(?:messages|translate)(?:\/index)?)["']/m;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield path;
  }
}

it("no client component imports the full message catalogs", () => {
  const offenders: string[] = [];
  for (const dir of ["app", "components", "lib"]) {
    for (const file of sources(join(WEB, dir))) {
      const text = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/.test(text) && SERVER_ONLY.test(text)) offenders.push(relative(WEB, file));
    }
  }
  expect(offenders).toEqual([]);
});
