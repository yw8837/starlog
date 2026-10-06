// Shared kit for the Starlog deck cards: renders the app's real character parts to SVG markup,
// plus the few scenery helpers, the glyph-outline text and the common card frame.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.resolve(HERE, "..");
const P = await import(pathToFileURL(path.join(TOOLS, ".build", "parts.mjs")).href);
const GLYPHS = JSON.parse(readFileSync(path.join(TOOLS, "glyphs.json"), "utf8"));

export const W = 600;
export const H = 1040; // the app's card box is 600:1040 (TarotCard.module.css)
export const r2 = (n) => Math.round(n * 100) / 100;

/** Markup of one real character part (class names stripped: static art has no CSS). */
export function part(name, props = {}) {
  if (!P[name]) throw new Error(`unknown part ${name}`);
  return renderToStaticMarkup(React.createElement(P[name], props)).replace(/ class="[^"]*"/g, "");
}
/** Render any React element made from the parts (for props that are elements, e.g. CatTail tip). */
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

/** Puffy cloud: a flat-bottomed union of circles, lit from the upper right. */
export function cloud(cx, cy, w, { opacity = 1, filter = "" } = {}) {
  const h = w * 0.34;
  const f = filter ? ` filter="url(#${filter})"` : "";
  const circles = [
    [cx - w * 0.24, cy, h * 0.62],
    [cx + w * 0.02, cy - h * 0.3, h * 0.86],
    [cx + w * 0.27, cy + h * 0.02, h * 0.58],
  ];
  const base = `<ellipse cx="${r2(cx)}" cy="${r2(cy + h * 0.28)}" rx="${r2(w * 0.5)}" ry="${r2(h * 0.42)}"/>` + circles.map(([x, y, r]) => `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}"/>`).join("");
  const lit = circles.map(([x, y, r]) => `<circle cx="${r2(x + r * 0.12)}" cy="${r2(y - r * 0.2)}" r="${r2(r * 0.72)}"/>`).join("");
  return `<g opacity="${opacity}"${f}>
    <g fill="#D6CDF4">${base}</g>
    <g fill="#F7F4FF" transform="translate(0 -${r2(h * 0.05)})">${base}</g>
    <g fill="#FFFFFF" opacity=".95">${lit}</g>
  </g>`;
}

/** Leaf from (x, y) pointing at `rot` degrees (0 = right). */
export function leaf(x, y, len, rot = 0, { fill = "url(#sk-leaf)", vein = true, wide = 0.34 } = {}) {
  const w = len * wide;
  return `<g transform="translate(${r2(x)} ${r2(y)}) rotate(${rot})">
    <path d="M0 0C${r2(len * 0.25)} ${r2(-w)} ${r2(len * 0.75)} ${r2(-w)} ${r2(len)} 0C${r2(len * 0.75)} ${r2(w)} ${r2(len * 0.25)} ${r2(w)} 0 0Z" fill="${fill}"/>
    ${vein ? `<path d="M${r2(len * 0.08)} 0H${r2(len * 0.86)}" stroke="#1D5A66" stroke-opacity=".45" stroke-width="2.2" stroke-linecap="round"/>` : ""}
  </g>`;
}

