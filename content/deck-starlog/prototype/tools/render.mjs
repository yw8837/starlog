// svg/*.svg -> render/*.png|webp at the app's card size (600x1040), 3x (1800x3120) and the small srcset size (240x416).
//   node render.mjs [--no-build] [card-id ...]
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCards, CARDS, OUT_SVG } from "./build.mjs";
import { launch, shotSvg, sharp } from "./lib/browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "..", "render");
const W = 600;
const H = 1040;

const args = process.argv.slice(2);
const noBuild = args.includes("--no-build");
const ids = args.filter((a) => !a.startsWith("--"));
const list = ids.length ? ids : CARDS;

await mkdir(OUT, { recursive: true });
if (!noBuild) await buildCards(list);

const browser = await launch();
const rows = [];
for (const id of list) {
  const svg = path.join(OUT_SVG, `${id}.svg`).replace(/\\/g, "/");
  const p1 = path.join(OUT, `${id}.png`);
  const p3 = path.join(OUT, `${id}@3x.png`);
  await shotSvg(browser, svg, p1, { width: W, height: H, scale: 1 });
  await shotSvg(browser, svg, p3, { width: W, height: H, scale: 3 });

  // re-encode PNGs smaller (lossless), then WebPs
  const b1 = await sharp(p1).png({ compressionLevel: 9, effort: 10 }).toBuffer();
  const b3 = await sharp(p3).png({ compressionLevel: 9, effort: 10 }).toBuffer();
  await sharp(b1).toFile(p1);
  await sharp(b3).toFile(p3);
  await sharp(b1).webp({ quality: 90, effort: 6, smartSubsample: true }).toFile(path.join(OUT, `${id}.webp`));
  await sharp(b3).webp({ quality: 92, effort: 6, smartSubsample: true }).toFile(path.join(OUT, `${id}@3x.webp`));
  await sharp(b3).resize(240, 416, { kernel: "lanczos3" }).webp({ quality: 88, effort: 6, smartSubsample: true }).toFile(path.join(OUT, `${id}-sm.webp`));

  for (const f of [`${id}.png`, `${id}.webp`, `${id}-sm.webp`, `${id}@3x.png`, `${id}@3x.webp`]) {
    const m = await sharp(path.join(OUT, f)).metadata();
    const { size } = await stat(path.join(OUT, f));
    rows.push(`${f.padEnd(34)} ${String(m.width).padStart(4)}x${String(m.height).padEnd(4)} ${(size / 1024).toFixed(0).padStart(6)} KB`);
  }
}
await browser.close();
console.log(rows.join("\n"));
