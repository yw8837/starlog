// Print export: svg/*.svg -> print/<id>_70x120mm_bleed3mm_<dpi>dpi.png   (PRINT.md has the numbers and the checklist)
//   node export-print.mjs [--dpi 300] [--guides] [--trim-only] [id-substring ...]
//   --guides     also writes print/guides/<id>_guides.png with trim (red), die-cut corner (magenta), bleed (cyan),
//                safe area 5 mm (green) lines for a visual check; never send these to the printer
//   --trim-only  no bleed (70x120 mm), for on-screen previews
// The 600 x 1040 art is scaled to the 70 mm trim width; its 1040 height is 121.33 mm, so 0.667 mm is cut from the top
// and from the bottom. The bleed box continues the art 3 mm further on every side (scenes overdraw by 60+ units).
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sharp } from "./lib/browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

export const TRIM_MM = { w: 70, h: 120 };
export const BLEED_MM = 3;
export const SAFE_MM = 5;
export const CORNER_MM = 3;
export const UNITS_PER_MM = 600 / TRIM_MM.w; // art units (the 600-wide card box) per millimetre

/** Geometry in art units and in pixels for one dpi. */
export function geometry(dpi = 300, { bleed = true } = {}) {
  const u = UNITS_PER_MM;
  const b = bleed ? BLEED_MM : 0;
  const trimH = TRIM_MM.h * u;
  const cropY = (1040 - trimH) / 2;
  const vb = { x: -b * u, y: cropY - b * u, w: 600 + 2 * b * u, h: trimH + 2 * b * u };
  const mmW = TRIM_MM.w + 2 * b;
  const mmH = TRIM_MM.h + 2 * b;
  const px = { w: Math.round((mmW / 25.4) * dpi), h: Math.round((mmH / 25.4) * dpi) };
  return { u, b, cropY, trimH, vb, mm: { w: mmW, h: mmH }, px };
}

function retarget(svg, g, guides) {
  const root = /<svg [^>]*>/.exec(svg)[0];
  const next = root
    .replace(/viewBox="[^"]*"/, `viewBox="${g.vb.x.toFixed(3)} ${g.vb.y.toFixed(3)} ${g.vb.w.toFixed(3)} ${g.vb.h.toFixed(3)}"`)
    .replace(/ width="[^"]*"/, ` width="${g.px.w}"`)
    .replace(/ height="[^"]*"/, ` height="${g.px.h}" preserveAspectRatio="none"`);
  let out = svg.replace(root, next);
  if (guides) {
    const u = UNITS_PER_MM;
    const sw = 1.4 / (g.px.w / g.vb.w);
    const trim = { x: 0, y: g.cropY, w: 600, h: g.trimH };
    const inset = (m) => ({ x: trim.x + m * u, y: trim.y + m * u, w: trim.w - 2 * m * u, h: trim.h - 2 * m * u });
    const rect = (r, stroke, extra = "") => `<rect x="${r.x.toFixed(2)}" y="${r.y.toFixed(2)}" width="${r.w.toFixed(2)}" height="${r.h.toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="${sw.toFixed(3)}" ${extra}/>`;
    const bleed = { x: g.vb.x, y: g.vb.y, w: g.vb.w, h: g.vb.h };
    const dash = `stroke-dasharray="${(6 * sw).toFixed(2)} ${(4 * sw).toFixed(2)}"`;
    out = out.replace(
      "</svg>",
      `<g id="guides">${rect(bleed, "#17d4ff")}${rect(trim, "#ff2a55")}${rect({ ...trim }, "#ff2ad4", `rx="${(CORNER_MM * u).toFixed(2)}" ${dash}`)}${rect(inset(SAFE_MM), "#2aff7a", dash)}</g></svg>`,
    );
  }
  return out;
}

export async function exportPrint({ ids = [], dpi = 300, guides = false, bleed = true, browser: shared } = {}) {
  const svgDir = path.join(ROOT, "svg");
  const files = (await readdir(svgDir)).filter((f) => f.endsWith(".svg")).map((f) => f.replace(/\.svg$/, ""));
  const list = ids.length ? files.filter((f) => ids.some((i) => f.includes(i))) : files;
  const g = geometry(dpi, { bleed });
  const tmp = path.join(HERE, ".build", "print");
  await mkdir(tmp, { recursive: true });
  await mkdir(path.join(ROOT, "print", "guides"), { recursive: true });
  const browser = shared ?? (await launch());
  const ctx = await browser.newContext({ viewport: { width: g.px.w, height: g.px.h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const out = [];
  for (const id of list) {
    const src = await readFile(path.join(svgDir, `${id}.svg`), "utf8");
    const variants = guides ? [["guides", true]] : [["print", false]];
    for (const [kind, withGuides] of variants) {
      const f = path.join(tmp, `${id}.${kind}.svg`);
      await writeFile(f, retarget(src, g, withGuides), "utf8");
      await page.goto(`file:///${f.replace(/\\/g, "/")}`);
      await page.waitForTimeout(120);
      const shot = await page.screenshot({ clip: { x: 0, y: 0, width: g.px.w, height: g.px.h } });
      const name = bleed ? `${id}_70x120mm_bleed3mm_${dpi}dpi.png` : `${id}_70x120mm_trim_${dpi}dpi.png`;
      const dest = withGuides ? path.join(ROOT, "print", "guides", `${id}_guides.png`) : path.join(ROOT, "print", name);
      await sharp(shot).withIccProfile("srgb").withMetadata({ density: dpi }).png({ compressionLevel: 9, effort: 10 }).toFile(dest);
      out.push({ id, dest, px: `${g.px.w}x${g.px.h}` });
    }
  }
  await ctx.close();
  if (!shared) await browser.close();
  return { g, out };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const a = process.argv.slice(2);
  const dpiAt = a.indexOf("--dpi");
  const dpi = dpiAt >= 0 ? Number(a[dpiAt + 1]) : 300;
  const ids = a.filter((x, i) => !x.startsWith("--") && !(dpiAt >= 0 && i === dpiAt + 1));
  const { g, out } = await exportPrint({ ids, dpi, guides: a.includes("--guides"), bleed: !a.includes("--trim-only") });
  console.log(`${g.mm.w} x ${g.mm.h} mm at ${dpi} dpi = ${g.px.w} x ${g.px.h} px  (viewBox ${g.vb.x.toFixed(2)} ${g.vb.y.toFixed(2)} ${g.vb.w.toFixed(2)} ${g.vb.h.toFixed(2)})`);
  for (const o of out) console.log(path.relative(ROOT, o.dest));
}
