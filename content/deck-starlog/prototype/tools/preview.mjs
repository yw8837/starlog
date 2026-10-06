// Quick iteration preview: node preview.mjs <card-id|all> [scale]  -> tools/.build/preview/<id>.png
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCards, CARDS } from "./build.mjs";
import { launch, shotSvg } from "./lib/browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(HERE, ".build", "preview");
await mkdir(dir, { recursive: true });

const arg = process.argv[2] ?? "all";
const scale = Number(process.argv[3] ?? 1);
const ids = arg === "all" ? CARDS : [CARDS.find((c) => c.includes(arg)) ?? arg];
const built = await buildCards(ids);
const browser = await launch();
for (const b of built) {
  const out = path.join(dir, `${b.id}${scale === 1 ? "" : `@${scale}x`}.png`);
  await shotSvg(browser, b.file, out, { scale });
  console.log(out, `${(b.bytes / 1024).toFixed(1)} KB svg`);
}
await browser.close();
