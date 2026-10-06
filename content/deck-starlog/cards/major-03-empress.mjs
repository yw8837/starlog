// III THE EMPRESS (여황제) — three stages. Composition kept from the 1909 scan: the figure seated a little right of centre,
// leaning back on a big orange cushion at the left, the star crown, the orb scepter raised in the left hand, the heart
// shield with the Venus sign at lower left, a wheat field in front, a dark forest and a falling stream at the right,
// a yellow sky.
import { smooth, furLimb, rabbitHead, rabbitTorso, rabbitPaw, humanLimb, humanHead, HUMAN } from "../tools/lib/actors.mjs";

export const symbols = [
  { name: "actor", rank: 1 },
  { name: "star-crown", rank: 1 },
  { name: "scepter-orb", rank: 1 },
  { name: "heart-shield", rank: 1 },
  { name: "wheat", rank: 1 },
  { name: "cushion", rank: 2 },
  { name: "forest-stream", rank: 2 },
];

const J = {
  neck: [338, 478], tilt: 6, hip: [326, 668],
  shL: [270, 516], shR: [402, 520],
  pawL: [200, 424], // raised hand holding the scepter
  pawR: [440, 632], // resting on the lap
  crown: [344, 350],
  scepter: { x: 200, top: 292, bottom: 590 },
  shield: [150, 744],
};
const COL = { sky: "#F2D170", hedge: "#1F5F70", forest: "#2E8A7E", forestDark: "#23687A", stream: "#9FC0F5", ground: "#43AA90", cushion: "#E0764A", cushionDark: "#C45C36", gown: "#F7F3FF", wheat: "#E8B33A", wheatDark: "#A9741E", heart: "#CDBDF5", venus: "#5B4FB8" };

function setting(k) {
  const tree = (x, y, w, h, c) => `<path d="M${x} ${y}L${x + w / 2} ${y + h}H${x - w / 2}Z" fill="${c}"/>`;
  const forest = k.sym("forest-stream", 2, `
    ${[[420, 250, 100, 470, COL.forestDark], [492, 300, 110, 420, COL.forest], [560, 232, 100, 490, COL.forestDark], [458, 420, 120, 300, COL.forest]].map(([x, y, w, h, c]) => tree(x, y, w, h, c)).join("")}
    <path d="M536 480C548 560 540 640 552 740" stroke="${COL.stream}" stroke-width="30" stroke-linecap="round" fill="none"/>`);
  const cushion = k.sym("cushion", 2, `
    <path d="M92 746V496C92 436 132 406 184 406H248C306 406 340 438 340 498V756Z" fill="${COL.cushion}"/>
    <path d="M122 728V500C122 464 146 438 184 438H248C284 438 310 464 310 500V728Z" fill="${COL.cushionDark}" opacity=".5"/>
    <path d="M122 540L216 634L310 540M122 634L216 728L310 634M122 446L216 540L310 446" stroke="${COL.cushion}" stroke-width="6" fill="none"/>
    ${[[216, 540], [122, 540], [310, 540], [216, 634], [122, 634], [310, 634]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${k.C.gold}"/>`).join("")}
    <rect x="62" y="672" width="168" height="66" rx="33" fill="${COL.cushion}"/><circle cx="96" cy="705" r="26" fill="${COL.cushionDark}"/><circle cx="96" cy="705" r="11" fill="${COL.cushion}"/>`);
  return `${k.bg(COL.sky)}${forest}<path d="M-80 716C120 700 300 708 680 700V1200H-80Z" fill="${COL.ground}"/><path d="M-80 780H680V920H-80Z" fill="${COL.hedge}"/>${cushion}`;
}

function heartShield(k) {
  const [x, y] = J.shield;
  return k.sym("heart-shield", 1, `<g transform="translate(${x} ${y}) scale(1.2)">
    <path d="M0 56C-96 -4 -56 -80 0 -36C56 -80 96 -4 0 56Z" fill="${COL.heart}"/>
    <circle cx="0" cy="-10" r="19" fill="none" stroke="${COL.venus}" stroke-width="8"/><path d="M0 9V42M-14 28H14" stroke="${COL.venus}" stroke-width="8" stroke-linecap="round"/></g>`);
}

function wheat(k) {
  const stalks = Array.from({ length: 24 }, (_, i) => {
    const x = -10 + i * 26;
    const y = 826 + (i % 3) * 8;
    return `<path d="M${x} 940L${x + 2} ${y + 26}" stroke="${COL.wheatDark}" stroke-width="6" stroke-linecap="round"/><ellipse cx="${x + 2}" cy="${y}" rx="11" ry="30" fill="${COL.wheat}" transform="rotate(${(i % 2 ? 8 : -8)} ${x + 2} ${y})"/>`;
  }).join("");
  return k.sym("wheat", 1, `<path d="M-80 850H680V1200H-80Z" fill="${COL.wheat}"/>${stalks}`);
}

function scepter(k) {
  const { x, top, bottom } = J.scepter;
  return k.sym("scepter-orb", 1, `<rect x="${x - 10}" y="${top + 40}" width="20" height="${bottom - top - 40}" rx="10" fill="${k.C.goldDeep}"/><circle cx="${x}" cy="${top}" r="42" fill="${k.C.goldDeep}"/><circle cx="${x}" cy="${top}" r="33" fill="${k.C.gold}"/><circle cx="${x - 11}" cy="${top - 11}" r="9" fill="#FFFFFF" opacity=".9"/>`);
}

function starCrown(k) {
  const [x, y] = J.crown;
  const stars = [[-76, 14, 22], [-40, -10, 26], [0, -26, 30], [40, -10, 26], [76, 14, 22]]
    .map(([dx, dy, r]) => `<path d="${k.starPath(x + dx, y + dy, r)}" fill="#FFFFFF"/><path d="${k.starPath(x + dx, y + dy, r * 0.5)}" fill="${k.C.gold}"/>`)
    .join("");
  return k.sym("star-crown", 1, `<path d="M${x - 92} ${y + 30}Q${x} ${y + 4} ${x + 92} ${y + 30}L${x + 86} ${y + 56}Q${x} ${y + 30} ${x - 86} ${y + 56}Z" fill="${COL.forest}"/>${stars}`);
}

const gown = smooth([[262, 640], [228, 740], [196, 842], [336, 876], [486, 840], [450, 732], [398, 640]]);
const dots = (k) => [[284, 760], [356, 740], [420, 790], [252, 820], [340, 830]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="15" fill="${k.C.coral}"/><path d="M${x - 5} ${y - 14}h10" stroke="${k.C.green}" stroke-width="5" stroke-linecap="round"/>`).join("");

