// XVII THE STAR (별) — v2, three stages. Composition kept from the 1909 scan: one big eight-pointed star and seven
// small ones across the top; below, a figure bending over a pond on one knee, one jug emptying into the pond
// and one onto the land (five streams); a tree with a bird on the right, a far mountain on the left.
import { torsoPath, furLimb, rabbitHead, rabbitTorso, rabbitPaw, rabbitFoot, humanLimb, humanHead, RFUR } from "../tools/lib/actors.mjs";

export const symbols = [
  { name: "actor", rank: 1 },
  { name: "big-star", rank: 1 },
  { name: "small-stars", rank: 1 },
  { name: "two-jugs", rank: 1 },
  { name: "pond", rank: 1 },
  { name: "streams", rank: 2 },
  { name: "tree-bird", rank: 3 },
];

const J = {
  star: [300, 238], R: 104,
  smalls: [[90, 178], [84, 300], [112, 420], [210, 360], [510, 168], [516, 296], [452, 410]],
  // the 1909 pose: a kneeling lunge over the pond. Right knee (viewer's right) on the grass with the shin lying back,
  // left foot in the water, torso bent forward, both jugs held low and almost upside down.
  neck: [342, 634], tilt: -22, hip: [410, 736],
  shL: [316, 688], shR: [410, 628],
  pawL: [228, 764], pawR: [484, 752],
  kneeK: [394, 812], ankleK: [458, 826], // kneeling leg: knee on the grass
  kneeF: [310, 764], footF: [240, 842], // forward leg: thigh forward, shin down into the pond
  jugL: { at: [206, 742], rot: -150 }, jugR: { at: [500, 722], rot: 150 },
  pour: [529, 836], pourL: [177, 856],
};
const COL = { sky: "#1F1C66", skyLow: "#2B3490", star: "#F5C842", starIn: "#FFE79A", mtn: "#6A5FC4", hill: "#2E8A7E", land: "#43AA90", pond: "#3F66CC", pondDeep: "#2F4FAE", ring: "#CFE0FF", jug: "#E08A52", jugDeep: "#B1523A", trunk: "#6B4E8C" };

function skyAndStars(k) {
  const { C } = k;
  const big = k.sym("big-star", 1, `<path d="${k.star8(...J.star, J.R)}" fill="${COL.star}"/><path d="${k.star8(...J.star, J.R * 0.56, { rot: 22.5, diag: 1, inner: 0.5 })}" fill="${COL.starIn}"/>`);
  const small = k.sym("small-stars", 1, J.smalls.map(([x, y], i) => `<path d="${k.star8(x, y, 32, { rot: i % 2 ? 8 : 0 })}" fill="#FFFFFF"/>`).join(""));
  return `${k.bg(COL.sky)}<rect x="-80" y="470" width="760" height="260" fill="${COL.skyLow}"/>${big}${small}`;
}

function land(k) {
  const tree = k.sym("tree-bird", 3, `
    <path d="M508 612C510 588 510 570 506 548L524 548C522 570 524 592 528 614Z" fill="${COL.trunk}"/>
    <circle cx="486" cy="530" r="36" fill="${COL.hill}"/><circle cx="532" cy="508" r="46" fill="${COL.hill}"/><circle cx="572" cy="536" r="34" fill="${COL.hill}"/><circle cx="522" cy="548" r="34" fill="${COL.hill}"/>
    <g transform="translate(548 462)"><ellipse cx="0" cy="4" rx="22" ry="12" fill="#FFFFFF"/><circle cx="18" cy="-6" r="9" fill="#FFFFFF"/><path d="M26 -6L42 -2L26 2Z" fill="${k.C.gold}"/><path d="M-14 0C-26 -8 -30 -16 -32 -24C-22 -20 -16 -12 -8 -6Z" fill="${k.C.coral}"/><circle cx="21" cy="-8" r="2.4" fill="${k.C.night2}"/></g>`);
  return `<path d="M-60 660L96 566L250 660Z" fill="${COL.mtn}"/>
    <path d="M-80 700C60 640 180 650 280 690C360 640 440 580 520 580C580 580 640 600 680 620V1200H-80Z" fill="${COL.hill}"/>
    ${tree}
    <path d="M-80 748C100 722 240 734 330 770C420 740 540 726 680 740V1200H-80Z" fill="${COL.land}"/>`;
}

