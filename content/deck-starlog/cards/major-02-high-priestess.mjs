// II THE HIGH PRIESTESS (여사제) — three stages. Composition kept from the 1909 scan: the figure seated dead centre and
// frontal between a black pillar (left) and a white pillar (right), a dark veil of pomegranates behind, the horned moon
// crown, a blue cloak over a white gown, the scroll on the lap, the crescent at the feet (right of centre).
import { smooth, furLimb, rabbitHead, rabbitTorso, rabbitPaw, humanLimb, humanHead, HUMAN } from "../tools/lib/actors.mjs";
import { pillar } from "../tools/lib/props.mjs";

export const symbols = [
  { name: "actor", rank: 1 },
  { name: "pillars", rank: 1 },
  { name: "crescent-feet", rank: 1 },
  { name: "scroll", rank: 1 },
  { name: "moon-crown", rank: 2 },
  { name: "pomegranate-veil", rank: 2 },
];

const J = {
  neck: [300, 452], hip: [300, 648],
  shL: [238, 492], shR: [362, 492],
  pawL: [262, 604], pawR: [346, 604],
  crown: [300, 340],
  scroll: { at: [296, 596], rot: -6, w: 196 },
  crescent: { at: [352, 790], R: 92 },
  pillarL: 62, pillarR: 538,
};
const COL = { wall: "#9FC0F5", veil: "#2E2A78", black: "#0D0A26", white: "#F1ECFF", cloak: "#6F9BE8", cloakDark: "#4F78D0", gown: "#F1ECFF", cube: "#CDBDF5", floor: "#3B3594" };

function setting(k) {
  const { C } = k;
  const pomegranate = (x, y, r) => `<g transform="translate(${x} ${y})"><circle r="${r}" fill="${C.coral}"/><circle r="${r * 0.62}" fill="${C.coralDeep}" opacity=".55"/><path d="M-${r * 0.42} -${r * 0.9}L-${r * 0.2} -${r * 1.28}L0 -${r * 0.95}L${r * 0.2} -${r * 1.28}L${r * 0.42} -${r * 0.9}Z" fill="${C.gold}"/></g>`;
  const veil = k.sym("pomegranate-veil", 2, `
    <path d="M126 860V190C126 130 190 96 300 96C410 96 474 130 474 190V860Z" fill="${COL.veil}"/>
    ${[[300, 190, 40], [174, 292, 34], [426, 292, 34], [164, 430, 30], [436, 430, 30]].map(([x, y, r]) => pomegranate(x, y, r)).join("")}
    ${[[236, 232, 160], [364, 232, 20], [150, 360, 160], [450, 360, 20]].map(([x, y, a]) => k.leaf(x, y, 46, a, { wide: 0.36 })).join("")}`);
  const pillars = k.sym("pillars", 1, `
    ${pillar({ x: J.pillarL, fill: COL.black, light: "#2E2A78", dark: "#1C1850" })}
    ${pillar({ x: J.pillarR, fill: COL.white, light: "#CDBDF5", dark: "#AA94E6" })}`);
  return `${k.bg(COL.wall)}${veil}${pillars}<path d="M-80 836H680V1200H-80Z" fill="${COL.floor}"/>`;
}

function crescent(k) {
  const { at: [x, y], R } = J.crescent;
  return k.sym("crescent-feet", 1, `<path d="M${x - R} ${y}A${R} ${R} 0 0 0 ${x + R} ${y}A${R * 1.3} ${R * 1.3} 0 0 1 ${x - R} ${y}Z" fill="${k.C.gold}"/>`);
}

function scroll(k) {
  const { at: [x, y], rot, w } = J.scroll;
  return k.sym("scroll", 1, `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="${-w / 2}" y="-26" width="${w}" height="52" rx="26" fill="#FFFFFF"/>
    <rect x="${-w / 2 - 6}" y="-30" width="30" height="60" rx="15" fill="${k.C.gold}"/><rect x="${w / 2 - 24}" y="-30" width="30" height="60" rx="15" fill="${k.C.gold}"/>
    <path d="${k.starPath(0, 0, 16)}" fill="${k.C.gold}"/></g>`);
}

function moonCrown(k) {
  const [x, y] = J.crown;
  const bowl = `M${x - 64} ${y - 30}C${x - 64} ${y + 22} ${x - 26} ${y + 40} ${x} ${y + 40}C${x + 26} ${y + 40} ${x + 64} ${y + 22} ${x + 64} ${y - 30}C${x + 46} ${y - 6} ${x + 24} ${y + 8} ${x} ${y + 8}C${x - 24} ${y + 8} ${x - 46} ${y - 6} ${x - 64} ${y - 30}Z`;
  return k.sym("moon-crown", 2, `<path d="${bowl}" fill="${k.C.gold}"/><circle cx="${x}" cy="${y - 10}" r="25" fill="#FFFFFF"/><circle cx="${x - 7}" cy="${y - 17}" r="7" fill="#E4E0F5"/>`);
}

