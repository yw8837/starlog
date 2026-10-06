// VI THE LOVERS (연인) — three stages. Composition kept from the 1909 scan: a huge sun at the top, the angel with spread red wings
// and raised open hands on a cloud below it, two figures standing apart (the woman at the left looks up at the angel, the man at
// the right looks at her) without touching, the fruit tree with the serpent behind her, the flame tree behind him, a pointed
// mountain between them.
import { smooth, torsoPath, furLimb, catHead, catTorso, catCape, rabbitHead, rabbitTorso, rabbitPaw, rabbitFoot, humanLimb, humanHead, HUMAN, FUR, RFUR } from "../tools/lib/actors.mjs";

export const symbols = [
  { name: "actor", rank: 1 },
  { name: "angel", rank: 1 },
  { name: "sun", rank: 1 },
  { name: "mountain", rank: 2 },
  { name: "fruit-tree-serpent", rank: 2 },
  { name: "flame-tree", rank: 2 },
];

const J = {
  sun: [300, 214], R: 188,
  angel: { neck: [300, 322], hip: [300, 450], shL: [240, 352], shR: [360, 352], pawL: [116, 292], pawR: [484, 292], s: 0.9 },
  woman: { neck: [150, 636], hip: [150, 768], shL: [112, 680], shR: [188, 680], pawL: [50, 744], pawR: [250, 742], feet: [[132, 852], [172, 852]], tilt: 12, s: 0.78 },
  man: { neck: [452, 644], hip: [452, 774], shL: [414, 688], shR: [490, 688], pawL: [350, 744], pawR: [552, 746], feet: [[432, 852], [472, 852]], tilt: -10, s: 0.78 },
  mountain: { apex: [300, 628], base: 840 },
};
const COL = { sky: "#7FA3EA", sunDisc: "#F6D060", sunRing: "#FFE79A", wing: "#D8435A", wingDark: "#9E2A42", robe: "#B9B5CF", cloud: "#FFFFFF", cloudShade: "#E4E0F2", mtn: "#8774D8", peak: "#D8435A", ground: "#43AA90", groundDark: "#2E8A7E", trunk: "#7A5A4F", canopy: "#43AA90", canopyDark: "#2E8A7E", flame: "#E0764A", serpent: "#B8F0C8" };

function sky(k) {
  const [x, y] = J.sun;
  const rays = Array.from({ length: 18 }, (_, i) => `<path transform="rotate(${i * 20})" d="M${J.R + 14} -14L${J.R + 70} 0L${J.R + 14} 14Z" fill="${COL.sunRing}"/>`).join("");
  const sun = k.sym("sun", 1, `<g transform="translate(${x} ${y})">${rays}<circle r="${J.R}" fill="${COL.sunDisc}"/><circle r="${J.R - 36}" fill="${COL.sunRing}" opacity=".55"/></g>`);
  return `${k.bg(COL.sky)}${sun}`;
}

function land(k) {
  const m = J.mountain;
  const mountain = k.sym("mountain", 2, `<path d="M${m.apex[0] - 150} ${m.base}L${m.apex[0]} ${m.apex[1]}L${m.apex[0] + 150} ${m.base}Z" fill="${COL.mtn}"/><path d="M${m.apex[0] - 40} ${m.apex[1] + 50}L${m.apex[0]} ${m.apex[1]}L${m.apex[0] + 40} ${m.apex[1] + 50}L${m.apex[0] + 12} ${m.apex[1] + 38}L${m.apex[0] - 14} ${m.apex[1] + 56}Z" fill="${COL.peak}"/>`);
  const fruit = k.sym("fruit-tree-serpent", 2, `
    <rect x="52" y="548" width="38" height="340" rx="14" fill="${COL.trunk}"/>
    <circle cx="72" cy="516" r="66" fill="${COL.canopy}"/><circle cx="124" cy="546" r="46" fill="${COL.canopyDark}"/><circle cx="40" cy="560" r="44" fill="${COL.canopyDark}"/>
    ${[[48, 498], [100, 516], [74, 566], [128, 556]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" fill="${COL.wing}"/>`).join("")}
    <path d="M70 880C32 846 104 816 68 780C30 744 104 712 70 672" stroke="${COL.serpent}" stroke-width="15" stroke-linecap="round" fill="none"/><circle cx="70" cy="662" r="13" fill="${COL.serpent}"/>`);
  const flame = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -30C16 -10 20 10 0 28C-20 10 -16 -10 0 -30Z" fill="${COL.flame}"/><path d="M0 -12C8 -2 9 8 0 18C-9 8 -8 -2 0 -12Z" fill="${COL.sunRing}"/></g>`;
  const fire = k.sym("flame-tree", 2, `
    <rect x="512" y="456" width="30" height="432" rx="12" fill="#4B3F86"/>
    <path d="M527 520L550 508M527 596L546 596M527 676L550 680M527 470L488 452" stroke="#4B3F86" stroke-width="16" stroke-linecap="round"/>
    ${[[527, 432, 1.1], [484, 450, 0.9], [550, 508, 1], [546, 596, 1], [550, 680, 0.9], [527, 520, 0.9]].map(([x, y, s]) => flame(x, y, s)).join("")}`);
  return `<path d="M-80 836C120 820 300 828 680 822V1200H-80Z" fill="${COL.ground}"/><path d="M-80 900H680V1200H-80Z" fill="${COL.groundDark}"/>${mountain}${fruit}${fire}`;
}

