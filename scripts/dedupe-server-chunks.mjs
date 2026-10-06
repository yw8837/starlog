// Turbopack can emit one server chunk several times under different names (one per group of routes),
// byte for byte the same apart from the source map comment. OpenNext bundles every chunk file into the
// Worker, so each copy costs its full size (on 2026-10-07: 7 copies of a 1.2 MB chunk holding the card
// KB, the AI client and zod). This keeps the first copy of each set and turns the others into a one-line
// re-export of it: the Turbopack runtime gets the same module list from either path, and the Worker
// carries the code once. Runs after `next build` (apps/web "build" script), before OpenNext copies the
// standalone output; only files in the same directory are compared, so the chunks/ssr runtime keeps its own.
// usage: node scripts/dedupe-server-chunks.mjs   (from anywhere; `pnpm build` and `pnpm cf:build` run it)
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps/web");

const SOURCE_MAP_COMMENT = /\n\/\/# sourceMappingURL=[^\n]*\n?$/;
/** Turbopack's CommonJS server chunk: `module.exports=[id, factory, …]`. Anything else is left alone. */
const CHUNK = /^module\.exports\s*=\s*\[/;

/**
 * Rewrites the duplicate chunks of one directory (not its subdirectories) and returns what it did,
 * as [duplicate, kept] file names.
 */
export function dedupeChunkDir(dir) {
  const byContent = new Map();
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".js") || !statSync(join(dir, name)).isFile()) continue;
    const code = readFileSync(join(dir, name), "utf8").replace(SOURCE_MAP_COMMENT, "");
    if (!CHUNK.test(code)) continue;
    const hash = createHash("sha256").update(code).digest("hex");
    byContent.set(hash, [...(byContent.get(hash) ?? []), name]);
  }
  const rewritten = [];
  for (const [kept, ...duplicates] of byContent.values()) {
    for (const name of duplicates) {
      writeFileSync(join(dir, name), `module.exports=require("./${kept}");\n`);
      rewritten.push([name, kept]);
    }
  }
  return rewritten;
}

/** Every directory under `dir`, `dir` included. */
function* dirs(dir) {
  yield dir;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* dirs(path);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // The build output and its standalone copy (OpenNext bundles the Worker from the latter).
  const chunkRoots = [join(web, ".next/server/chunks"), join(web, ".next/standalone", relative(root, web), ".next/server/chunks")];
  for (const chunkRoot of chunkRoots.filter((path) => existsSync(path))) {
    let count = 0;
    let bytes = 0;
    for (const dir of dirs(chunkRoot)) {
      for (const [, kept] of dedupeChunkDir(dir)) {
        count++;
        bytes += statSync(join(dir, kept)).size;
      }
    }
    console.log(`dedupe-server-chunks: ${relative(root, chunkRoot)}: ${count} duplicate chunks now re-export their twin (${(bytes / 1024).toFixed(0)} KiB of copies)`);
  }
}