const cloakPanels = (side) => {
  const s = side === "L" ? 1 : -1;
  const X = (x) => 300 + s * (300 - x) * -1; // mirror helper: x given for the left side
  const pts = [[234, 458], [186, 530], [150, 690], [118, 846], [214, 868], [246, 770], [254, 620], [258, 492]];
  return smooth(pts.map(([x, y]) => [side === "L" ? x : 600 - x, y]));
};

const gownPath = smooth([[236, 640], [214, 742], [176, 842], [300, 872], [424, 842], [386, 742], [364, 640]]);
const cube = `<rect x="204" y="696" width="192" height="168" rx="18" fill="${COL.cube}"/>`;

// ---------------------------------------------------------------- stage 2: the flat study (human)
export function stage2(k) {
  const hd = [J.neck[0], J.neck[1] - 56];
  const hood = `<path d="M222 480C206 410 232 348 300 344C368 348 394 410 378 480Z" fill="${COL.cloak}"/>`;
  const body = `${setting(k)}${cube}<path d="${gownPath}" fill="${COL.gown}"/>
    ${k.sym("actor", 1, `<path d="${cloakPanels("L")}" fill="${COL.cloak}"/><path d="${cloakPanels("R")}" fill="${COL.cloak}"/>${hood}
      <path d="${smooth([[262, 470], [338, 470], [350, 560], [340, 650], [260, 650], [250, 560]])}" fill="${COL.gown}"/>
      <rect x="292" y="496" width="16" height="52" rx="8" fill="#9FC0F5"/><rect x="274" y="510" width="52" height="16" rx="8" fill="#9FC0F5"/>
      ${humanLimb(J.shL, J.pawL, 16, 12, COL.cloak)}${humanLimb(J.shR, J.pawR, 16, 12, COL.cloak)}
      ${humanHead({ at: hd, r: 38, hair: "#4B3A33", face: true })}`)}
    ${scroll(k)}
    <circle cx="${J.pawL[0]}" cy="${J.pawL[1]}" r="14" fill="${HUMAN.skin}"/><circle cx="${J.pawR[0]}" cy="${J.pawR[1]}" r="14" fill="${HUMAN.skin}"/>
    ${moonCrown(k)}${crescent(k)}`;
  return { title: "II 여사제 · 2단계 단순화 (The High Priestess, simplified study)", desc: "1909 여사제 카드의 구도를 평면 도형으로 단순화한 습작. 검은 기둥과 흰 기둥 사이 정면으로 앉은 인물, 석류 휘장, 뿔 달린 달 관, 무릎 위 두루마리, 발치의 초승달.", defs: "", body };
}

// ---------------------------------------------------------------- stage 3: the rabbit librarian
export function stage3(k) {
  const torso = rabbitTorso({ neck: J.neck, hip: J.hip, wS: 118, wW: 104, wH: 112 });
  const head = rabbitHead({ neck: J.neck, s: 1, tilt: 0, expr: "idle" });
  const cross = `<rect x="292" y="496" width="16" height="52" rx="8" fill="#FFFFFF"/><rect x="274" y="510" width="52" height="16" rx="8" fill="#FFFFFF"/>`;
  const arms = `${furLimb(J.shL, J.pawL, 18, 14, { fill: "url(#sl-cardigan)" })}${furLimb(J.shR, J.pawR, 18, 14, { fill: "url(#sl-cardigan)" })}`;
  const paws = `${rabbitPaw(J.pawL, 1.2)}${rabbitPaw(J.pawR, 1.2)}`;
  const body = `${setting(k)}${cube}<path d="${gownPath}" fill="${COL.gown}"/>
    ${k.sym("actor", 1, `${torso}${cross}<path d="${cloakPanels("L")}" fill="${COL.cloak}"/><path d="${cloakPanels("R")}" fill="${COL.cloak}"/>${arms}${head}`)}
    ${scroll(k)}${k.sym("actor", 1, paws)}
    ${moonCrown(k)}${crescent(k)}`;
  return { title: "II 여사제 · 3단계 캐릭터화 (The High Priestess)", desc: "사서 토끼가 검은 기둥과 흰 기둥 사이에 정면으로 앉아 무릎 위 두루마리에 손을 얹었다. 머리에는 달 관, 뒤에는 석류 휘장, 발치에는 금빛 초승달.", defs: "", body };
}