// ---------------------------------------------------------------- stage 2: the flat study (human)
export function stage2(k) {
  const hd = [J.neck[0] + 6, J.neck[1] - 56];
  const hair = `<path d="${smooth([[hd[0] - 44, hd[1] - 20], [hd[0], hd[1] - 54], [hd[0] + 48, hd[1] - 20], [hd[0] + 60, hd[1] + 70], [hd[0] + 10, hd[1] + 96], [hd[0] - 56, hd[1] + 74]])}" fill="#F0D26B"/>`;
  const body = `${setting(k)}${heartShield(k)}
    <path d="${gown}" fill="${COL.gown}"/>${dots(k)}
    ${k.sym("actor", 1, `${hair}
      <path d="${smooth([[274, 480], [402, 480], [420, 580], [404, 664], [270, 664], [256, 580]])}" fill="${COL.gown}"/>
      ${humanLimb(J.shL, J.pawL, 16, 12, COL.gown)}${humanLimb(J.shR, J.pawR, 16, 12, COL.gown)}
      ${humanHead({ at: hd, r: 38, hair: "#F0D26B", face: true, tilt: J.tilt })}
      <circle cx="${J.pawL[0]}" cy="${J.pawL[1]}" r="14" fill="${HUMAN.skin}"/><circle cx="${J.pawR[0]}" cy="${J.pawR[1]}" r="14" fill="${HUMAN.skin}"/>`)}
    ${scepter(k)}${starCrown(k)}${wheat(k)}`;
  return { title: "III 여황제 · 2단계 단순화 (The Empress, simplified study)", desc: "1909 여황제 카드의 구도를 평면 도형으로 단순화한 습작. 주황 쿠션에 기대어 앉은 인물, 별 관, 구슬 달린 홀, 금성 기호 하트 방패, 앞의 밀밭, 오른쪽의 숲과 물줄기.", defs: "", body };
}

// ---------------------------------------------------------------- stage 3: the rabbit queen
export function stage3(k) {
  const torso = rabbitTorso({ neck: J.neck, hip: J.hip, wS: 124, wW: 112, wH: 120 });
  const head = rabbitHead({ neck: J.neck, s: 1, tilt: J.tilt, expr: "happy" });
  const arms = `${furLimb(J.shL, J.pawL, 18, 14, { fill: "url(#sl-cardigan)" })}${furLimb(J.shR, J.pawR, 18, 14, { fill: "url(#sl-cardigan)" })}`;
  const paws = `${rabbitPaw(J.pawL, 1.25)}${rabbitPaw(J.pawR, 1.25)}`;
  const body = `${setting(k)}${heartShield(k)}
    <path d="${gown}" fill="${COL.gown}"/>${dots(k)}
    ${k.sym("actor", 1, `${torso}${arms}${head}`)}
    ${scepter(k)}${k.sym("actor", 1, paws)}${starCrown(k)}${wheat(k)}`;
  return { title: "III 여황제 · 3단계 캐릭터화 (The Empress)", desc: "사서 토끼가 주황 쿠션에 기대어 앉아 구슬 달린 홀을 들었다. 머리에는 별 관, 앞에는 하트 방패와 밀밭, 뒤에는 숲과 물줄기.", defs: "", body };
}
