// I THE MAGICIAN (마법사) — v2, three stages. Iconic composition kept from the 1909 scan: a tall figure, one arm
// straight up with the wand, the other pointing down (a single diagonal through the head), the lemniscate above
// the head, the four tools on a table at the left, flowers below, roses overhead.
import { smooth, catHead, catPaw, humanLimb, humanHead, HUMAN } from "../tools/lib/actors.mjs";

export const symbols = [
  { name: "actor", rank: 1 },
  { name: "wand-up", rank: 1 },
  { name: "infinity", rank: 1 },
  { name: "point-down", rank: 1 },
  { name: "four-tools", rank: 1 },
  { name: "flowers", rank: 2 },
  { name: "roses-overhead", rank: 3 },
];

const J = {
  neck: [304, 432], tilt: 0,
  shL: [250, 470], shR: [358, 470],
  cuffL: [182, 318], pawL: [170, 292], // raised arm; the wand is held at the paw
  cuffR: [452, 586], pawR: [468, 612], tipR: [484, 676], // pointing arm and the finger's tip
  robeTop: 452, hem: 874,
  wand: { x: 168, top: 124, bottom: 346 },
  inf: [304, 168],
  table: { x0: 40, x1: 300, top: 706 },
};
const COL = { bg: "#5B4FB8", halo: "#7566D0", robe: "#1C1850", robeLight: "#2E2A78", floor: "#2E2A78", tunic: "#FFF7E8", wand: "#FFFFFF" };

function ground(k) {
  return `${k.bg(COL.bg)}<circle cx="304" cy="400" r="212" fill="${COL.halo}"/><path d="M-80 806H680V1200H-80Z" fill="${COL.floor}"/>`;
}

function infinity(k) {
  const [x, y] = J.inf;
  const d = "M-76 0C-76 -46 -22 -46 0 0C22 46 76 46 76 0C76 -46 22 -46 0 0C-22 46 -76 46 -76 0Z";
  return k.sym("infinity", 1, `<g transform="translate(${x} ${y})"><path d="${d}" fill="none" stroke="${k.C.night2}" stroke-width="26" stroke-linejoin="round" opacity=".35"/><path d="${d}" fill="none" stroke="${k.C.gold}" stroke-width="17" stroke-linejoin="round"/></g>`);
}

function wand(k) {
  const { x, top, bottom } = J.wand;
  const len = bottom - top;
  return k.sym("wand-up", 1, `<g transform="translate(${x} ${top})">
    <rect x="-12" y="0" width="24" height="${len}" rx="12" fill="${COL.wand}"/>
    <rect x="-15" y="-6" width="30" height="28" rx="9" fill="${k.C.gold}"/><rect x="-15" y="${len - 24}" width="30" height="28" rx="9" fill="${k.C.gold}"/>
    <path d="${k.sparklePath(0, -26, 17)}" fill="${k.C.goldLight}"/></g>`);
}

function table(k) {
  const { x0, x1, top } = J.table;
  const items = k.sym("four-tools", 1, `
    <g transform="translate(96 ${top - 4})">
      <path d="M-34 -118C-36 -86 -20 -66 0 -62C20 -66 36 -86 34 -118Z" fill="${k.C.gold}"/><ellipse cx="0" cy="-118" rx="34" ry="9" fill="${k.C.goldLight}"/><ellipse cx="0" cy="-118" rx="28" ry="5.5" fill="${k.C.violet}"/>
      <path d="M-7 -62C-6 -40 -9 -26 -13 -10H13C9 -26 6 -40 7 -62Z" fill="${k.C.gold}"/><path d="M-30 0C-30 -8 -14 -12 0 -12C14 -12 30 -8 30 0Z" fill="${k.C.goldDeep}"/><path d="M-30 0H30" stroke="${k.C.gold}" stroke-width="6" stroke-linecap="round"/>
    </g>
    <g transform="translate(184 ${top - 46})"><circle r="42" fill="${k.C.goldDeep}"/><circle r="36" fill="${k.C.gold}"/><path d="${k.starPath(0, 2, 26, 0.42)}" fill="${k.C.sun ?? "#FFF2C8"}" stroke="${k.C.goldDeep}" stroke-width="3" stroke-linejoin="round"/></g>
    <g transform="translate(60 ${top + 18})"><path d="M30 -8H190L214 0L190 8H30Z" fill="#F4F0FF"/><rect x="8" y="-6" width="26" height="12" rx="4" fill="${k.C.violet}"/><rect x="26" y="-18" width="11" height="36" rx="5" fill="${k.C.gold}"/><circle cx="2" cy="0" r="9" fill="${k.C.gold}"/></g>
    <g transform="translate(60 ${top + 44})"><rect x="0" y="-7" width="232" height="14" rx="7" fill="#C9A45E"/><rect x="0" y="-8" width="16" height="16" rx="6" fill="${k.C.gold}"/><rect x="216" y="-8" width="16" height="16" rx="6" fill="${k.C.gold}"/></g>`);
  const cloth = `
    <path d="M${x0} ${top}L${x1 - 24} ${top - 8}L${x1 + 4} ${top + 52}L${x0} ${top + 58}Z" fill="#4B46A8"/>
    <path d="M${x0} ${top + 58}L${x1 + 4} ${top + 52}V906H${x0}Z" fill="${k.C.navy}"/>
    <path d="M${x0} ${top + 66}L${x1 + 4} ${top + 60}" stroke="${k.C.gold}" stroke-width="6"/>
    ${[90, 170, 250].map((x) => `<path d="${k.starPath(x, top + 108, 13)}" fill="${k.C.gold}"/>`).join("")}`;
  return cloth + items;
}