const wing = (mirror) => `<g ${mirror ? 'transform="matrix(-1 0 0 1 600 0)"' : ""}>
  <path d="M250 300C200 232 120 178 22 172L44 208L16 238L54 258L30 292L76 302L66 338L126 332L150 366C200 354 236 334 262 318Z" fill="${COL.wing}"/>
  <path d="M254 306C206 256 134 220 74 218L94 248L64 272L112 288L100 318L160 324C200 318 232 316 260 316Z" fill="${COL.wingDark}" opacity=".5"/></g>`;
const cloud = (k) => `<g fill="${COL.cloud}"><circle cx="196" cy="486" r="46"/><circle cx="252" cy="466" r="58"/><circle cx="318" cy="470" r="64"/><circle cx="384" cy="478" r="52"/><circle cx="424" cy="492" r="40"/><rect x="190" y="480" width="236" height="58" rx="29"/></g><path d="M176 520Q300 566 436 520" stroke="${COL.cloudShade}" stroke-width="14" stroke-linecap="round" fill="none"/>`;

// ---------------------------------------------------------------- stage 2: the flat study (humans)
export function stage2(k) {
  const a = J.angel;
  const skin = HUMAN.skin;
  const angel = `${wing(false)}${wing(true)}
    <path d="${smooth([[236, 332], [364, 332], [412, 460], [300, 510], [188, 460]])}" fill="${COL.robe}"/>
    ${humanLimb(a.shL, a.pawL, 18, 13, COL.robe)}${humanLimb(a.shR, a.pawR, 18, 13, COL.robe)}<circle cx="${a.pawL[0]}" cy="${a.pawL[1]}" r="17" fill="${skin}"/><circle cx="${a.pawR[0]}" cy="${a.pawR[1]}" r="17" fill="${skin}"/>
    <path d="M262 258L246 206L276 232L284 188L304 226L326 186L330 232L356 208L340 262Z" fill="${COL.flame}"/>
    ${humanHead({ at: [300, 284], r: 34, hair: COL.flame, face: true })}`;
  const person = (p, hair) => `
    ${humanLimb([p.hip[0] - 14, p.hip[1]], p.feet[0], 19, 14, skin)}${humanLimb([p.hip[0] + 14, p.hip[1]], p.feet[1], 19, 14, skin)}
    <path d="${torsoPath(p.neck, p.hip, { wN: 44, wS: 88, wW: 74, wH: 84 })}" fill="${skin}"/>
    ${humanLimb(p.shL, p.pawL, 13, 10, skin)}${humanLimb(p.shR, p.pawR, 13, 10, skin)}
    ${humanHead({ at: [p.neck[0], p.neck[1] - 46], r: 30, hair, face: true, tilt: p.tilt })}`;
  const body = `${sky(k)}${land(k)}${k.sym("angel", 1, `${angel}`)}${cloud(k)}
    ${k.sym("actor", 1, `${person(J.woman, "#F0D26B")}${person(J.man, "#6B4E3D")}`)}`;
  return { title: "VI 연인 · 2단계 단순화 (The Lovers, simplified study)", desc: "1909 연인 카드의 구도를 평면 도형으로 단순화한 습작. 맨 위의 큰 해, 붉은 날개를 펼친 천사와 구름, 떨어져 선 두 사람(왼쪽은 천사를 올려다보고 오른쪽은 왼쪽을 본다), 뱀 감긴 열매 나무와 불꽃 나무, 가운데 산.", defs: "", body };
}

