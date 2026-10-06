// Self-tests of STYLE.md section 5 on stage-3 renders (frame A).
//   squint:  hide each key symbol (data-sym), diff at 90 px (+ blur), report its size and contrast.
//   blind:   the card without number/name plates, for the "name the card" test (images only; a person answers).
//   node selftest.mjs [card-id-substring ...]   -> review/selftest.json, review/blind/<id>.png (shown to testers), tools/.build/selftest/<id>-squint.png
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { builtIds } from "./build.mjs";
import { launch, sharp } from "./lib/browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(HERE, ".build", "selftest");
await mkdir(OUT, { recursive: true });

// at 90 px wide. A shape passes on size if it is big enough, or long and thin enough to read as a line (wand, staff).
export const LIMITS = {
  1: { long: 14, short: 7, dL: 12, lineLong: 28, lineShort: 4 },
  2: { long: 9, short: 5, dL: 8, lineLong: 18, lineShort: 3 },
};
const W90 = 90;
const H90 = Math.round((W90 * 1040) / 600);
const BLUR = 0.8;

const lstar = (r, g, b) => {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return Y > 0.008856 ? 116 * Y ** (1 / 3) - 16 : 903.3 * Y;
};
const toL = async (png) => {
  const { data, info } = await sharp(png).resize(W90, H90, { kernel: "lanczos3" }).blur(BLUR).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const L = new Float32Array(info.width * info.height);
  for (let i = 0; i < L.length; i++) L[i] = lstar(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
  return { L, w: info.width, h: info.height };
};

export async function runSelfTests(subs = []) {
  const all = await builtIds();
  const ids = subs.length ? all.filter((i) => subs.some((s) => i.includes(s))) : all;
  const browser = await launch();
  const page = await (await browser.newContext({ viewport: { width: 600, height: 1040 }, deviceScaleFactor: 1 })).newPage();
  const results = {};
  for (const id of ids) {
    const mod = await import(pathToFileURL(path.join(ROOT, "cards", `${id}.mjs`)).href + `?t=${Date.now()}`);
    const file = path.join(ROOT, "stages", id, "3-character-A.svg");
    await page.goto(`file:///${file.replace(/\\/g, "/")}`);
    await page.waitForTimeout(120);
    const shot = () => page.screenshot({ clip: { x: 0, y: 0, width: 600, height: 1040 } });
    const base = await shot();
    const baseL = await toL(base);
    await sharp(base).resize(W90, H90, { kernel: "lanczos3" }).blur(1.2).png().toFile(path.join(OUT, `${id}-squint.png`));
    const rows = [];
    for (const s of mod.symbols) {
      const count = await page.evaluate((n) => {
        const els = document.querySelectorAll(`[data-sym="${n}"]`);
        els.forEach((e) => (e.style.display = "none"));
        return els.length;
      }, s.name);
      const hidden = await toL(await shot());
      await page.evaluate((n) => document.querySelectorAll(`[data-sym="${n}"]`).forEach((e) => (e.style.display = "")), s.name);
      let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0, sum = 0;
      for (let y = 0; y < baseL.h; y++) {
        for (let x = 0; x < baseL.w; x++) {
          const d = Math.abs(baseL.L[y * baseL.w + x] - hidden.L[y * baseL.w + x]);
          if (d > 6) {
            n++;
            sum += d;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
      }
      const w = n ? maxX - minX + 1 : 0;
      const hgt = n ? maxY - minY + 1 : 0;
      const long = Math.max(w, hgt);
      const short = Math.min(w, hgt);
      const dL = n ? sum / n : 0;
      const lim = LIMITS[s.rank];
      let verdict = "info";
      if (lim) {
        const bigEnough = (long >= lim.long && short >= lim.short) || (long >= lim.lineLong && short >= lim.lineShort);
        verdict = !bigEnough ? "FAIL" : dL < lim.dL ? "WARN" : "PASS";
      }
      rows.push({ symbol: s.name, rank: s.rank, groups: count, bbox90: `${w}x${hgt}`, area90: n, dL: Math.round(dL * 10) / 10, verdict });
    }
    // blind copy: no number/name plates (for the name-the-card test)
    const svg = readFileSync(file, "utf8").replace(/<g id="frame"[\s\S]*?<!--\/frame-->/, "");
    const blindFile = path.join(OUT, `${id}-blind.svg`);
    await writeFile(blindFile, svg, "utf8");
    await page.goto(`file:///${blindFile.replace(/\\/g, "/")}`);
    await page.waitForTimeout(120);
    const blindPng = await shot();
    await writeFile(path.join(OUT, `${id}-blind.png`), blindPng);
    await mkdir(path.join(ROOT, "review", "blind"), { recursive: true });
    await writeFile(path.join(ROOT, "review", "blind", `${id}.png`), blindPng);
    results[id] = { symbols: rows, readFirst: mod.symbols.filter((s) => s.rank <= 2).length };
  }
  await browser.close();
  await mkdir(path.join(ROOT, "review"), { recursive: true });
  await writeFile(path.join(ROOT, "review", "selftest.json"), JSON.stringify({ limits: LIMITS, blur: BLUR, width: W90, results }, null, 1), "utf8");
  return results;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const res = await runSelfTests(process.argv.slice(2));
  for (const [id, r] of Object.entries(res)) {
    console.log(`\n${id}  (read-first symbols: ${r.readFirst})`);
    for (const s of r.symbols) console.log(`  ${s.verdict.padEnd(4)} r${s.rank} ${s.symbol.padEnd(14)} ${s.bbox90.padEnd(7)} dL ${String(s.dL).padStart(5)}`);
  }
}
