// Builds the 스타로그 카드 deck for the app from the owner's PNGs (outside the repo, never copied in).
//   apps/web/public/cards/starlog/<cardId>.webp, <cardId>-sm.webp   78 faces, 600x1040 and 240x416
//   apps/web/public/cards/backs/<name>.webp, <name>-sm.webp         4 backs, the same two sizes
//   apps/web/public/cards/starlog/manifest.json                     each output's source file and its SHA-256
// The Starlog cards are taller (about 1:1.78) than the 600:1040 box TarotCard draws every face in, and they carry
// their own gold frame, so `object-fit: cover` would clip it. Each image is scaled to the box's height and the
// sides are padded with the image's own outer margin colour (the median of its outermost pixels), so the whole
// frame shows and the box's ratio holds. Re-run after the owner fixes a PNG: the outputs are deterministic, so
// only the changed card shows up in the diff.
// usage: node scripts/build-starlog-deck.mjs [deckDir]   (default D:/타로, with 한글/ and 뒷면/ inside; sharp is a
// root devDependency; Node 22.18+ so the card list can be read from packages/core, which is TypeScript)
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

let CARDS;
try {
  ({ CARDS } = await import("../packages/core/src/tarot/cards.ts"));
} catch (error) {
  throw new Error(`cannot read the card list from packages/core/src/tarot/cards.ts (Node 22.18+ reads TypeScript): ${error.message}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cardsDir = join(root, "apps/web/public/cards");
const deckDir = process.argv[2] ?? "D:/타로";
const FRONT_FOLDER = "한글";
const BACK_FOLDER = "뒷면";

/** The box TarotCard draws every face and back in (components/tarot/TarotCard.module.css), and its small twin. */
const SIZES = { lg: { width: 600, height: 1040, suffix: "" }, sm: { width: 240, height: 416, suffix: "-sm" } };
/** Lossy WebP. The face PNGs are dense paintings: quality 82 would put the 156 faces near 13 MB, 60 keeps them under the budget. */
const WEBP = { faces: { quality: 60, effort: 6, smartSubsample: true }, backs: { quality: 82, effort: 6, smartSubsample: true } };
const FACE_BUDGET_BYTES = 9_000_000;
/** Pixels at each side that count as the outer margin; the margin is about 13 px wide in the 941 px PNGs. */
const MARGIN_PX = 6;

const SUIT_OF = { W: "wands", C: "cups", S: "swords", P: "pentacles" };
/** The owner's back files, by the CardBack name lib/deck.ts uses (02 is the default). */
const BACKS = {
  "01-남색금선.png": "navy-gold",
  "02-별자리지도.png": "constellation",
  "03-아이보리리본정원.png": "ribbon-garden",
  "04-달빛수호문양.png": "moon-guardian",
};

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const median = (values) => values.sort((a, b) => a - b)[values.length >> 1];
const pngsIn = (folder) => readdirSync(join(deckDir, folder)).filter((name) => name.toLowerCase().endsWith(".png")).map((name) => name.normalize("NFC")).sort();

/** M00-바보.png → major-00-fool, W01-완드 에이스.png → wands-01; the name in the file must be the card's own. */
function cardIdOf(fileName) {
  const match = /^([MWCSP])(\d{2})-(.+)\.png$/.exec(fileName);
  if (!match) throw new Error(`${FRONT_FOLDER}/${fileName}: not a card file (expected M00-바보.png, W01-완드 에이스.png, …)`);
  const [, letter, digits, name] = match;
  const number = Number(digits);
  const card = CARDS.find((c) => (letter === "M" ? c.arcana === "major" : c.suit === SUIT_OF[letter]) && c.number === number);
  if (!card) throw new Error(`${FRONT_FOLDER}/${fileName}: the app has no card ${letter}${digits}`);
  if (card.names.ko !== name) throw new Error(`${FRONT_FOLDER}/${fileName}: the file says "${name}", but ${card.id} is "${card.names.ko}"`);
  return card.id;
}

/** Face file per card id: exactly the app's 78, none twice, none left over. */
function faceFiles() {
  const byId = new Map();
  for (const fileName of pngsIn(FRONT_FOLDER)) {
    const id = cardIdOf(fileName);
    if (byId.has(id)) throw new Error(`${id} has two files: ${byId.get(id)} and ${fileName}`);
    byId.set(id, fileName);
  }
  const missing = CARDS.filter((card) => !byId.has(card.id)).map((card) => card.id);
  if (missing.length > 0) throw new Error(`${FRONT_FOLDER}/ lacks ${missing.length} of ${CARDS.length} cards: ${missing.join(", ")}`);
  return byId;
}

function backFiles() {
  const found = pngsIn(BACK_FOLDER);
  const extra = found.filter((name) => !(name in BACKS));
  const missing = Object.keys(BACKS).filter((name) => !found.includes(name));
  if (extra.length > 0 || missing.length > 0) throw new Error(`${BACK_FOLDER}/ must hold exactly ${Object.keys(BACKS).join(", ")} (extra: ${extra.join(", ") || "none"}; missing: ${missing.join(", ") || "none"})`);
  return found;
}

/** The image's own outer margin colour: the per-channel median of its outermost pixels at both sides. */
async function marginColour(source) {
  const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = [[], [], []];
  for (let y = Math.floor(info.height * 0.1); y < Math.floor(info.height * 0.9); y++) {
    for (let k = 0; k < MARGIN_PX; k++) {
      for (const x of [k, info.width - 1 - k]) for (let c = 0; c < 3; c++) channels[c].push(data[(y * info.width + x) * 3 + c]);
    }
  }
  const [r, g, b] = channels.map(median);
  return { r, g, b };
}

/** The image at the box's height, its sides padded with `colour` to the box's width. */
async function render(source, { width, height }, colour, webp) {
  const meta = await sharp(source).metadata();
  const scaled = Math.round((meta.width * height) / meta.height);
  if (scaled > width) throw new Error(`a ${meta.width}x${meta.height} image is wider than the ${width}x${height} box at that height`);
  const left = Math.floor((width - scaled) / 2);
  return sharp(source)
    .flatten({ background: colour })
    .resize(scaled, height, { fit: "fill" })
    .extend({ left, right: width - scaled - left, background: colour })
    .webp(webp)
    .toBuffer();
}

async function build(folder, name, fileName, outDir, outName, webp) {
  const source = readFileSync(join(deckDir, folder, fileName));
  const colour = await marginColour(source);
  const outputs = [];
  for (const size of Object.values(SIZES)) outputs.push({ path: join(outDir, `${outName}${size.suffix}.webp`), data: await render(source, size, colour, webp) });
  return { name, colour, entry: { source: `${folder}/${fileName}`, sha256: sha256(source), padding: hex(colour) }, outputs };
}

// Both folders are checked before anything is rendered or written.
const faceFile = faceFiles();
const backFile = backFiles();
const faces = [];
for (const { id } of CARDS) faces.push(await build(FRONT_FOLDER, id, faceFile.get(id), join(cardsDir, "starlog"), id, WEBP.faces));
const backs = [];
for (const fileName of backFile) backs.push(await build(BACK_FOLDER, BACKS[fileName], fileName, join(cardsDir, "backs"), BACKS[fileName], WEBP.backs));

const bytes = (list) => list.reduce((sum, item) => sum + item.outputs.reduce((n, out) => n + out.data.length, 0), 0);
const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;
if (bytes(faces) > FACE_BUDGET_BYTES) throw new Error(`the ${faces.length * 2} faces come to ${mb(bytes(faces))}, over the ${mb(FACE_BUDGET_BYTES)} budget: lower WEBP.faces.quality (nothing was written)`);

for (const item of [...faces, ...backs]) {
  for (const out of item.outputs) {
    mkdirSync(dirname(out.path), { recursive: true });
    writeFileSync(out.path, out.data);
  }
}
const entries = (list) => Object.fromEntries(list.map((item) => [item.name, item.entry]));
const manifest = {
  generator: "scripts/build-starlog-deck.mjs",
  webp: { faces: WEBP.faces, backs: WEBP.backs },
  sizes: Object.fromEntries(Object.entries(SIZES).map(([key, { width, height }]) => [key, `${width}x${height}`])),
  faces: entries(faces),
  backs: entries(backs),
};
writeFileSync(join(cardsDir, "starlog/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const channel = (c) => faces.map((item) => item.colour[c]);
const typical = Object.fromEntries(["r", "g", "b"].map((c) => [c, median(channel(c))]));
const range = (c) => `${Math.min(...channel(c))}-${Math.max(...channel(c))}`;
console.log(`faces: ${faces.length} cards, ${faces.length * 2} files, ${mb(bytes(faces))}`);
console.log(`backs: ${backs.length} backs, ${backs.length * 2} files, ${mb(bytes(backs))}`);
console.log(`total: ${mb(bytes(faces) + bytes(backs))}`);
console.log(`face padding: median ${hex(typical)} (r ${range("r")}, g ${range("g")}, b ${range("b")})`);
for (const item of backs) console.log(`back ${item.name}: padding ${item.entry.padding}`);
