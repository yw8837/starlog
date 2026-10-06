// Cards -> svg/*.svg.   node build.mjs [card-id ...]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bundleParts } from "./bundle-parts.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT_SVG = path.resolve(HERE, "..", "svg");

export const CARDS = ["major-00-fool", "major-01-magician", "major-17-star"];

const FILES = {
  "major-00-fool": "fool.mjs",
  "major-01-magician": "magician.mjs",
  "major-17-star": "star.mjs",
};

export async function buildCards(ids = CARDS, { bundle = true } = {}) {
  if (bundle) await bundleParts();
  const kit = await import(pathToFileURL(path.join(HERE, "lib", "kit.mjs")).href);
  await mkdir(OUT_SVG, { recursive: true });
  const written = [];
  for (const id of ids) {
    kit.resetUid();
    const mod = await import(pathToFileURL(path.join(HERE, "cards", FILES[id])).href + `?t=${Date.now()}`);
    const svg = mod.default(kit);
    const file = path.join(OUT_SVG, `${id}.svg`);
    await writeFile(file, svg, "utf8");
    written.push({ id, file, bytes: Buffer.byteLength(svg) });
  }
  return written;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const ids = process.argv.slice(2);
  const out = await buildCards(ids.length ? ids : CARDS);
  for (const o of out) console.log(`${o.id}.svg  ${(o.bytes / 1024).toFixed(1)} KB`);
}
