// V THE HIEROPHANT (교황) — three stages. Composition kept from the 1909 scan: frontal and symmetric between two big grey
// pillars, the triple crown with two lappets, a red robe with a white stole, the right hand raised in blessing (viewer's left),
// the triple-cross staff in the left hand (viewer's right), two small figures kneeling in the bottom corners, crossed keys
// at the bottom centre.
import { smooth, furLimb, catHead, catTorso, catPaw, humanLimb, humanHead, HUMAN } from "../tools/lib/actors.mjs";
import { pillar, cross, recolor, VARIANT_DEFS } from "../tools/lib/props.mjs";

export const symbols = [
  { name: "actor", rank: 1 },
  { name: "triple-crown", rank: 1 },
  { name: "blessing-hand", rank: 1 },
  { name: "triple-cross", rank: 1 },
  { name: "crossed-keys", rank: 1 },
  { name: "acolytes", rank: 2 },
  { name: "pillars", rank: 2 },
];

const J = {
  neck: [300, 434], hip: [300, 690],
  shL: [226, 482], shR: [374, 482],
  elbowL: [166, 450], pawL: [150, 376], // raised blessing hand
  pawR: [452, 570], staffX: 452, staffTop: 214, staffBottom: 808,
  keys: [300, 838],
  acolyteL: [118, 884], acolyteR: [482, 884],
};
const COL = { wall: "#6A63AC", pillar: "#8F88C8", pillarLight: "#B4AEE0", pillarDark: "#5C559C", back: "#8780C2", robe: "#D8435A", robeDark: "#9E2A42", stole: "#FFFFFF", mat: "#9E2A42" };

function setting(k) {
  const pillars = k.sym("pillars", 2, `${pillar({ x: 66, w: 150, fill: COL.pillar, light: COL.pillarLight, dark: COL.pillarDark })}${pillar({ x: 534, w: 150, fill: COL.pillar, light: COL.pillarLight, dark: COL.pillarDark })}`);
  return `${k.bg(COL.wall)}<path d="M178 600V230C178 170 226 140 300 140C374 140 422 170 422 230V600Z" fill="${COL.back}"/>${pillars}`;
}

const robePath = smooth([[222, 470], [158, 640], [126, 830], [300, 862], [474, 830], [442, 640], [378, 470], [300, 448]]);
const robeFold = smooth([[300, 520], [256, 700], [250, 846], [300, 856], [352, 846], [346, 700]]);

function stole(k) {
  return `<rect x="282" y="446" width="36" height="352" rx="18" fill="${COL.stole}"/><path d="M226 470L282 520V470Z M374 470L318 520V470Z" fill="${COL.stole}"/>
    ${[540, 640, 740].map((y) => `<rect x="296" y="${y - 22}" width="8" height="30" rx="4" fill="${k.C.coral}"/><rect x="288" y="${y - 12}" width="24" height="8" rx="4" fill="${k.C.coral}"/>`).join("")}`;
}

function staff(k) {
  const { staffX: x, staffTop: top, staffBottom: bottom } = J;
  return k.sym("triple-cross", 1, cross({ x, y: top, h: bottom - top, w: 18, bars: 3, bar: 100, fill: k.C.gold }));
}

function keys(k) {
  const [x, y] = J.keys;
  const key = (rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><circle cx="-48" cy="0" r="27" fill="none" stroke="${k.C.gold}" stroke-width="15"/><rect x="-24" y="-8" width="112" height="16" rx="8" fill="${k.C.gold}"/><rect x="56" y="4" width="15" height="30" rx="5" fill="${k.C.gold}"/><rect x="34" y="4" width="15" height="22" rx="5" fill="${k.C.gold}"/></g>`;
  return `<rect x="186" y="800" width="228" height="86" rx="24" fill="${COL.mat}"/>${k.sym("crossed-keys", 1, `${key(28)}${key(152)}`)}`;
}

// acolytes: small kneeling figures, drawn only from the robe up (the card edge crops the rest)
function acolyte(k, { at: [x, y], robe, motif, fur, flip, human }) {
  const body = `<path d="${smooth([[x - 60, y + 6], [x - 50, y - 72], [x, y - 92], [x + 50, y - 72], [x + 60, y + 6]])}" fill="${robe}"/>`;
  const yoke = `<path d="M${x - 44} ${y - 74}L${x} ${y - 28}L${x + 44} ${y - 74}" stroke="${k.C.gold}" stroke-width="18" stroke-linejoin="round" stroke-linecap="round" fill="none"/><rect x="${x - 9}" y="${y - 30}" width="18" height="38" rx="6" fill="${k.C.gold}"/>`;
  const dots = motif === "rose" ? [[-30, -30], [30, -30], [-22, -60], [22, -60]].map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="9" fill="${k.C.coral}"/>`).join("") : [[-30, -30], [30, -30], [-22, -60], [22, -60]].map(([dx, dy]) => `<path d="${k.starPath(x + dx, y + dy, 10)}" fill="#FFFFFF"/>`).join("");
  const head = human
    ? `<circle cx="${x}" cy="${y - 112}" r="26" fill="${HUMAN.skin}"/><path d="M${x - 26} ${y - 112}C${x - 24} ${y - 142} ${x + 24} ${y - 142} ${x + 26} ${y - 112}C${x + 14} ${y - 124} ${x - 14} ${y - 124} ${x - 26} ${y - 112}Z" fill="#6B4E3D"/><circle cx="${x}" cy="${y - 124}" r="14" fill="${HUMAN.skin}"/>`
    : recolor(catHead({ neck: [x, y - 88], s: 0.52, tilt: flip ? 8 : -8, expr: "idle", hat: false }), { cat: fur });
  return `${body}${dots}${yoke}${head}`;
}