function flowers(k) {
  const items = [[70, 842, "r", 28], [134, 852, "l", 30], [200, 838, "r", 26], [266, 854, "l", 30], [336, 842, "r", 28], [404, 856, "l", 30], [470, 840, "r", 28], [534, 852, "l", 28]];
  const leaves = Array.from({ length: 14 }, (_, i) => k.leaf(30 + i * 40, 872, 56, -150 + (i % 2) * 60 - 20, { wide: 0.36 })).join("");
  const blooms = items.map(([x, y, t, r]) => (t === "r" ? k.rose(x, y, r, i0(x)) : k.lily(x, y, r, i0(x) - 20))).join("");
  return k.sym("flowers", 2, `${leaves}${blooms}`);
}
const i0 = (x) => (x * 7) % 50;

function garlands(k) {
  const vine = (side) => {
    const sx = side === "L" ? 1 : -1;
    const X = (x) => (side === "L" ? x : 600 - x);
    return `<path d="M${X(52)} 112C${X(66)} 150 ${X(40)} 190 ${X(66)} 238C${X(78)} 262 ${X(70)} 280 ${X(60)} 300" stroke="${k.C.green}" stroke-width="8" stroke-linecap="round" fill="none"/>
      ${k.leaf(X(60), 180, 38, side === "L" ? 20 : 160, { wide: 0.38 })}${k.leaf(X(66), 246, 38, side === "L" ? 150 : 30, { wide: 0.38 })}
      ${k.rose(X(60), 138, 24, 10)}${k.rose(X(70), 214, 24, -20)}${k.rose(X(62), 292, 20, 0)}`;
  };
  return k.sym("roses-overhead", 3, vine("L") + vine("R"));
}

// ---------------------------------------------------------------- stage 2: the flat study
export function stage2(k) {
  const red = "#C8453F";
  const robe = `<path d="${smooth([[250, 452], [226, 590], [176, 780], [152, 868], [224, 884], [304, 888], [384, 884], [456, 868], [432, 780], [382, 590], [358, 452], [304, 440]])}" fill="${red}"/>
    <path d="${smooth([[274, 450], [262, 600], [248, 800], [262, 884], [346, 884], [352, 800], [340, 600], [334, 450]])}" fill="${HUMAN.white}"/>
    <path d="M254 640H354V668H254Z" fill="#6C8CD5"/>`;
  const armUp = `${humanLimb(J.shL, J.cuffL, 20, 24, HUMAN.white)}<circle cx="${J.pawL[0]}" cy="${J.pawL[1]}" r="15" fill="${HUMAN.skin}"/>`;
  const armDown = `${humanLimb(J.shR, J.cuffR, 20, 24, HUMAN.white)}${humanLimb(J.pawR, J.tipR, 12, 8, HUMAN.skin)}<circle cx="${J.pawR[0]}" cy="${J.pawR[1]}" r="14" fill="${HUMAN.skin}"/>`;
  const head = humanHead({ at: [J.neck[0], J.neck[1] - 52], r: 36, hair: "#5B4034", cap: `<rect x="${J.neck[0] - 38}" y="${J.neck[1] - 82}" width="76" height="10" rx="5" fill="${HUMAN.white}"/>` });
  const body = `${ground(k)}${garlands(k)}${infinity(k)}${robe}${armUp}${armDown}${head}${wand(k)}${table(k)}${flowers(k)}${trickle(k)}`;
  return { title: "I 마법사 · 2단계 단순화 (The Magician, simplified study)", desc: "1909 마법사 카드의 구도를 평면 도형으로 단순화한 습작. 한 팔은 지팡이를 높이, 다른 팔은 땅을 가리키고, 머리 위 무한대, 탁자 위 네 도구, 아래의 꽃.", defs: "", body };
}

