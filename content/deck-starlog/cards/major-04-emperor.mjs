// IV THE EMPEROR (황제) — three stages. Composition kept from the 1909 scan: dead-centre, frontal, symmetric: a grey stone
// throne with ram heads on the top corners and on both armrests, the ankh scepter held at the left, the orb at the right,
// a red robe over steel armour (pointed boots at the bottom), bare orange mountains on an orange sky, a long white beard
// and a gold crown.
import { smooth, furLimb, catHead, catTorso, catPaw, humanLimb, humanHead, HUMAN } from "../tools/lib/actors.mjs";

export const symbols = [
  { name: "actor", rank: 1 },
  { name: "throne-rams", rank: 1 },
  { name: "ankh-scepter", rank: 1 },
  { name: "orb", rank: 1 },
  { name: "crown", rank: 2 },
  { name: "mountains", rank: 2 },
  { name: "red-robe", rank: 2 },
];

const J = {
  neck: [300, 428], hip: [300, 684],
  shL: [226, 476], shR: [374, 476],
  pawL: [136, 570], pawR: [464, 566],
  kneeL: [252, 796], kneeR: [348, 796], ankleL: [246, 852], ankleR: [354, 852],
  ankh: { x: 104, top: 316, bottom: 650 },
  orb: [470, 516],
};
const COL = { sky: "#E8894F", mtn: "#E9B03C", mtnDark: "#C98A24", stone: "#E4E0F2", stoneDark: "#B2ABD8", stoneShade: "#8B84BA", robe: "#D8435A", robeDark: "#9E2A42", steel: "#B9C8E8", steelDark: "#8EA2CF" };

function setting(k) {
  const mtn = k.sym("mountains", 2, `
    <path d="M-80 800V520L-20 420L40 360L96 420L130 380L160 480V800Z" fill="${COL.mtn}"/><path d="M96 420L130 380L160 480V800H100Z" fill="${COL.mtnDark}" opacity=".6"/>
    <path d="M680 800V520L620 420L560 360L504 420L470 380L440 480V800Z" fill="${COL.mtn}"/><path d="M504 420L470 380L440 480V800H500Z" fill="${COL.mtnDark}" opacity=".6"/>`);
  return `${k.bg(COL.sky)}${mtn}`;
}

function ram(x, y, r, k) {
  const horn = (s) => `<path d="M${x + s * (r * 0.5)} ${y - r * 0.2}C${x + s * (r * 1.7)} ${y - r * 0.9} ${x + s * (r * 1.9)} ${y + r * 0.9} ${x + s * (r * 1.0)} ${y + r * 0.95}C${x + s * (r * 0.55)} ${y + r * 0.95} ${x + s * (r * 0.5)} ${y + r * 0.5} ${x + s * (r * 0.8)} ${y + r * 0.42}" stroke="${COL.stoneShade}" stroke-width="${r * 0.46}" stroke-linecap="round" fill="none"/>`;
  return `${horn(-1)}${horn(1)}<ellipse cx="${x}" cy="${y + r * 0.1}" rx="${r * 0.62}" ry="${r * 0.82}" fill="${COL.stone}"/><path d="M${x - r * 0.2} ${y + r * 0.7}V${y + r * 0.35}M${x + r * 0.2} ${y + r * 0.7}V${y + r * 0.35}" stroke="${COL.stoneShade}" stroke-width="${r * 0.2}" stroke-linecap="round"/>`;
}

function throne(k) {
  const back = `
    <rect x="150" y="124" width="300" height="470" rx="14" fill="${COL.stone}"/>
    <rect x="184" y="164" width="232" height="430" rx="8" fill="${COL.stoneDark}"/>
    <rect x="110" y="852" width="380" height="46" rx="10" fill="${COL.stoneDark}"/>`;
  const rams = k.sym("throne-rams", 1, `${ram(156, 134, 36, k)}${ram(444, 134, 36, k)}`);
  const arms = `<rect x="94" y="580" width="82" height="280" rx="12" fill="${COL.stone}"/><rect x="424" y="580" width="82" height="280" rx="12" fill="${COL.stone}"/>`;
  const armRams = k.sym("throne-rams", 1, `${ram(135, 596, 30, k)}${ram(465, 596, 30, k)}`);
  return { back, rams, arms, armRams };
}

