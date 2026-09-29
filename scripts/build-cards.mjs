import sharp from "sharp";
import { readFile, mkdir } from "node:fs/promises";
const manifest = JSON.parse(await readFile("assets/cards/rws1909/manifest.json", "utf8"));
await mkdir("apps/web/public/cards", { recursive: true });
for (const m of manifest) {
  const id = m.file.replace(/\.jpg$/, "");
  const src = sharp(`assets/cards/rws1909/${m.file}`);
  const { width, height } = await src.metadata();
  // trim the off-white scan border (~2.2%) so card edges are clean, keep aspect
  const dx = Math.round(width * 0.022), dy = Math.round(height * 0.016);
  const base = src.extract({ left: dx, top: dy, width: width - dx * 2, height: height - dy * 2 });
  await base.clone().resize({ width: 600 }).webp({ quality: 82 }).toFile(`apps/web/public/cards/${id}.webp`);
  await base.clone().resize({ width: 240 }).webp({ quality: 78 }).toFile(`apps/web/public/cards/${id}-sm.webp`);
}
console.log("built", manifest.length * 2, "images");
