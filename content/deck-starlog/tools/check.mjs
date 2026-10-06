// Sanity checks: every svg (masters and stages) parses and is self-contained, renders and print files have the
// expected pixel sizes, the card back is identical after a 180 degree turn.     node check.mjs
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sharp } from "./lib/browser.mjs";
import { geometry } from "./export-print.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
let bad = 0;
const say = (ok, msg) => {
  if (!ok) bad++;
  console.log(`${ok ? "OK " : "BAD"} ${msg}`);
};
const ls = async (dir) => {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
};

// ---- svg files
const svgs = (await ls(path.join(ROOT, "svg"))).filter((f) => f.endsWith(".svg")).map((f) => path.join(ROOT, "svg", f));
for (const id of await ls(path.join(ROOT, "stages"))) {
  for (const f of await ls(path.join(ROOT, "stages", id))) if (f.endsWith(".svg")) svgs.push(path.join(ROOT, "stages", id, f));
}
const browser = await launch();
const page = await browser.newPage();
for (const file of svgs) {
  await page.goto(`file:///${file.replace(/\\/g, "/")}`);
  const r = await page.evaluate(() => {
    const svg = document.documentElement;
    const html = svg.outerHTML;
    const ids = [...svg.querySelectorAll("[id]")].map((e) => e.id);
    const refs = [...new Set([...html.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]))];
    return {
      root: svg.nodeName,
      viewBox: svg.getAttribute("viewBox"),
      dup: ids.filter((x, i) => ids.indexOf(x) !== i).length,
      missing: refs.filter((x) => !ids.includes(x)).length,
      text: svg.querySelectorAll("text,tspan,script,foreignObject").length,
      fontFamily: /font-family/.test(html),
      external: /(href|src)\s*=\s*["'](?!#)/.test(html),
      parseError: !!document.querySelector("parsererror"),
    };
  });
  const ok = r.root === "svg" && r.viewBox === "0 0 600 1040" && !r.dup && !r.missing && !r.text && !r.fontFamily && !r.external && !r.parseError;
  say(ok, `${path.relative(ROOT, file).padEnd(52)} ${((await stat(file)).size / 1024).toFixed(0).padStart(4)} KB dupIds=${r.dup} missingRefs=${r.missing} text/script=${r.text} font=${r.fontFamily} external=${r.external}`);
}
await browser.close();

// ---- deck.json: keywords come from the KB, masters follow the active frame variant
const deck = JSON.parse(await readFile(path.join(ROOT, "deck.json"), "utf8"));
let kwBad = 0;
for (const c of deck.cards) {
  const kb = JSON.parse(await readFile(path.join(ROOT, "..", "kb", "cards", `${c.id}.json`), "utf8"));
  if (!kb.keywordsKo.includes(c.keyword)) {
    kwBad++;
    say(false, `keyword "${c.keyword}" of ${c.id} is not in KB keywordsKo ${JSON.stringify(kb.keywordsKo)}`);
  }
}
say(kwBad === 0, `deck.json keywords: ${deck.cards.length} cards, all found in KB keywordsKo`);
for (const f of svgs.filter((x) => path.dirname(x) === path.join(ROOT, "svg") && !x.endsWith("back.svg"))) {
  const m = /data-variant="(\w)"/.exec(await readFile(f, "utf8"));
  say(m?.[1] === deck.frame, `${path.basename(f)} frame variant ${m?.[1]} (deck.json: ${deck.frame})`);
}

// ---- renders and print files
const dims = async (file) => {
  const m = await sharp(file).metadata();
  return `${m.width}x${m.height}`;
};
const cards = (await ls(path.join(ROOT, "svg"))).filter((f) => f.endsWith(".svg")).map((f) => f.replace(/\.svg$/, ""));
for (const id of cards) {
  for (const [name, want] of [[`${id}.png`, "600x1040"], [`${id}.webp`, "600x1040"], [`${id}-sm.webp`, "240x416"], [`${id}@3x.png`, "1800x3120"], [`${id}@3x.webp`, "1800x3120"]]) {
    try {
      const got = await dims(path.join(ROOT, "render", name));
      say(got === want, `render/${name.padEnd(34)} ${got}`);
    } catch {
      say(false, `render/${name} missing`);
    }
  }
}
const g = geometry(300);
for (const f of (await ls(path.join(ROOT, "print"))).filter((x) => x.endsWith(".png"))) {
  const m = await sharp(path.join(ROOT, "print", f)).metadata();
  say(m.width === g.px.w && m.height === g.px.h && m.density === 300 && !m.hasAlpha, `print/${f.padEnd(40)} ${m.width}x${m.height} ${m.density}dpi alpha=${m.hasAlpha} (want ${g.px.w}x${g.px.h})`);
}

// ---- the back looks the same upside down
try {
  const A = await sharp(path.join(ROOT, "render", "back@3x.png")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(path.join(ROOT, "render", "back@3x.png")).rotate(180).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let big = 0;
  for (let i = 0; i < A.data.length; i += 3) {
    if (Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2])) > 40) big++;
  }
  const total = A.data.length / 3;
  say(big / total < 0.0001, `back.svg 180-degree symmetry: ${big} of ${total} pixels differ by more than 40/255 (anti-aliasing at edges)`);
} catch {
  say(false, "back render missing");
}
console.log(bad ? `FAILED: ${bad}` : "all checks passed");
process.exit(bad ? 1 : 0);