function pond(k) {
  const d = "M-80 790C0 762 150 764 246 792C318 814 334 876 282 908C230 936 100 940 -80 936Z";
  const ring = (cx, cy, base) => [1, 1.9, 2.9].map((m, i) => `<ellipse cx="${cx}" cy="${cy}" rx="${base * m}" ry="${base * m * 0.3}" fill="none" stroke="${COL.ring}" stroke-opacity="${1 - i * 0.22}" stroke-width="4"/>`).join("");
  return k.sym("pond", 1, `<path d="${d}" fill="${COL.pond}"/><path d="M-80 930C60 944 200 940 282 908C334 876 318 814 246 792C310 830 296 880 220 900C140 920 20 916 -80 880Z" fill="${COL.pondDeep}" opacity=".6"/>${ring(J.pourL[0], J.pourL[1], 22)}${ring(J.footF[0], J.footF[1] + 14, 17)}`);
}

function streams(k) {
  const [ox, oy] = J.pour;
  const rel = (pts) => pts.map(([dx, dy]) => [ox + dx, oy + dy]);
  const defs = [
    [[[0, 0], [-26, 20], [-62, 34], [-98, 62], [-122, 94], [-138, 130]], 8, 24],
    [[[0, 0], [4, 30], [-4, 60], [6, 92], [14, 128]], 8, 24],
    [[[0, 0], [26, 20], [58, 30], [86, 54], [112, 84], [128, 120]], 8, 24],
    [[[0, 0], [34, 0], [68, -6], [104, 2], [138, 14], [172, 10]], 8, 16],
    [[[0, 0], [-30, 6], [-56, 16], [-84, 12], [-110, 2], [-136, 6]], 8, 16],
  ];
  return k.sym("streams", 2, defs.map(([pts, w0, w1]) => `<path d="${k.ribbon(rel(pts), w0, w1)}" fill="${COL.waterLight ?? "#9FC0F5"}"/>`).join("") + `<ellipse cx="${ox}" cy="${oy + 2}" rx="22" ry="8" fill="#CFE0FF"/>`);
}

function jug(k, { at, rot }, flip) {
  return `<g transform="translate(${at[0]} ${at[1]}) rotate(${rot}) scale(${flip ? -1.15 : 1.15} 1.15)">
    <path d="M-8 -28C-8 -40 -12 -46 -15 -50H15C12 -46 8 -40 8 -28Z" fill="${COL.jugDeep}"/>
    <path d="M30 -18C50 -22 54 8 34 16" stroke="${COL.jugDeep}" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M0 -30C-30 -30 -38 -4 -34 14C-30 34 -14 40 0 40C14 40 30 34 34 14C38 -4 30 -30 0 -30Z" fill="${COL.jug}"/>
    <path d="M-30 4C-30 24 -14 38 0 40C-12 30 -22 18 -30 4Z" fill="${COL.jugDeep}" opacity=".5"/>
    <ellipse cx="0" cy="-51" rx="17.5" ry="5.6" fill="#FFD9A0"/><ellipse cx="0" cy="-51" rx="12.6" ry="3.4" fill="#4A2216"/>
    <path d="M-27 -6C-18 0 18 0 27 -6" stroke="${k.C.goldLight}" stroke-width="5" stroke-linecap="round" fill="none"/>
    <path d="${k.starPath(0, 17, 10)}" fill="${k.C.gold}"/>
  </g>`;
}

function jugsAndWater(k) {
  const mouth = (j, flip) => {
    const a = (j.rot * Math.PI) / 180;
    return [j.at[0] + 1.15 * 51 * Math.sin(a), j.at[1] - 1.15 * 51 * Math.cos(a)];
  };
  const mL = mouth(J.jugL, false);
  const mR = mouth(J.jugR, true);
  const fall = (m, ty) => `<path d="M${r(m[0] - 8)} ${r(m[1])}H${r(m[0] + 8)}L${r(m[0] + 10)} ${ty}H${r(m[0] - 10)}Z" fill="#CFE0FF"/><path d="M${r(m[0] - 2)} ${r(m[1] + 6)}V${ty - 8}" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>`;
  const r = (n) => Math.round(n);
  J.pour = [r(mR[0]), 836];
  J.pourL = [r(mL[0]), 856];
  return { mL, mR, markup: k.sym("two-jugs", 1, `${fall(mL, 856)}${fall(mR, 836)}${jug(k, J.jugL, false)}${jug(k, J.jugR, true)}`) };
}

