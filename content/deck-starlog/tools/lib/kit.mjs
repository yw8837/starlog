// Shared kit for the Starlog deck cards (v2): renders the app's real character parts to SVG markup,
// plus scenery helpers, outlined-glyph text and the two frame variants (A: number + name, B: + keyword).
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TOOLS = path.resolve(HERE, "..");
export const ROOT = path.resolve(TOOLS, "..");
const P = await import(pathToFileURL(path.join(TOOLS, ".build", "parts.mjs")).href);
const GLYPHS = JSON.parse(readFileSync(path.join(TOOLS, "glyphs.json"), "utf8"));
export const DECK = JSON.parse(readFileSync(path.join(ROOT, "deck.json"), "utf8"));

export const W = 600;
export const H = 1040; // the app's card box is 600:1040 (TarotCard.module.css)
export const r2 = (n) => Math.round(n * 100) / 100;

/** Master palette. STYLE.md lists the same values; PRINT.md gives their CMYK behaviour. */
export const C = {
  night: "#0D0A26",
  night2: "#15113A",
  navyDeep: "#1C1850",
  navy: "#2E2A78",
  indigo: "#3B3594",
  violet: "#5B4FB8",
  violetLight: "#8C7BE0",
  lav: "#AA94E6",
  lavLight: "#CDBDF5",
  ink: "#F1ECFF",
  cream: "#FFF7E8",
  gold: "#E9C46F",
  goldLight: "#F3DCA1",
  goldDeep: "#B98A2E",
  sun: "#FFF2C8",
  coral: "#D8435A",
  coralDeep: "#9E2A42",
  green: "#43AA90",
  greenDark: "#23687A",
  water: "#3F66CC",
  waterLight: "#9FC0F5",
};

/** Safe window for key symbols: between the number tab and the (taller, variant B) name tab. */
export const SAFE = { x0: 50, x1: 550, y0: 114, y1: 884 };

/** Markup of one real character part (class names stripped: static art has no CSS). */
export function part(name, props = {}) {
  if (!P[name]) throw new Error(`unknown part ${name}`);
  return renderToStaticMarkup(React.createElement(P[name], props)).replace(/ class="[^"]*"/g, "");
}
export const h = React.createElement;
export const render = (el) => renderToStaticMarkup(el).replace(/ class="[^"]*"/g, "");
export const Parts = P;
export const starPath = P.starPath;
export const sparklePath = P.sparklePath;

const DEFS = renderToStaticMarkup(React.createElement(P.CharacterDefs)).match(/<defs>([\s\S]*)<\/defs>/)[1];

let _uid = 0;
export const resetUid = () => {
  _uid = 0;
};
export const uid = (p = "u") => `${p}${++_uid}`;

/** Put 300x300-box art at card position (x, y): (cx, cy) in the box lands on (x, y). */
export function place(markup, { x, y, s = 1, rot = 0, cx = 150, cy = 285, flip = false }) {
  const f = flip ? ` scale(-1 1)` : "";
  return `<g transform="translate(${r2(x)} ${r2(y)}) rotate(${rot}) scale(${s})${f} translate(${-cx} ${-cy})">${markup}</g>`;
}

/** A background field that also covers the print bleed (STYLE: every edge-touching shape overdraws by 60+). */
export const bg = (fill, { y = -80, h: hh = 1200 } = {}) => `<rect x="-80" y="${y}" width="760" height="${hh}" fill="${fill}"/>`;

/** Mark a symbol so the squint self-test can hide it and measure it (STYLE.md section 6). */
export const sym = (name, rank, markup) => `<g class="sym" data-sym="${name}" data-rank="${rank}">${markup}</g>`;

/** Tapered capsule (limb) between two points, as a closed path so gradients fill it by bbox. */
export function capsule([sx, sy], [px, py], r1, r2_ = r1) {
  const dx = px - sx;
  const dy = py - sy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const a = [sx + nx * r1, sy + ny * r1];
  const b = [px + nx * r2_, py + ny * r2_];
  const c = [px - nx * r2_, py - ny * r2_];
  const d = [sx - nx * r1, sy - ny * r1];
  const f = (p) => `${r2(p[0])} ${r2(p[1])}`;
  return `M${f(a)}L${f(b)}A${r2_} ${r2_} 0 0 0 ${f(c)}L${f(d)}A${r1} ${r1} 0 0 0 ${f(a)}Z`;
}

