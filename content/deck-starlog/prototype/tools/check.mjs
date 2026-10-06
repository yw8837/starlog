// Sanity checks on the source SVGs and renders (parse, ids, url(#refs), no text/fonts/external refs, sizes).
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sharp } from "./lib/browser.mjs";
import { CARDS } from "./build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const browser = await launch();
const page = await browser.newPage();
let bad = 0;

for (const id of CARDS) {
  const file = path.join(ROOT, "svg", `${id}.svg`);
  await page.goto(`file:///${file.replace(/\\/g, "/")}`);
  const r = await page.evaluate(() => {
    const svg = document.documentElement;
    const html = svg.outerHTML;
    const ids = [...svg.querySelectorAll("[id]")].map((e) => e.id);
    const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    const refs = [...new Set([...html.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]))];
    return {
      root: svg.nodeName,
      viewBox: svg.getAttribute("viewBox"),
      ids: ids.length,
      dup,
      missing: refs.filter((x) => !ids.includes(x)),
      text: svg.querySelectorAll("text,tspan").length,
      fontFamily: /font-family/.test(html),
      external: /(href|src)\s*=\s*["'](?!#)/.test(html),
      script: svg.querySelectorAll("script,foreignObject").length,
      parseError: !!document.querySelector("parsererror"),
    };
  });
  const { size } = await stat(file);
  const ok = r.root === "svg" && r.viewBox === "0 0 600 1040" && !r.dup.length && !r.missing.length && !r.text && !r.fontFamily && !r.external && !r.script && !r.parseError;
  if (!ok) bad++;
  console.log(`${ok ? "OK " : "BAD"} ${id}.svg  ${(size / 1024).toFixed(0)} KB  viewBox=${r.viewBox} ids=${r.ids} dupIds=${r.dup.length} missingRefs=${r.missing.length} <text>=${r.text} font-family=${r.fontFamily} external=${r.external} script=${r.script}`);
  if (!ok) console.log("   ", JSON.stringify(r));
}
await browser.close();

for (const id of CARDS) {
  for (const [suffix, w, h] of [["", 600, 1040], ["-sm", 240, 416], ["@3x", 1800, 3120]]) {
    for (const ext of suffix === "-sm" ? ["webp"] : ["png", "webp"]) {
      const f = path.join(ROOT, "render", `${id}${suffix}.${ext}`);
      const m = await sharp(f).metadata();
      const good = m.width === w && m.height === h;
      if (!good) bad++;
      console.log(`${good ? "OK " : "BAD"} render/${id}${suffix}.${ext}  ${m.width}x${m.height}  ${((await stat(f)).size / 1024).toFixed(0)} KB`);
    }
  }
}
console.log(bad ? `FAILED: ${bad}` : "all checks passed");
process.exit(bad ? 1 : 0);