// ---------------------------------------------------------------- stage 2: flat study with the human figure
export function stage2(k) {
  const skin = "#F2C9A8";
  const jw = jugsAndWater(k);
  const a = (J.tilt * Math.PI) / 180;
  const hd = [J.neck[0] + 52 * Math.sin(a), J.neck[1] - 52 * Math.cos(a)];
  const figure = `
    ${humanLimb(J.hip, J.kneeK, 23, 19, skin)}${humanLimb(J.kneeK, J.ankleK, 19, 13, skin)}<circle cx="${J.kneeK[0]}" cy="${J.kneeK[1]}" r="21" fill="${skin}"/><ellipse cx="${J.ankleK[0] + 20}" cy="${J.ankleK[1] + 6}" rx="26" ry="11" fill="${skin}"/>
    ${humanLimb(J.hip, J.kneeF, 23, 19, skin)}${humanLimb(J.kneeF, J.footF, 19, 13, skin)}<ellipse cx="${J.footF[0] - 12}" cy="${J.footF[1] + 8}" rx="26" ry="11" fill="${skin}"/>
    <path d="${torsoPath(J.neck, J.hip, { wN: 50, wS: 104, wW: 92, wH: 100 })}" fill="#E8EEF8"/>
    ${humanLimb(J.shL, J.pawL, 15, 12, skin)}${humanLimb(J.shR, J.pawR, 15, 12, skin)}
    ${humanHead({ at: hd, r: 31, tilt: J.tilt, hair: "#F0D26B", face: false })}`;
  const body = `${skyAndStars(k)}${land(k)}${pond(k)}${streams(k)}${k.sym("actor", 1, figure)}${jw.markup}`;
  return { title: "XVII 별 · 2단계 단순화 (The Star, simplified study)", desc: "1909 별 카드의 구도를 평면 도형으로 단순화한 습작. 하늘의 큰 별과 작은 별 일곱, 연못 쪽으로 몸을 숙여 한쪽 무릎은 땅에 한쪽 발은 연못에 둔 인물, 두 항아리, 갈라지는 물줄기, 나무 위 새.", defs: "", body };
}

// ---------------------------------------------------------------- stage 3: the rabbit pours
export function stage3(k) {
  const jw = jugsAndWater(k);
  const legK = `${furLimb(J.hip, J.kneeK, 27, 22, { fill: RFUR })}${furLimb(J.kneeK, J.ankleK, 22, 17, { fill: RFUR })}<circle cx="${J.kneeK[0]}" cy="${J.kneeK[1]}" r="25" fill="${RFUR}"/>${rabbitFoot({ at: [J.ankleK[0] + 22, J.ankleK[1] + 8], rot: 3, flip: true, s: 0.95 })}`;
  const legF = `${furLimb(J.hip, J.kneeF, 27, 22, { fill: RFUR })}${furLimb(J.kneeF, J.footF, 22, 17, { fill: RFUR })}${rabbitFoot({ at: [J.footF[0] - 14, J.footF[1] + 8], rot: -4, s: 1 })}`;
  const torso = rabbitTorso({ neck: J.neck, hip: J.hip, wS: 124, wW: 116, wH: 124 });
  const armL = `${furLimb(J.shL, J.pawL, 20, 15, { fill: "url(#sl-cardigan)" })}`;
  const armR = `${furLimb(J.shR, J.pawR, 20, 15, { fill: "url(#sl-cardigan)" })}`;
  const head = rabbitHead({ neck: J.neck, s: 1, tilt: J.tilt, expr: "focus" });
  const paws = `${rabbitPaw([J.pawL[0] + 2, J.pawL[1] - 6], 1.2)}${rabbitPaw([J.pawR[0] - 2, J.pawR[1] - 6], 1.2)}`;
  const body = `${skyAndStars(k)}${land(k)}${pond(k)}${streams(k)}${k.sym("actor", 1, `${legK}${legF}${torso}${armL}${armR}${head}`)}${jw.markup}${k.sym("actor", 1, paws)}`;
  return { title: "XVII 별 · 3단계 캐릭터화 (The Star)", desc: "사서 토끼가 연못 쪽으로 몸을 숙여 한쪽 무릎은 땅에, 한쪽 발은 연못에 두고, 두 항아리의 물을 하나는 연못에 하나는 땅에 붓는다. 하늘에는 큰 별 하나와 작은 별 일곱, 나무 위의 새.", defs: "", body };
}