/**
 * Layered rose bloom seen from the front: a scalloped ring of five petals, three curled inner petals,
 * a spiral heart. Each petal casts a thin shade on its neighbour so the overlap reads as petals.
 */
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
    <ellipse cx="-8.5" cy="-12.5" rx="5.6" ry="2.4" transform="rotate(-34 -8.5 -12.5)" fill="#fff" opacity="${c.hi}"/>
  </g>`;
}
const RED = { shade: "#7E1F36", outer: "url(#sk-rose)", mid: "url(#sk-rose2)", heart: "#C23A52", line: "#6E1B33", hi: ".5" };
const WHITE = { shade: "#9A8BCB", outer: "url(#sk-wrose)", mid: "#FFFFFF", heart: "#F1ECFC", line: "#8E7FC4", hi: ".95" };
/** Small red rose. */
export const rose = (cx, cy, r, rot = 0) => bloom(cx, cy, r, rot, RED);
/** White rose. */
export const whiteRose = (cx, cy, r, rot = 0) => bloom(cx, cy, r, rot, WHITE);

/** White lily seen from the front: six petals around a gold heart. */
export function lily(cx, cy, r, rot = 0) {
  const k = r / 24;
  const petals = [0, 60, 120, 180, 240, 300]
    .map((a) => `<path d="M0 0C-9 -8 -9 -22 0 -26C9 -22 9 -8 0 0Z" transform="rotate(${a})" fill="url(#sk-lily)"/>`)
    .join("");
  return `<g transform="translate(${r2(cx)} ${r2(cy)}) rotate(${rot}) scale(${r2(k)})">
    ${petals}
    <path d="M0 -3V-16M3 -2L9 -12M-3 -2L-9 -12" stroke="#E9C46F" stroke-width="2" stroke-linecap="round"/>
    <circle cx="0" cy="-17" r="2.4" fill="#F3B63F"/><circle cx="9.5" cy="-13" r="2.2" fill="#F3B63F"/><circle cx="-9.5" cy="-13" r="2.2" fill="#F3B63F"/>
    <circle r="4.2" fill="#FFE9B0"/>
  </g>`;
}

/**
 * Tapered ribbon along a smooth curve through `pts` (Catmull-Rom), width w0 -> w1; a filled path, so
 * streams and paths can widen toward the viewer. `lift` shifts the centre line sideways (highlights).
 */
export function ribbon(pts, w0, w1, { lift = 0, samples = 14 } = {}) {
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const line = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
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
  const endW = w1 / 2;
  const last = line[line.length - 1];
  return `M${f(left[0])}L${left.slice(1).map(f).join("L")}A${r2(endW)} ${r2(endW)} 0 0 1 ${f(right[right.length - 1])}L${right.slice(0, -1).reverse().map(f).join("L")}A${r2(w0 / 2)} ${r2(w0 / 2)} 0 0 1 ${f(left[0])}Z`;
}

/** Tuft of grass blades. */
export function tuft(x, y, s = 1, fill = "url(#sk-leaf)") {
  return `<path transform="translate(${r2(x)} ${r2(y)}) scale(${s})" d="M-14 0C-14 -10 -11 -20 -8 -26C-6 -16 -4 -8 -3 0ZM-5 0C-4 -14 0 -30 4 -38C6 -26 6 -12 5 0ZM4 0C6 -10 10 -20 16 -24C14 -14 12 -6 12 0Z" fill="${fill}"/>`;
}

/** Eight small gold specks / four-point sparkles scattered by a seeded generator (stable output). */
export function rng(seed = 1) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Text as glyph outlines (no font dependency). Returns {markup, width}. */
export function text(str, { size, x, y, anchor = "middle", tracking = 0, fill = "#F3DCA1", extra = "" }) {
  const k = size / GLYPHS.upm;
  const chars = [...str];
  let adv = 0;
  const items = chars.map((ch) => {
    const g = GLYPHS.chars[ch];
    if (!g) throw new Error(`glyph ${ch} not in glyphs.json (run make-glyphs.py)`);
    const item = { ch, g, at: adv };
    adv += g.adv + tracking * GLYPHS.upm;
    return item;
  });
  adv -= tracking * GLYPHS.upm;
  const width = adv * k;
  const x0 = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  const paths = items
    .map(({ g, at }) => `<path transform="translate(${r2(x0 + at * k)} ${r2(y)}) scale(${r2(k * 1000) / 1000} ${-r2(k * 1000) / 1000})" d="${g.d}"/>`)
    .join("");
  // vertical centre of the string's ink, so callers can centre it in a plate
  let lo = Infinity;
  let hi = -Infinity;
  for (const { g } of items) {
    lo = Math.min(lo, g.bounds[1]);
    hi = Math.max(hi, g.bounds[3]);
  }
  return { markup: `<g fill="${fill}" ${extra}>${paths}</g>`, width, midUp: ((lo + hi) / 2) * k };
}

/** Defs shared by every card (gradients for scenery, frame and plates). */
export const SHARED_DEFS = `
  <linearGradient id="sk-frame-gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFE9B0"/><stop offset=".35" stop-color="#E9C46F"/>
    <stop offset=".7" stop-color="#C9993F"/><stop offset="1" stop-color="#F3DCA1"/>
  </linearGradient>
  <linearGradient id="sk-plate" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#252068"/><stop offset="1" stop-color="#0F0B30"/>
  </linearGradient>
  <linearGradient id="sk-vig-top" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0D0A26" stop-opacity=".8"/><stop offset="1" stop-color="#0D0A26" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="sk-vig-bot" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0D0A26" stop-opacity="0"/><stop offset="1" stop-color="#0D0A26" stop-opacity=".88"/>
  </linearGradient>
  <linearGradient id="sk-leaf" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#8FE3B4"/><stop offset=".5" stop-color="#43AA90"/><stop offset="1" stop-color="#23687A"/>
  </linearGradient>
  <radialGradient id="sk-rose" cx="38%" cy="32%" r="75%">
    <stop offset="0" stop-color="#F9808F"/><stop offset=".55" stop-color="#D8435A"/><stop offset="1" stop-color="#9E2A42"/>
  </radialGradient>
  <radialGradient id="sk-rose2" cx="38%" cy="30%" r="75%">
    <stop offset="0" stop-color="#FF9AA5"/><stop offset=".55" stop-color="#E8566D"/><stop offset="1" stop-color="#B8304A"/>
  </radialGradient>
  <radialGradient id="sk-wrose" cx="38%" cy="32%" r="75%">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#EFE9FB"/><stop offset="1" stop-color="#BFB3E3"/>
  </radialGradient>
  <radialGradient id="sk-lily" cx="50%" cy="85%" r="95%">
    <stop offset="0" stop-color="#FFF3C9"/><stop offset=".35" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D9D0F4"/>
  </radialGradient>
  <linearGradient id="sk-cloud" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#EEE8FF"/><stop offset="1" stop-color="#BDB2E6"/>
  </linearGradient>
  <linearGradient id="sk-text-gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFF1C4"/><stop offset=".6" stop-color="#F3DCA1"/><stop offset="1" stop-color="#E9C46F"/>
  </linearGradient>