function ankh(k) {
  const { x, top, bottom } = J.ankh;
  const shape = (c, d = 0) => `<rect x="${x - 13 - d}" y="${top + 62}" width="${26 + 2 * d}" height="${bottom - top - 62 + d}" rx="13" fill="${c}"/><rect x="${x - 50 - d}" y="${top + 68}" width="${100 + 2 * d}" height="${26 + 2 * d}" rx="13" fill="${c}"/><path fill-rule="evenodd" d="M${x} ${top - 14 - d}a${42 + d} ${48 + d} 0 1 1 -.01 0Z M${x} ${top + 10}a${20} ${25} 0 1 0 .01 0Z" fill="${c}"/>`;
  return k.sym("ankh-scepter", 1, `${shape(k.C.goldDeep, 6)}${shape(k.C.goldLight)}`);
}

function orb(k) {
  const [x, y] = J.orb;
  return k.sym("orb", 1, `<circle cx="${x}" cy="${y}" r="58" fill="${k.C.goldDeep}"/><circle cx="${x}" cy="${y}" r="48" fill="${k.C.goldLight}"/><circle cx="${x - 15}" cy="${y - 15}" r="11" fill="#FFFFFF" opacity=".95"/>`);
}

const boot = (x, y) => `<path d="M${x - 20} ${y - 30}H${x + 20}V${y + 4}C${x + 20} ${y + 28} ${x + 8} ${y + 52} ${x} ${y + 66}C${x - 8} ${y + 52} ${x - 20} ${y + 28} ${x - 20} ${y + 4}Z" fill="${COL.steel}"/><path d="M${x + 4} ${y - 30}H${x + 20}V${y + 4}C${x + 20} ${y + 28} ${x + 8} ${y + 52} ${x} ${y + 66}C${x + 4} ${y + 30} ${x + 4} ${y} ${x + 4} ${y - 30}Z" fill="${COL.steelDark}"/>`;

function robe(k) {
  return k.sym("red-robe", 2, `<path d="${smooth([[238, 650], [190, 730], [176, 800], [300, 826], [424, 800], [410, 730], [362, 650]])}" fill="${COL.robe}"/>
    <path d="${smooth([[300, 700], [262, 760], [258, 812], [300, 820], [346, 812], [340, 760]])}" fill="${COL.robeDark}" opacity=".55"/>`);
}

function cape(k) {
  return `<path d="${smooth([[232, 452], [372, 452], [404, 560], [410, 668], [190, 668], [196, 560]])}" fill="${COL.robe}"/>
    <path d="M232 456L388 668H410L396 560L372 456Z" fill="${COL.robeDark}" opacity=".55"/>`;
}

function crownOnHat() {
  // a gold crown ring around the hat cone, in the hat's own tilted frame
  const pts = [118, 134, 150, 166, 182].map((x, i) => `<path d="M${x - 8} ${86 - Math.abs(i - 2) * 1.5}L${x} ${62 - Math.abs(i - 2) * 1.5}L${x + 8} ${86 - Math.abs(i - 2) * 1.5}Z" fill="#E9C46F"/>`).join("");
  return `<g transform="rotate(-7 150 104)">${pts}<path d="M108 90Q150 102 194 90L196 74Q150 86 106 74Z" fill="#E9C46F"/><circle cx="150" cy="86" r="5" fill="#D8435A"/><circle cx="124" cy="82" r="4" fill="#D8435A"/><circle cx="176" cy="82" r="4" fill="#D8435A"/></g>`;
}

