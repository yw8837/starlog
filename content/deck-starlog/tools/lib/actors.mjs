// Actors for the Starlog cards: the cat (tarot reader) and the rabbit (librarian) built from the app's real
// head parts on posed bodies, plus the flat human "study" figure used in stage 2 of the method.
// All coordinates are card coordinates (600 x 1040). Poses are given as joints so stage 2 (human) and
// stage 3 (cat/rabbit) can share one skeleton.
import { part, place, capsule, r2, C, sparklePath, starPath, render, h, Parts } from "./kit.mjs";

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => mul(a, 1 / (len(a) || 1));
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const f = (p) => `${r2(p[0])} ${r2(p[1])}`;

/** Smooth closed curve through points (Catmull-Rom converted to cubic Beziers). */
export function smooth(pts, closed = true) {
  const n = pts.length;
  const P = (i) => pts[(i + n) % n];
  let d = `M${f(pts[0])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = closed ? P(i - 1) : pts[Math.max(i - 1, 0)];
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = closed ? P(i + 2) : pts[Math.min(i + 2, n - 1)];
    const c1 = add(p1, mul(sub(p2, p0), 1 / 6));
    const c2 = sub(p2, mul(sub(p3, p1), 1 / 6));
    d += `C${f(c1)} ${f(c2)} ${f(p2)}`;
  }
  return d + (closed ? "Z" : "");
}

/** Torso blob from neck to hip: widths at the neck, shoulders, waist and hip. */
export function torsoPath(neck, hip, { wN = 50, wS = 108, wW = 98, wH = 108, drop = 0.2 } = {}) {
  const L = len(sub(hip, neck));
  const u = unit(sub(hip, neck));
  const v = [-u[1], u[0]];
  const at = (t, w, side) => add(add(neck, mul(u, L * t)), mul(v, (w / 2) * side));
  const pts = [
    at(0.02, wN, -1),
    at(0.2, wS, -1),
    at(0.6, wW, -1),
    at(0.97, wH, -1),
    add(hip, mul(u, L * drop)),
    at(0.97, wH, 1),
    at(0.6, wW, 1),
    at(0.2, wS, 1),
    at(0.02, wN, 1),
  ];
  return smooth(pts);
}

// ------------------------------------------------------------------ cat
export const FUR = "url(#sl-cat-fur)";
const SHADE = "#4A3F7A";

/** Soft contact shadow of a limb on whatever is behind it (keeps cream shapes apart). */
const limbShade = (d, dx = 2.5, dy = 3.5) => `<path d="${d}" fill="${SHADE}" opacity=".28" transform="translate(${dx} ${dy})" filter="url(#sl-blur)"/>`;

export function furLimb(a, b, r1, r2_ = r1, { fill = FUR, shade = true } = {}) {
  const d = capsule(a, b, r1, r2_);
  return `${shade ? limbShade(d) : ""}<path d="${d}" fill="${fill}"/>`;
}

/** Cat head group (ears, head, hat) pivoting on the neck point (box 150,218). */
export function catHead({ neck, s = 1, tilt = 0, expr = "idle", hat = true, hatExtras = "", front = "" }) {
  const hatMarkup = hat ? part("AstrologerHat") + hatExtras : "";
  const group = `${part("CatEars")}${part("CatHead", { expression: expr })}${hatMarkup}${front}`;
  return place(group, { x: neck[0], y: neck[1], s, rot: tilt, cx: 150, cy: 218 });
}

export function catTorso({ neck, hip, s = 1, ...w }) {
  const d = torsoPath(neck, hip, w);
  const mid = lerp(neck, hip, 0.7);
  return `<path d="${d}" fill="${FUR}"/><ellipse cx="${r2(mid[0])}" cy="${r2(mid[1])}" rx="${r2(22 * s)}" ry="${r2(30 * s)}" fill="#FFFDF8" opacity=".6" filter="url(#sl-blur)"/>`;
}

/** The app's star cape (two panels, gold chain, clasp) hung from the neck. */
export const catCape = ({ neck, s = 1 }) => place(part("Cape"), { x: neck[0], y: neck[1] + 6 * s, s, cx: 150, cy: 224 });

export function catPaw([x, y], s = 1, rot = 0) {
  return place(part("CatPaw", { x: 0, y: 0 }), { x, y, s, rot, cx: 0, cy: 0 });
}

export function catTail({ at, s = 1, rot = 0, flip = false }) {
  const tail = render(h(Parts.CatTail, { tip: h(Parts.TailStar) }));
  return place(tail, { x: at[0], y: at[1], s, rot, cx: 194, cy: 282, flip });
}

/** Coral boot with a gold cuff (reads against a gold sky and a navy cliff). Local origin = ankle centre; toe points +x. */
export function boot({ at, rot = 0, flip = false, s = 1 }) {
  const d = "M-15 -20H15V4C15 10 26 12 36 17C43 21 41 32 33 33H-13C-20 33 -22 24 -19 15Z";
  return `<g transform="translate(${r2(at[0])} ${r2(at[1])}) rotate(${rot}) scale(${flip ? -s : s} ${s})">
    <path d="${d}" fill="${C.coral}"/>
    <path d="M-13 33H33C41 32 43 21 36 17C32 15 29 13.5 25 12.5L-17 25C-19 28 -17 33 -13 33Z" fill="${C.coralDeep}" opacity=".6"/>
    <path d="M-16 -22H16V-8H-16Z" fill="${C.gold}"/>
    <path d="M-8 2C-3 8 6 8 12 2" stroke="${C.coralDeep}" stroke-width="3" stroke-linecap="round" fill="none" opacity=".75"/>
  </g>`;
}

// ------------------------------------------------------------------ rabbit
export const RFUR = "url(#sl-rabbit-fur)";

/** Rabbit head group (ears, head, bow, glasses, pencil) pivoting on the neck point (box 150,222). */
export function rabbitHead({ neck, s = 1, tilt = 0, expr = "idle", extras = "" }) {
  const group = `${part("Pencil")}${part("RabbitEars")}${part("RabbitHead", { expression: expr })}${part("Bow")}${part("Glasses")}${extras}`;
  return place(group, { x: neck[0], y: neck[1], s, rot: tilt, cx: 150, cy: 222 });
}

export function rabbitTorso({ neck, hip, s = 1, ...w }) {
  const d = torsoPath(neck, hip, { wN: 50, wS: 104, wW: 96, wH: 104, ...w });
  const u = unit(sub(hip, neck));
  const a = add(neck, mul(u, 14 * s));
  const b = add(hip, mul(u, 10 * s));
  const btn = (t) => {
    const p = lerp(a, b, t);
    return `<circle cx="${r2(p[0])}" cy="${r2(p[1])}" r="${r2(3.6 * s)}" fill="url(#sl-gold)"/>`;
  };
  const collar = place(
    `<path d="M150 222C140 220 126 223 121 232C126 243 142 243 150 232Z" fill="#FFFDF8"/><path d="M150 222C160 220 174 223 179 232C174 243 158 243 150 232Z" fill="#F4F0FA"/>`,
    { x: neck[0], y: neck[1] + 4 * s, s, rot: (Math.atan2(u[0] * -1, u[1]) * 180) / Math.PI, cx: 150, cy: 222 },
  );
  return `<path d="${d}" fill="url(#sl-cardigan)"/><path d="M${f(a)}L${f(b)}" stroke="#8C76D0" stroke-width="2.4" stroke-linecap="round"/>${btn(0.25)}${btn(0.45)}${collar}`;
}

export function rabbitPaw([x, y], s = 1, rot = 0) {
  return place(part("RabbitPaw", { x: 0, y: 0 }), { x, y, s, rot, cx: 0, cy: 0 });
}

/** White rabbit foot (a big oval with two toe lines); toe points -x, flip for the other side. */
export function rabbitFoot({ at, rot = 0, flip = false, s = 1 }) {
  return `<g transform="translate(${r2(at[0])} ${r2(at[1])}) rotate(${rot}) scale(${flip ? -s : s} ${s})">
    <ellipse rx="26" ry="11.5" fill="${RFUR}"/>
    <path d="M-17 -2v6M-9 -3v7" stroke="#C9BFD9" stroke-width="2.4" stroke-linecap="round"/>
  </g>`;
}

// ------------------------------------------------------------------ flat human study figure (stage 2)
export const HUMAN = { skin: "#F1C9A5", hair: "#6B4E3D", ink: "#2B3A55", white: "#F6F1E4" };

export function humanLimb(a, b, r1, r2_, fill) {
  return `<path d="${capsule(a, b, r1, r2_)}" fill="${fill}"/>`;
}
export function humanHead({ at, r = 32, tilt = 0, hair = HUMAN.hair, cap = "", face = true }) {
  const [x, y] = at;
  return `<g transform="rotate(${tilt} ${r2(x)} ${r2(y + r * 1.4)})">
    <circle cx="${r2(x)}" cy="${r2(y)}" r="${r}" fill="${HUMAN.skin}"/>
    <path d="M${r2(x - r)} ${r2(y - 2)}C${r2(x - r)} ${r2(y - r * 1.2)} ${r2(x + r)} ${r2(y - r * 1.2)} ${r2(x + r)} ${r2(y - 2)}C${r2(x + r * 0.5)} ${r2(y - r * 0.55)} ${r2(x - r * 0.5)} ${r2(y - r * 0.55)} ${r2(x - r)} ${r2(y - 2)}Z" fill="${hair}"/>
    ${cap}
    ${face ? `<circle cx="${r2(x - r * 0.36)}" cy="${r2(y + r * 0.12)}" r="2.6" fill="${C.night2}"/><circle cx="${r2(x + r * 0.36)}" cy="${r2(y + r * 0.12)}" r="2.6" fill="${C.night2}"/>` : ""}
  </g>`;
}