function trickle(k) {
  const [x, y] = J.tipR;
  return k.sym("point-down", 1, [[2, 36, 7], [6, 64, 5.5], [10, 90, 4]].map(([dx, dy, r]) => `<circle cx="${x + dx}" cy="${y + dy}" r="${r}" fill="${k.C.gold}"/>`).join(""));
}

// ---------------------------------------------------------------- stage 3: the cat wizard
export function stage3(k) {
  const { C } = k;
  const robePts = [[250, 452], [226, 590], [176, 780], [152, 868], [224, 884], [304, 888], [384, 884], [456, 868], [432, 780], [382, 590], [358, 452], [304, 440]];
  const robe = `<path d="${smooth(robePts)}" fill="${COL.robe}"/>
    <path d="${smooth([[274, 450], [262, 600], [250, 800], [262, 884], [346, 884], [358, 800], [346, 600], [334, 450]])}" fill="${COL.tunic}"/>
    <path d="M246 638H362L364 676H244Z" fill="${C.gold}"/><circle cx="304" cy="657" r="15" fill="none" stroke="${C.goldDeep}" stroke-width="5"/>
    <path d="M154 858C220 874 388 874 454 858L458 874C390 892 218 892 150 874Z" fill="${C.gold}"/>
    ${[[214, 740], [392, 760], [236, 830], [378, 826], [200, 640], [410, 650]].map(([x, y], i) => `<path d="${k.starPath(x, y, 9 - (i % 2))}" fill="${C.gold}"/>`).join("")}
    <circle cx="304" cy="446" r="10" fill="${C.gold}"/><path d="M296 452C290 520 280 600 262 700M312 452C318 520 328 600 346 700" stroke="${C.gold}" stroke-width="3.4" fill="none" opacity=".8"/>`;
  const sleeve = (a, b, r1, r2) => `<path d="${k.capsule(a, b, r1, r2)}" fill="${COL.robe}"/>`;
  const cuff = (p, ang) => `<rect x="-34" y="-9" width="68" height="18" rx="9" transform="translate(${p[0]} ${p[1]}) rotate(${ang})" fill="${C.gold}"/>`;
  const angUp = (Math.atan2(J.cuffL[1] - J.shL[1], J.cuffL[0] - J.shL[0]) * 180) / Math.PI + 90;
  const angDn = (Math.atan2(J.cuffR[1] - J.shR[1], J.cuffR[0] - J.shR[0]) * 180) / Math.PI + 90;
  const armUp = k.sym("wand-up", 1, `${sleeve(J.shL, J.cuffL, 24, 34)}${cuff(J.cuffL, angUp)}${catPaw(J.pawL, 1.25)}`);
  const finger = `<path d="${k.capsule(J.pawR, J.tipR, 13, 9)}" fill="#4A3F7A" opacity=".3" transform="translate(3 4)" filter="url(#sl-blur)"/><path d="${k.capsule(J.pawR, J.tipR, 13, 9)}" fill="url(#sl-cat-fur)"/><ellipse cx="${J.tipR[0] + 1}" cy="${J.tipR[1] + 6}" rx="5" ry="3.4" fill="#F4A3B7"/>`;
  const armDown = k.sym("point-down", 1, `${sleeve(J.shR, J.cuffR, 24, 34)}${cuff(J.cuffR, angDn)}${catPaw(J.pawR, 1.45, -16)}${finger}`);
  const head = catHead({ neck: J.neck, s: 1, tilt: 0, expr: "idle" });
  const body = `${ground(k)}${garlands(k)}${infinity(k)}${k.sym("actor", 1, robe)}${armUp}${armDown}${k.sym("actor", 1, head)}${wand(k)}${k.sym("wand-up", 1, catPaw(J.pawL, 1.25))}${table(k)}${flowers(k)}${trickle(k)}`;
  return { title: "I 마법사 · 3단계 캐릭터화 (The Magician)", desc: "점성술사 고양이가 한 팔로 지팡이를 높이 들고 다른 손으로 땅을 가리킨다. 머리 위 무한대, 탁자 위 컵·펜타클·칼·지팡이, 아래의 장미와 백합.", defs: "", body };
}
