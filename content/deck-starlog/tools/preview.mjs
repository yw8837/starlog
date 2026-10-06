// Quick iteration preview.   node preview.mjs <card-substring> [stage: 2 | A | B | all] [scale]
// -> tools/.build/preview/<id>-<stage>.png   (stage files are also rebuilt under stages/)
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCards, builtIds } from "./build.mjs";
import { launch, shotSvg } from "./lib/browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const dir = path.join(HERE, ".build", "preview");
await mkdir(dir, { recursive: true });

const sub = process.argv[2] ?? "";
const which = process.argv[3] ?? "all";
const scale = Number(process.argv[4] ?? 1);
const ids = (await builtIds()).filter((i) => i.includes(sub));
await buildCards(ids);
const names = { 2: ["2-simplified"], A: ["3-character-A"], B: ["3-character-B"], all: ["2-simplified", "3-character-A", "3-character-B"] }[which];
const browser = await launch();
for (const id of ids) {
  for (const n of names) {
    const out = path.join(dir, `${id}-${n}${scale === 1 ? "" : `@${scale}x`}.png`);
    await shotSvg(browser, path.join(ROOT, "stages", id, `${n}.svg`), out, { scale });
    console.log(out);
  }
}
await browser.close();