/** Eight-pointed star as on the RWS Star card: four long tips, four shorter diagonal tips. */
export function star8(cx, cy, R, { rot = 0, diag = 0.64, inner = 0.27 } = {}) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (rot * Math.PI) / 180 + (i * Math.PI) / 8 - Math.PI / 2;
    const rad = i % 2 === 1 ? R * inner : i % 4 === 0 ? R : R * diag;
    pts.push(`${r2(cx + rad * Math.cos(a))} ${r2(cy + rad * Math.sin(a))}`);
  }
  return `M${pts.join("L")}Z`;
}

/** Leaf from (x, y) pointing at `rot` degrees (0 = right). */
export function leaf(x, y, len, rot = 0, { fill = C.green, shade = C.greenDark, wide = 0.34 } = {}) {
  const w = len * wide;
  return `<g transform="translate(${r2(x)} ${r2(y)}) rotate(${rot})">
    <path d="M0 0C${r2(len * 0.25)} ${r2(-w)} ${r2(len * 0.75)} ${r2(-w)} ${r2(len)} 0C${r2(len * 0.75)} ${r2(w)} ${r2(len * 0.25)} ${r2(w)} 0 0Z" fill="${fill}"/>
    <path d="M0 0C${r2(len * 0.25)} ${r2(w)} ${r2(len * 0.75)} ${r2(w)} ${r2(len)} 0Z" fill="${shade}" opacity=".35"/>
  </g>`;
}

/** Layered rose bloom seen from the front (flat petals, a thin shade under each). */
function bloom(cx, cy, r, rot, c) {
  const k = r / 20;
  const petal = (x, y, pr, fill, dx = 1, dy = 1.6) =>
    `<circle cx="${r2(x + dx)}" cy="${r2(y + dy)}" r="${r2(pr + 0.6)}" fill="${c.shade}" opacity=".6"/><circle cx="${r2(x)}" cy="${r2(y)}" r="${pr}" fill="${fill}"/>`;
  const ring = (n, dist, pr, off, fill) =>
    Array.from({ length: n }, (_, i) => {
      const a = ((off + (i * 360) / n) * Math.PI) / 180;
      return petal(Math.cos(a) * dist, Math.sin(a) * dist, pr, fill);
    }).join("");
  return `<g transform="translate(${r2(cx)} ${r2(cy)}) rotate(${rot}) scale(${r2(k)})">
    <circle r="19" fill="${c.shade}"/>
    ${ring(5, 11.2, 9.6, -90, c.outer)}
    ${ring(3, 5.6, 8.2, -60, c.mid)}
    ${petal(0, 0, 5.4, c.heart, 0.6, 1)}
    <path d="M-2.6 .6C-2.6 -2.6 2.2 -3.2 3 -.2C3.4 2.2 .2 3.2 -1.4 1.8" stroke="${c.line}" stroke-opacity=".75" stroke-width="1.5" stroke-linecap="round" fill="none"/>
  </g>`;
}
const RED = { shade: "#7E1F36", outer: "#D8435A", mid: "#E8566D", heart: "#C23A52", line: "#6E1B33" };
const WHITE = { shade: "#9A8BCB", outer: "#FFFFFF", mid: "#F6F2FF", heart: "#E9E2FA", line: "#8E7FC4" };
export const rose = (cx, cy, r, rot = 0) => bloom(cx, cy, r, rot, RED);
export const whiteRose = (cx, cy, r, rot = 0) => bloom(cx, cy, r, rot, WHITE);