function acolytes(k, human = false) {
  return k.sym("acolytes", 2, `${acolyte(k, { at: J.acolyteL, robe: "#E7E1F2", motif: "rose", fur: "sk-cat-grey", human })}${acolyte(k, { at: J.acolyteR, robe: "#3B3594", motif: "star", fur: "sk-cat-dark", flip: true, human })}`);
}

// the triple crown on the cat's hat: three gold rings up the cone, in the hat's own tilted frame
function tiara(k) {
  const ring = (y, xl, xr) => `<path d="M${xl - 8} ${y}Q150 ${y + 10} ${xr + 8} ${y}L${xr + 5} ${y - 14}Q150 ${y - 4} ${xl - 5} ${y - 14}Z" fill="${k.C.gold}"/>`;
  return `<g transform="rotate(-7 150 104)">${ring(78, 112, 190)}${ring(56, 124, 180)}${ring(34, 134, 172)}</g>`;
}
const lappets = (k) => `<path d="M216 340L236 340L246 520L222 528Z" fill="${k.C.goldLight}"/><path d="M384 340L364 340L354 520L378 528Z" fill="${k.C.goldLight}"/>`;

function blessing(k, { human }) {
  const [px, py] = J.pawL;
  const fingers = human ? "" : "";
  const fing = (dx) => `<path d="${k.capsule([px + dx, py - 14], [px + dx - 4, py - 78], 12, 10)}" fill="${human ? HUMAN.skin : "url(#sl-cat-fur)"}"/>`;
  return k.sym("blessing-hand", 1, `${fing(-12)}${fing(14)}${human ? `<circle cx="${px}" cy="${py}" r="26" fill="${HUMAN.skin}"/>` : catPaw(J.pawL, 2.0)}`);
}

// ---------------------------------------------------------------- stage 2: the flat study (human)
export function stage2(k) {
  const hd = [J.neck[0], J.neck[1] - 56];
  const tiaraH = `<path d="${smooth([[hd[0] - 34, hd[1] - 22], [hd[0] - 28, hd[1] - 70], [hd[0], hd[1] - 100], [hd[0] + 28, hd[1] - 70], [hd[0] + 34, hd[1] - 22]])}" fill="${k.C.gold}"/><path d="M${hd[0] - 30} ${hd[1] - 46}H${hd[0] + 30}M${hd[0] - 24} ${hd[1] - 72}H${hd[0] + 24}" stroke="#B98A2E" stroke-width="7"/>`;
  const body = `${setting(k)}
    ${k.sym("actor", 1, `<path d="${robePath}" fill="${COL.robe}"/><path d="${robeFold}" fill="${COL.robeDark}" opacity=".5"/>${stole(k)}
      ${humanLimb(J.shL, J.pawL, 18, 14, COL.robe)}${humanLimb(J.shR, J.pawR, 18, 14, COL.robe)}
      <path d="M216 340L236 340L246 520L222 528Z" fill="${k.C.goldLight}"/><path d="M384 340L364 340L354 520L378 528Z" fill="${k.C.goldLight}"/>
      ${humanHead({ at: hd, r: 38, hair: "#E7E1F2", face: true })}`)}
    ${k.sym("triple-crown", 1, tiaraH)}
    ${blessing(k, { human: true })}
    <circle cx="${J.pawR[0]}" cy="${J.pawR[1]}" r="16" fill="${HUMAN.skin}"/>
    ${staff(k)}${keys(k)}${acolytes(k, true)}`;
  return { title: "V 교황 · 2단계 단순화 (The Hierophant, simplified study)", desc: "1909 교황 카드의 구도를 평면 도형으로 단순화한 습작. 두 회색 기둥 사이에 정면으로 앉은 인물, 삼중관, 한 손의 축복, 다른 손의 삼중 십자 지팡이, 아래 모서리의 두 신도, 가운데 교차한 열쇠.", defs: "", body };
}

// ---------------------------------------------------------------- stage 3: the astrologer cat as hierophant
export function stage3(k) {
  const torso = catTorso({ neck: J.neck, hip: J.hip, wS: 130, wW: 116, wH: 124 });
  const head = catHead({ neck: J.neck, s: 1, tilt: 0, expr: "idle", hatExtras: k.sym("triple-crown", 1, tiara(k)) });
  const arms = `${furLimb(J.shL, J.elbowL, 18, 14, { fill: COL.robe, shade: false })}${furLimb(J.elbowL, J.pawL, 14, 12, { fill: "url(#sl-cat-fur)" })}${furLimb(J.shR, J.pawR, 18, 14, { fill: COL.robe, shade: false })}`;
  const body = `${setting(k)}
    ${k.sym("actor", 1, `${torso}<path d="${robePath}" fill="${COL.robe}"/><path d="${robeFold}" fill="${COL.robeDark}" opacity=".5"/>${stole(k)}${arms}`)}
    ${k.sym("triple-crown", 1, lappets(k))}
    ${k.sym("actor", 1, head)}
    ${blessing(k, { human: false })}${k.sym("actor", 1, catPaw(J.pawR, 1.4))}
    ${staff(k)}${keys(k)}${acolytes(k)}`;
  return { title: "V 교황 · 3단계 캐릭터화 (The Hierophant)", desc: "점성술사 고양이가 두 회색 기둥 사이에 앉아 한 손은 두 손가락으로 축복하고 다른 손에 삼중 십자 지팡이를 쥐었다. 모자에는 금띠 세 겹, 아래 모서리에 회색·검정 새끼 고양이 둘이 무릎 꿇고, 가운데에 열쇠 두 개가 엇갈려 있다.", defs: VARIANT_DEFS, body };
}
