// Builds the brand icons from one SVG: the wordmark's gold star on the night sky.
//   apps/web/app/favicon.ico     32 and 48 px (PNG inside ICO), for crawlers that only ask for /favicon.ico
//   apps/web/app/icon.png        192 px, rounded: the favicon search results show (a multiple of 48 px)
//   apps/web/app/apple-icon.png  180 px, square: iOS rounds it itself
//   apps/web/public/logo.png     512 px, square: the Organization logo in JSON-LD (lib/jsonld.ts)
// usage: node scripts/build-icons.mjs   (sharp is a root devDependency)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps/web");

/** components/brand/Wordmark.tsx WORDMARK_STAR_PATH (24-unit box). */
const STAR = "M12 2.5l2.8 6.2 6.7.6-5.1 4.4 1.6 6.6L12 16.8 6 20.3l1.6-6.6-5.1-4.4 6.7-.6z";

const svg = ({ rounded }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="sky" cx="50%" cy="42%" r="70%">
      <stop offset="0" stop-color="#2B2272"/>
      <stop offset="1" stop-color="#0D0A26"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#F3DCA1" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#F3DCA1" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#sky)"/>
  <circle cx="256" cy="262" r="190" fill="url(#glow)"/>
  <circle cx="112" cy="122" r="7" fill="#F1ECFF" opacity="0.85"/>
  <circle cx="404" cy="104" r="5" fill="#F1ECFF" opacity="0.7"/>
  <circle cx="418" cy="402" r="6" fill="#F1ECFF" opacity="0.75"/>
  <circle cx="96" cy="388" r="4" fill="#F1ECFF" opacity="0.6"/>
  <path d="${STAR}" fill="#F3DCA1" transform="translate(256 262) scale(14.5) translate(-12 -11.4)"/>
</svg>`;

const png = (size, rounded) => sharp(Buffer.from(svg({ rounded }))).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** An ICO whose images are PNGs (supported by every current browser and crawler). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

const outputs = [
  [join(web, "app/icon.png"), await png(192, true)],
  [join(web, "app/apple-icon.png"), await png(180, false)],
  [join(web, "public/logo.png"), await png(512, false)],
  [join(web, "app/favicon.ico"), ico([{ size: 32, data: await png(32, true) }, { size: 48, data: await png(48, true) }])],
];
for (const [path, data] of outputs) {
  writeFileSync(path, data);
  console.log(`${path.slice(root.length + 1)}: ${data.length} bytes`);
}