/** White lily seen from the front: six petals around a gold heart. */
export function lily(cx, cy, r, rot = 0) {
  const k = r / 24;
  const petals = [0, 60, 120, 180, 240, 300].map((a) => `<path d="M0 0C-9 -8 -9 -22 0 -26C9 -22 9 -8 0 0Z" transform="rotate(${a})" fill="#FFFFFF"/>`).join("");
  const shade = [0, 60, 120, 180, 240, 300].map((a) => `<path d="M0 0C3 -8 9 -14 9 -19C9 -22 6 -24 3 -25C9 -22 9 -8 0 0Z" transform="rotate(${a})" fill="#D9D0F4" opacity=".7"/>`).join("");
  return `<g transform="translate(${r2(cx)} ${r2(cy)}) rotate(${rot}) scale(${r2(k)})">
    ${petals}${shade}
    <path d="M0 -3V-16M3 -2L9 -12M-3 -2L-9 -12" stroke="#E9C46F" stroke-width="2" stroke-linecap="round"/>
    <circle cx="0" cy="-17" r="2.4" fill="#F3B63F"/><circle cx="9.5" cy="-13" r="2.2" fill="#F3B63F"/><circle cx="-9.5" cy="-13" r="2.2" fill="#F3B63F"/>
    <circle r="4.2" fill="#FFE9B0"/>
  </g>`;
}

