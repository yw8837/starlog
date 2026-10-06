import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["node_modules", ".next", ".open-next", "test-results", "e2e"]);
/** The article bodies: a client file that reaches these ships every guide article to every browser. */
const ARTICLE_DATA = [join(WEB, "lib/guide.ts"), join(WEB, "lib/guide-articles")];

/** Value imports and re-exports (`import type` and all-`type` lists are erased at build time). */
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(WEB, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null; // packages: nothing of ours behind them
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const path = base + ext;
    if (existsSync(path) && statSync(path).isFile() && /\.tsx?$/.test(path)) return path;
  }
  return null;
}

function valueImports(file: string): string[] {
  const out: string[] = [];
  for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
    if (m[1]) continue;
    const names = /^\{([^}]*)\}$/.exec((m[2] ?? "").trim())?.[1]?.split(",").map((n) => n.trim()).filter(Boolean);
    if (names?.length && names.every((n) => n.startsWith("type "))) continue;
    const path = resolveImport(file, (m[3] ?? m[4]) as string);
    if (path) out.push(path);
  }
  return out;
}

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield path;
  }
}

/** The import chain from `start` to the article data, or null when the data is out of reach. */
function chainToArticles(start: string): string[] | null {
  const parent = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (ARTICLE_DATA.some((data) => file === data || file.startsWith(data + "\\") || file.startsWith(data + "/"))) {
      const chain: string[] = [];
      for (let at: string | null = file; at; at = parent.get(at) ?? null) chain.unshift(relative(WEB, at));
      return chain;
    }
    for (const next of valueImports(file)) {
      if (!parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return null;
}

it("no client component reaches the guide article bodies (they would ship in a browser chunk)", () => {
  const chains: string[] = [];
  for (const dir of ["app", "components", "lib"]) {
    for (const file of sources(join(WEB, dir))) {
      if (!/^\s*["']use client["']/.test(readFileSync(file, "utf8"))) continue;
      const chain = chainToArticles(file);
      if (chain) chains.push(chain.join(" -> "));
    }
  }
  expect(chains).toEqual([]);
  // Walking the source tree on this disk can take several seconds when other test files read it too.
}, 60_000);
