// Card modules -> stages/<id>/{2-simplified,3-character-A,3-character-B}.svg, svg/<id>.svg (active frame variant).
//   node build.mjs [card-id ...]            (also copies stage 1: the 1909 scan)
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bundleParts } from "./bundle-parts.mjs";
import { buildBack } from "./back.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");
export const SCANS = "D:/Money/apps/saju-tarot/apps/web/public/cards";

const kit = async () => import(pathToFileURL(path.join(HERE, "lib", "kit.mjs")).href);

export async function builtIds() {
  const files = await readdir(path.join(ROOT, "cards"));
  return files.filter((f) => f.endsWith(".mjs")).map((f) => f.replace(/\.mjs$/, "")).sort();
}

/** Wrap a stage body with the frame and the svg document. */
export function wrap(k, meta, frameVariant, stage) {
  const body = `${stage.body}\n${k.frame({ numeral: meta.numeral, name: meta.ko, keyword: meta.keyword, variant: frameVariant })}`;
  return k.svgDoc({ title: stage.title, desc: stage.desc, defs: stage.defs ?? "", body });
}

export async function buildCards(ids, { bundle = true } = {}) {
  if (bundle) await bundleParts();
  const k = await kit();
  const list = (ids?.length ? ids : await builtIds()).filter((i) => i !== "back");
  const written = [];
  for (const id of list) {
    const meta = k.DECK.cards.find((c) => c.id === id);
    if (!meta) throw new Error(`${id} is not in deck.json`);
    const dir = path.join(ROOT, "stages", id);
    await mkdir(dir, { recursive: true });
    await copyFile(path.join(SCANS, `${id}.webp`), path.join(dir, "1-original.webp"));
    const mod = await import(pathToFileURL(path.join(ROOT, "cards", `${id}.mjs`)).href + `?t=${Date.now()}`);
    const out = {};
    k.resetUid();
    out["2-simplified"] = wrap(k, meta, "A", mod.stage2(k));
    for (const v of ["A", "B"]) {
      k.resetUid();
      out[`3-character-${v}`] = wrap(k, meta, v, mod.stage3(k));
    }
    for (const [name, svg] of Object.entries(out)) {
      const file = path.join(dir, `${name}.svg`);
      await writeFile(file, svg, "utf8");
      written.push({ id, name, file, bytes: Buffer.byteLength(svg) });
    }
    // the deck master follows deck.json "frame"
    const active = out[`3-character-${k.DECK.frame}`];
    await mkdir(path.join(ROOT, "svg"), { recursive: true });
    await writeFile(path.join(ROOT, "svg", `${id}.svg`), active, "utf8");
  }
  if (!ids?.length || ids.includes("back")) await buildBack();
  return written;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const out = await buildCards(process.argv.slice(2));
  for (const o of out) console.log(`${o.id}/${o.name}.svg  ${(o.bytes / 1024).toFixed(1)} KB`);
}
