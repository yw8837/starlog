// Stage and deck renders.   node render.mjs [--no-build] [--no-3x] [card-id-substring ...]
//   stages/<id>/{2-simplified,3-character-A,3-character-B}.png (600x1040)
//   render/<id>.{png,webp}, <id>-sm.webp (240x416), <id>@3x.{png,webp} from the active frame variant (deck.json "frame")
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCards, builtIds } from "./build.mjs";
import { launch, shotSvg, sharp } from "./lib/browser.mjs";
import { readFileSync } from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const deck = JSON.parse(readFileSync(path.join(ROOT, "deck.json"), "utf8"));
const args = process.argv.slice(2);
const noBuild = args.includes("--no-build");
const no3x = args.includes("--no-3x");
const subs = args.filter((a) => !a.startsWith("--"));
const all = await builtIds();
const ids = subs.length ? all.filter((i) => subs.some((s) => i.includes(s))) : all;

if (!noBuild) await buildCards(ids);
await mkdir(path.join(ROOT, "render"), { recursive: true });
const browser = await launch();
const rows = [];
const size = async (f) => `${((await stat(f)).size / 1024).toFixed(0).padStart(5)} KB`;
for (const id of ids) {
  const dir = path.join(ROOT, "stages", id);
  for (const n of ["2-simplified", "3-character-A", "3-character-B"]) {
    const png = path.join(dir, `${n}.png`);
    await shotSvg(browser, path.join(dir, `${n}.svg`), png, { scale: 1 });
    const buf = await sharp(png).png({ compressionLevel: 9, effort: 10 }).toBuffer();
    await sharp(buf).toFile(png);
    rows.push(`${`stages/${id}/${n}.png`.padEnd(58)} 600x1040 ${await size(png)}`);
  }
  // deck renders follow the active frame variant
  const active = `3-character-${deck.frame}`;
  const p1 = path.join(ROOT, "render", `${id}.png`);
  await copyFile(path.join(dir, `${active}.png`), p1);
  await sharp(p1).webp({ quality: 90, effort: 6, smartSubsample: true }).toFile(path.join(ROOT, "render", `${id}.webp`));
  if (!no3x) {
    const p3 = path.join(ROOT, "render", `${id}@3x.png`);
    await shotSvg(browser, path.join(ROOT, "svg", `${id}.svg`), p3, { scale: 3 });
    const b3 = await sharp(p3).png({ compressionLevel: 9, effort: 10 }).toBuffer();
    await sharp(b3).toFile(p3);
    await sharp(b3).webp({ quality: 92, effort: 6, smartSubsample: true }).toFile(path.join(ROOT, "render", `${id}@3x.webp`));
    await sharp(b3).resize(240, 416, { kernel: "lanczos3" }).webp({ quality: 88, effort: 6, smartSubsample: true }).toFile(path.join(ROOT, "render", `${id}-sm.webp`));
  }
  for (const f of [`${id}.png`, `${id}.webp`, `${id}-sm.webp`, `${id}@3x.png`, `${id}@3x.webp`]) {
    const file = path.join(ROOT, "render", f);
    try {
      const m = await sharp(file).metadata();
      rows.push(`${`render/${f}`.padEnd(58)} ${m.width}x${m.height} ${await size(file)}`);
    } catch {}
  }
}
if (!subs.length || subs.includes("back")) {
  const p1 = path.join(ROOT, "render", "back.png");
  const p3 = path.join(ROOT, "render", "back@3x.png");
  await shotSvg(browser, path.join(ROOT, "svg", "back.svg"), p1, { scale: 1 });
  await shotSvg(browser, path.join(ROOT, "svg", "back.svg"), p3, { scale: 3 });
  const b1 = await sharp(p1).png({ compressionLevel: 9, effort: 10 }).toBuffer();
  const b3 = await sharp(p3).png({ compressionLevel: 9, effort: 10 }).toBuffer();
  await sharp(b1).toFile(p1);
  await sharp(b3).toFile(p3);
  await sharp(b1).webp({ quality: 90, effort: 6, smartSubsample: true }).toFile(path.join(ROOT, "render", "back.webp"));
  await sharp(b3).webp({ quality: 92, effort: 6, smartSubsample: true }).toFile(path.join(ROOT, "render", "back@3x.webp"));
  await sharp(b3).resize(240, 416, { kernel: "lanczos3" }).webp({ quality: 88, effort: 6, smartSubsample: true }).toFile(path.join(ROOT, "render", "back-sm.webp"));
  for (const f of ["back.png", "back.webp", "back-sm.webp", "back@3x.png", "back@3x.webp"]) {
    const file = path.join(ROOT, "render", f);
    const m = await sharp(file).metadata();
    rows.push(`${`render/${f}`.padEnd(58)} ${m.width}x${m.height} ${await size(file)}`);
  }
}
await browser.close();
console.log(rows.join("\n"));