// ---------------------------------------------------------------- stage 3: the rabbit, the cat and the winged white rabbit
export function stage3(k) {
  const { place, part } = k;
  const a = J.angel;
  // the angel: the rabbit's ears and head only (no glasses, bow or pencil), white robe, gold halo, coral wings
  const angelHead = place(`${part("RabbitEars")}${part("RabbitHead", { expression: "happy" })}`, { x: a.neck[0], y: a.neck[1], s: a.s, cx: 150, cy: 222 });
  const halo = `<circle cx="300" cy="${a.neck[1] - 52}" r="78" fill="none" stroke="${k.C.gold}" stroke-width="13"/>`;
  const angel = `${wing(false)}${wing(true)}${halo}
    <path d="${smooth([[236, 340], [364, 340], [412, 460], [300, 510], [188, 460]])}" fill="${COL.robe}"/>
    ${furLimb(a.shL, a.pawL, 20, 14, { fill: RFUR })}${furLimb(a.shR, a.pawR, 20, 14, { fill: RFUR })}${rabbitPaw(a.pawL, 1.6, -30)}${rabbitPaw(a.pawR, 1.6, 30)}
    ${angelHead}`;

  const wo = J.woman;
  const rabbit = `
    ${furLimb([wo.hip[0] - 14, wo.hip[1]], wo.feet[0], 18, 14, { fill: RFUR })}${furLimb([wo.hip[0] + 14, wo.hip[1]], wo.feet[1], 18, 14, { fill: RFUR })}
    ${rabbitFoot({ at: [wo.feet[0][0] - 6, wo.feet[0][1] + 6], s: 0.62 })}${rabbitFoot({ at: [wo.feet[1][0] + 6, wo.feet[1][1] + 6], s: 0.62, flip: true })}
    ${rabbitTorso({ neck: wo.neck, hip: wo.hip, s: 0.8, wS: 96, wW: 86, wH: 96 })}
    ${furLimb(wo.shL, wo.pawL, 14, 11, { fill: "url(#sl-cardigan)" })}${furLimb(wo.shR, wo.pawR, 14, 11, { fill: "url(#sl-cardigan)" })}${rabbitPaw(wo.pawL, 0.95)}${rabbitPaw(wo.pawR, 0.95)}
    ${rabbitHead({ neck: wo.neck, s: wo.s, tilt: wo.tilt, expr: "idle" })}`;

  const m = J.man;
  const cat = `
    ${furLimb([m.hip[0] - 14, m.hip[1]], m.feet[0], 18, 14)}${furLimb([m.hip[0] + 14, m.hip[1]], m.feet[1], 18, 14)}
    ${place(part("CatFeet"), { x: (m.feet[0][0] + m.feet[1][0]) / 2, y: m.feet[0][1] + 8, s: 0.9, cx: 150, cy: 283 })}
    ${catTorso({ neck: m.neck, hip: m.hip, wS: 96, wW: 86, wH: 96 })}${catCape({ neck: m.neck, s: 0.9 })}
    ${furLimb(m.shL, m.pawL, 14, 11)}${furLimb(m.shR, m.pawR, 14, 11)}${k.place(part("CatPaw", { x: 0, y: 0 }), { x: m.pawL[0], y: m.pawL[1], s: 1, cx: 0, cy: 0 })}${k.place(part("CatPaw", { x: 0, y: 0 }), { x: m.pawR[0], y: m.pawR[1], s: 1, cx: 0, cy: 0 })}
    ${catHead({ neck: m.neck, s: m.s, tilt: m.tilt, expr: "idle" })}`;

  const body = `${sky(k)}${land(k)}${k.sym("angel", 1, angel)}${cloud(k)}
    ${k.sym("actor", 1, `${rabbit}${cat}`)}`;
  return { title: "VI 연인 · 3단계 캐릭터화 (The Lovers)", desc: "맨 위의 큰 해 아래, 날개 달린 흰 토끼 천사가 구름 위에서 두 팔을 펼친다. 아래에는 떨어져 선 사서 토끼(천사를 올려다봄)와 점성술사 고양이(토끼를 봄), 뱀 감긴 열매 나무와 불꽃 나무, 가운데 산.", defs: "", body };
}
