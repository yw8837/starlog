// The card faces as JPEG for the share images (app/api/og/share): satori, which draws them, cannot
// decode WebP. Each deck's small face (240×416 WebP in apps/web/public/cards) becomes
// apps/web/public/cards/og/<deck>/<cardId>.jpg at the same size.
//
// usage: node scripts/build-og-cards.mjs   (run again after the deck's faces change)
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cards = join(root, "apps/web/public/cards");
const DECKS = { starlog: join(cards, "starlog"), rws1909: cards };
const SMALL = /^([a-z0-9-]+)-sm\.webp$/;

let written = 0;
for (const [deck, folder] of Object.entries(DECKS)) {
  const out = join(cards, "og", deck);
  mkdirSync(out, { recursive: true });
  const ids = readdirSync(folder).map((name) => SMALL.exec(name)?.[1]).filter((id) => id && id !== "back");
  if (ids.length !== 78) throw new Error(`${deck}: expected 78 small faces, found ${ids.length}`);
  for (const id of ids) {
    const jpeg = await sharp(readFileSync(join(folder, `${id}-sm.webp`))).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    writeFileSync(join(out, `${id}.jpg`), jpeg);
    written++;
  }
}
console.log(`build-og-cards: ${written} JPEG faces in apps/web/public/cards/og`);