// ---------------------------------------------------------------- stage 2: the flat study (human)
export function stage2(k) {
  const t = throne(k);
  const hd = [J.neck[0], J.neck[1] - 56];
  const beard = `<path d="${smooth([[hd[0] - 34, hd[1] + 10], [hd[0] + 34, hd[1] + 10], [hd[0] + 26, hd[1] + 80], [hd[0], hd[1] + 118], [hd[0] - 26, hd[1] + 80]])}" fill="#F4F0FA"/>`;
  const body = `${setting(k)}${t.back}${t.rams}
    ${humanLimb(J.kneeL, J.ankleL, 20, 16, COL.steel)}${humanLimb(J.kneeR, J.ankleR, 20, 16, COL.steel)}${boot(J.ankleL[0], J.ankleL[1] + 14)}${boot(J.ankleR[0], J.ankleR[1] + 14)}
    ${robe(k)}
    ${k.sym("actor", 1, `${cape(k)}${beard}${humanHead({ at: hd, r: 38, hair: "#E7E1F2", face: true })}<path d="M${hd[0] - 38} ${hd[1] - 14}H${hd[0] + 38}V${hd[1] - 46}L${hd[0] + 22} ${hd[1] - 34}L${hd[0]} ${hd[1] - 52}L${hd[0] - 22} ${hd[1] - 34}L${hd[0] - 38} ${hd[1] - 46}Z" fill="${k.C.gold}"/>`)}
    ${t.arms}${t.armRams}
    ${humanLimb(J.shL, J.pawL, 18, 14, COL.steel)}${humanLimb(J.shR, J.pawR, 18, 14, COL.steel)}
    <circle cx="${J.pawL[0]}" cy="${J.pawL[1]}" r="16" fill="${HUMAN.skin}"/><circle cx="${J.pawR[0]}" cy="${J.pawR[1]}" r="16" fill="${HUMAN.skin}"/>
    ${ankh(k)}${orb(k)}`;
  return { title: "IV 황제 · 2단계 단순화 (The Emperor, simplified study)", desc: "1909 황제 카드의 구도를 평면 도형으로 단순화한 습작. 숫양 머리 돌 옥좌에 정면으로 앉은 인물, 왼손의 앙크 홀과 오른손의 구슬, 붉은 옷과 갑옷 다리, 뒤의 헐벗은 주황 산.", defs: "", body };
}

// ---------------------------------------------------------------- stage 3: the astrologer cat as emperor
export function stage3(k) {
  const t = throne(k);
  const legs = `${furLimb(J.kneeL, J.ankleL, 20, 16, { fill: COL.steel, shade: false })}${furLimb(J.kneeR, J.ankleR, 20, 16, { fill: COL.steel, shade: false })}${boot(J.ankleL[0], J.ankleL[1] + 14)}${boot(J.ankleR[0], J.ankleR[1] + 14)}`;
  const torso = catTorso({ neck: J.neck, hip: J.hip, wS: 138, wW: 124, wH: 132 });
  const beard = `<path d="${smooth([[262, 430], [338, 430], [330, 500], [300, 548], [270, 500]])}" fill="#FFFFFF"/><path d="${smooth([[300, 440], [326, 440], [320, 498], [300, 540]])}" fill="#E7E1F2" opacity=".7"/>`;
  const arms = `${furLimb(J.shL, J.pawL, 20, 15, { fill: "url(#sl-cat-fur)" })}${furLimb(J.shR, J.pawR, 20, 15, { fill: "url(#sl-cat-fur)" })}`;
  const paws = `${catPaw(J.pawL, 1.35)}${catPaw(J.pawR, 1.35)}`;
  const head = catHead({ neck: J.neck, s: 1, tilt: 0, expr: "idle", hatExtras: k.sym("crown", 2, crownOnHat()) });
  const body = `${setting(k)}${t.back}${t.rams}
    ${k.sym("actor", 1, legs)}
    ${k.sym("actor", 1, torso)}${robe(k)}
    ${k.sym("actor", 1, `${cape(k)}${beard}`)}
    ${t.arms}${t.armRams}
    ${k.sym("actor", 1, `${arms}${paws}`)}
    ${ankh(k)}${orb(k)}
    ${k.sym("actor", 1, head)}`;
  return { title: "IV 황제 · 3단계 캐릭터화 (The Emperor)", desc: "점성술사 고양이가 숫양 머리 돌 옥좌에 정면으로 앉아 왼손에 앙크 홀, 오른손에 구슬을 들었다. 모자에는 금관 띠, 가슴에는 하얀 수염 같은 털, 붉은 옷 아래 갑옷 다리와 뾰족한 장화.", defs: "", body };
}