/** Tapered ribbon along a smooth curve through `pts` (Catmull-Rom), width w0 -> w1; a filled path. */
export function ribbon(pts, w0, w1, { lift = 0, samples = 14 } = {}) {
  const Pp = [pts[0], ...pts, pts[pts.length - 1]];
  const line = [];
  for (let i = 1; i < Pp.length - 2; i++) {
    const [p0, p1, p2, p3] = [Pp[i - 1], Pp[i], Pp[i + 1], Pp[i + 2]];
    for (let j = 0; j < samples; j++) {
      const t = j / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      line.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  line.push(pts[pts.length - 1]);
  const left = [];
  const right = [];
  line.forEach((pt, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = (w0 + ((w1 - w0) * i) / (line.length - 1)) / 2;
    const cx = pt[0] + nx * lift;
    const cy = pt[1] + ny * lift;
    left.push([cx + nx * w, cy + ny * w]);
    right.push([cx - nx * w, cy - ny * w]);
  });
  const f = (q) => `${r2(q[0])} ${r2(q[1])}`;
  return `M${f(left[0])}L${left.slice(1).map(f).join("L")}A${r2(w1 / 2)} ${r2(w1 / 2)} 0 0 1 ${f(right[right.length - 1])}L${right.slice(0, -1).reverse().map(f).join("L")}A${r2(w0 / 2)} ${r2(w0 / 2)} 0 0 1 ${f(left[0])}Z`;
}

/** Seeded generator (stable output). */
export function rng(seed = 1) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Text as glyph outlines (no font dependency). set: "name" (wght 700) or "keyword" (wght 500). */
export function text(str, { size, x, y, anchor = "middle", tracking = 0, fill = C.goldLight, set = "name", opacity = 1 }) {
  const G = GLYPHS.sets[set];
  const k = size / GLYPHS.upm;
  let adv = 0;
  const items = [...str].map((ch) => {
    if (ch === " ") {
      const item = { ch, at: adv };
      adv += GLYPHS.space + tracking * GLYPHS.upm;
      return item;
    }
    const g = G[ch];
    if (!g) throw new Error(`glyph "${ch}" not in glyphs.json (run tools/make-glyphs.py)`);
    const item = { ch, g, at: adv };
    adv += g.adv + tracking * GLYPHS.upm;
    return item;
  });
  adv -= tracking * GLYPHS.upm;
  const width = adv * k;
  const x0 = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  const kk = r2(k * 1000) / 1000;
  const paths = items
    .filter((i) => i.g)
    .map(({ g, at }) => `<path transform="translate(${r2(x0 + at * k)} ${r2(y)}) scale(${kk} ${-kk})" d="${g.d}"/>`)
    .join("");
  let lo = Infinity;
  let hi = -Infinity;
  for (const { g } of items) {
    if (!g) continue;
    lo = Math.min(lo, g.b[1]);
    hi = Math.max(hi, g.b[3]);
  }
  return { markup: `<g fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ""}>${paths}</g>`, width, midUp: ((lo + hi) / 2) * k };
}

/** Defs shared by every card (kept small: the v2 look is flat). */
export const SHARED_DEFS = ``;

/**
 * The common frame. INSET 36 px puts the gold line 4.2 mm inside the 70 mm trim (PRINT.md), the number tab
 * hangs from the top line, the name tab rises from the bottom line; variant B adds a keyword line (taller tab).
 */
export const INSET = 36;
export function frame({ numeral, name, keyword, variant = "A" }) {
  const B = variant === "B";
  const num = text(numeral, { size: 56, x: 300, y: 0, tracking: 0.06 });
  const nm = text(name, { size: B ? 54 : 62, x: 300, y: 0, tracking: 0.2 });
  const kw = B ? text(keyword, { size: 25, x: 300, y: 0, tracking: 0.05, set: "keyword", opacity: 0.92 }) : null;
  const numW = Math.max(100, num.width + 60);
  const nameW = Math.max(B ? 300 : 240, nm.width + 90, kw ? kw.width + 84 : 0);
  const tabTop = { x0: 300 - numW / 2, x1: 300 + numW / 2, y0: INSET, y1: INSET + 70 };
  const tabBot = { x0: 300 - nameW / 2, x1: 300 + nameW / 2, y1: H - INSET, y0: H - INSET - (B ? 112 : 70) };
  const R = 22;
  const top = `M${tabTop.x0} ${tabTop.y0}V${tabTop.y1 - R}Q${tabTop.x0} ${tabTop.y1} ${tabTop.x0 + R} ${tabTop.y1}H${tabTop.x1 - R}Q${tabTop.x1} ${tabTop.y1} ${tabTop.x1} ${tabTop.y1 - R}V${tabTop.y0}`;
  const bot = `M${tabBot.x0} ${tabBot.y1}V${tabBot.y0 + R}Q${tabBot.x0} ${tabBot.y0} ${tabBot.x0 + R} ${tabBot.y0}H${tabBot.x1 - R}Q${tabBot.x1} ${tabBot.y0} ${tabBot.x1} ${tabBot.y0 + R}V${tabBot.y1}`;
  const numY = (tabTop.y0 + tabTop.y1) / 2 + num.midUp;
  const nameCenter = B ? tabBot.y0 + 38 : (tabBot.y0 + tabBot.y1) / 2;
  const nameY = nameCenter + nm.midUp;
  const kwY = B ? tabBot.y0 + 86 + kw.midUp : 0;
  const spark = (cx, cy, r) => `<path d="${sparklePath(cx, cy, r)}" fill="${C.goldLight}"/>`;
  return `
  <g id="frame" data-variant="${variant}">
    <rect x="${INSET}" y="${INSET}" width="${W - 2 * INSET}" height="${H - 2 * INSET}" rx="24" fill="none" stroke="${C.night2}" stroke-width="11"/>
    <rect x="${INSET}" y="${INSET}" width="${W - 2 * INSET}" height="${H - 2 * INSET}" rx="24" fill="none" stroke="${C.gold}" stroke-width="5"/>
    <rect x="${INSET + 13}" y="${INSET + 13}" width="${W - 2 * INSET - 26}" height="${H - 2 * INSET - 26}" rx="14" fill="none" stroke="${C.goldLight}" stroke-opacity=".5" stroke-width="2"/>
    <path d="${top}Z" fill="${C.night2}"/><path d="${top}" fill="none" stroke="${C.gold}" stroke-width="4" stroke-linejoin="round"/>
    <path d="${bot}Z" fill="${C.night2}"/><path d="${bot}" fill="none" stroke="${C.gold}" stroke-width="4" stroke-linejoin="round"/>
    ${spark(tabTop.x0 - 26, INSET, 8)}${spark(tabTop.x1 + 26, INSET, 8)}
    ${spark(tabBot.x0 - 26, H - INSET, 8)}${spark(tabBot.x1 + 26, H - INSET, 8)}
    ${text(numeral, { size: 56, x: 300, y: numY, tracking: 0.06 }).markup}
    ${text(name, { size: B ? 54 : 62, x: 300, y: nameY, tracking: 0.2 }).markup}
    ${B ? text(keyword, { size: 25, x: 300, y: kwY, tracking: 0.05, set: "keyword", opacity: 0.92 }).markup : ""}
    ${B ? `<path d="M${tabBot.x0 + 40} ${tabBot.y0 + 63}H${tabBot.x1 - 40}" stroke="${C.gold}" stroke-opacity=".55" stroke-width="2"/>` : ""}
  </g><!--/frame-->`;
}

export function svgDoc({ title, desc, defs = "", body }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">${title}</title>
<desc id="d">${desc}</desc>
<defs>${DEFS}${SHARED_DEFS}${defs}</defs>
${body}
</svg>
`;
}