`;

/**
 * The common quiet frame: top/bottom vignettes, a gold line with a hairline inside it, a numeral
 * tab hanging from the top line and a name tab rising from the bottom line. All text is outlines.
 */
export function frame({ numeral, name }) {
  const num = text(numeral, { size: 56, x: 300, y: 0, tracking: 0.06, fill: "url(#sk-text-gold)" });
  const nameT = text(name, { size: 62, x: 300, y: 0, tracking: 0.2, fill: "url(#sk-text-gold)" });
  const numW = Math.max(96, num.width + 56);
  const nameW = Math.max(236, nameT.width + 84);
  const nx0 = 300 - numW / 2;
  const nx1 = 300 + numW / 2;
  const mx0 = 300 - nameW / 2;
  const mx1 = 300 + nameW / 2;
  const topTab = `M${nx0} 18V66Q${nx0} 88 ${nx0 + 22} 88H${nx1 - 22}Q${nx1} 88 ${nx1} 66V18`;
  const botTab = `M${mx0} 1022V966Q${mx0} 944 ${mx0 + 22} 944H${mx1 - 22}Q${mx1} 944 ${mx1} 966V1022`;
  const numY = 53 + num.midUp; // baseline so the ink is centred in the 18..88 tab
  const nameY = 983 + nameT.midUp;
  const spark = (cx, cy, r) => `<path d="${sparklePath(cx, cy, r)}" fill="#F3DCA1"/>`;
  return `
  <g id="frame">
    <rect x="0" y="0" width="600" height="170" fill="url(#sk-vig-top)"/>
    <rect x="0" y="820" width="600" height="220" fill="url(#sk-vig-bot)"/>
    <rect x="18" y="18" width="564" height="1004" rx="26" fill="none" stroke="url(#sk-frame-gold)" stroke-width="5"/>
    <rect x="31" y="31" width="538" height="978" rx="16" fill="none" stroke="#F3DCA1" stroke-opacity=".38" stroke-width="1.8"/>
    <path d="${topTab}Z" fill="url(#sk-plate)"/>
    <path d="${topTab}" fill="none" stroke="url(#sk-frame-gold)" stroke-width="4" stroke-linejoin="round"/>
    <path d="${botTab}Z" fill="url(#sk-plate)"/>
    <path d="${botTab}" fill="none" stroke="url(#sk-frame-gold)" stroke-width="4" stroke-linejoin="round"/>
    ${spark(nx0 - 26, 18, 8)}${spark(nx1 + 26, 18, 8)}
    ${spark(mx0 - 26, 1022, 8)}${spark(mx1 + 26, 1022, 8)}
    ${text(numeral, { size: 56, x: 300, y: numY, tracking: 0.06, fill: "url(#sk-text-gold)" }).markup}
    ${text(name, { size: 62, x: 300, y: nameY, tracking: 0.2, fill: "url(#sk-text-gold)" }).markup}
  </g>`;
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
