// 사주주 in hanbok as a PNG for the 사주 등급 share images (app/api/og/saju-grade): satori, which draws them, cannot decode WebP.
// The owner's own picture (apps/web/public/characters/rabbit-hanbok.v2-600.webp), the same pixels and size, with its
// transparency: nothing is drawn or generated. Writes apps/web/public/characters/og/rabbit-hanbok.v2-600.png.
//
// usage: node scripts/build-og-characters.mjs   (run again after the picture changes; bump its version with it)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const characters = join(root, "apps/web/public/characters");
const NAMES = ["rabbit-hanbok.v2-600"];

mkdirSync(join(characters, "og"), { recursive: true });
for (const name of NAMES) {
  const png = await sharp(readFileSync(join(characters, `${name}.webp`))).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  writeFileSync(join(characters, "og", `${name}.png`), png);
  console.log(`build-og-characters: ${name}.png ${png.length} bytes`);
}
