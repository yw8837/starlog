// 0 THE FOOL (바보) — v2, three stages (STYLE.md section 2):
//   stage 2: flat study of the 1909 composition (human figure, dog, the key objects, enlarged)
//   stage 3: the cat steps off the edge, the rabbit is the dog; same joints, same symbols
// Composition kept from the scan: figure at centre leaning toward the edge, head up toward the sun (top right),
// staff over the shoulder with a bundle, white rose in the outstretched hand, dog at the feet, cliff, snow peaks.
import { smooth, torsoPath, furLimb, catHead, catTorso, catCape, catPaw, catTail, boot, rabbitHead, rabbitTorso, rabbitPaw, rabbitFoot, humanLimb, humanHead, HUMAN } from "../tools/lib/actors.mjs";

export const symbols = [
  { name: "actor", rank: 1 },
  { name: "sun", rank: 1 },
  { name: "cliff-edge", rank: 1 },
  { name: "lifted-foot", rank: 1 },
  { name: "bundle-staff", rank: 1 },
  { name: "companion", rank: 2 },
  { name: "white-rose", rank: 2 },
  { name: "peaks", rank: 3 },
];

// ---- shared layout (card coordinates). Stage 2 and stage 3 read the same joints.
const J = {
  neck: [292, 404], tilt: 10,
  hip: [284, 592],
  shL: [232, 444], shR: [352, 444],
  pawL: [172, 566], // staff hand (viewer's left)
  pawR: [480, 428], // rose hand
  hipL: [250, 592], hipR: [318, 592],
  kneeR: [376, 656], ankleR: [412, 712], // lifted leg
  ankleL: [232, 756], // planted leg
  ground: 790,
  lip: 398,
  staffA: [150, 598], staffB: [452, 272],
  rose: [492, 372],
  sun: [466, 206],
};
const COL = { sky: "#F0C552", sun: "#FFF8E1", amber: "#D9801C", peak: "#A28FE4", peakShade: "#8774D8", mist: "#E6DDFA", far: "#C9BBF3", rock: "#2E2A78", rockTop: "#7A72D0", rockLit: "#5A53C0", rockMid: "#46409E", rockSide: "#1C1850", mist2: "#D9CEF8", grass: "#43AA90", staff: "#5E3A2E" };

function sky(k) {
  const { bg } = k;
  return `${bg(COL.sky)}`;
}

function sun(k) {
  const [x, y] = J.sun;
  const rays = Array.from({ length: 14 }, (_, i) => {
    const long = i % 2 === 0;
    return `<path transform="rotate(${i * (360 / 14)})" d="M${74} -11L${long ? 138 : 112} 0L74 11Z" fill="${COL.amber}"/>`;
  }).join("");
  return k.sym("sun", 1, `<g transform="translate(${x} ${y})">${rays}<circle r="60" fill="${COL.amber}"/><circle r="50" fill="${COL.sun}"/><path d="M-32 -14A36 36 0 0 1 -6 -36" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".9"/></g>`);
}

function peaks(k) {
  const peak = (ax, ay, lx, rx, by, snow) => {
    const body = `M${lx} ${by}L${ax} ${ay}L${rx} ${by}Z`;
    const shade = `M${ax} ${ay}L${rx} ${by}H${ax + (rx - ax) * 0.18}Z`;
    const sy = ay + snow;
    const lw = (sy - ay) / (by - ay);
    const capL = ax - (ax - lx) * lw;
    const capR = ax + (rx - ax) * lw;
    const cap = `M${ax} ${ay}L${capR} ${sy}L${r(ax + (capR - ax) * 0.55)} ${sy - 14}L${r(ax + 4)} ${sy + 10}L${r(ax - (ax - capL) * 0.45)} ${sy - 12}L${capL} ${sy}Z`;
    return `<path d="${body}" fill="${COL.peak}"/><path d="${shade}" fill="${COL.peakShade}"/><path d="${cap}" fill="#FFFFFF"/>`;
  };
  const r = (n) => Math.round(n);
  return k.sym("peaks", 3, `${peak(476, 600, 330, 640, 800, 78)}${peak(150, 662, 20, 290, 800, 56)}`);
}

function voidAndCliff(k) {
  const lip = J.lip;
  const poly = (pts) => "M" + pts.map((p) => p.join(" ")).join("L") + "Z";
  // the drop: pale mist, a deeper band and far peaks, all flat
  const mist = `<path d="M${lip - 40} 770H680V1200H${lip - 40}Z" fill="${COL.mist}"/>
    <path d="M${lip + 10} 912H680V1200H${lip + 10}Z" fill="${COL.mist2}"/>
    <path d="M${lip + 40} 850L${lip + 100} 800L${lip + 160} 850ZM${lip + 126} 880L${lip + 196} 816L${lip + 266} 880Z" fill="${COL.far}"/>`;
  // a craggy wall: broken top lip that overhangs a notch, ledges and lit facets, no straight sides
  const wall = [[-80, 792], [150, 790], [260, 784], [330, 782], [366, 770], [412, 784], [446, 812], [404, 834], [430, 868], [384, 900], [444, 936], [396, 972], [428, 1016], [380, 1070], [404, 1200], [-80, 1200]];
  const facets = [
    [[[366, 770], [412, 784], [446, 812], [404, 834], [356, 812], [344, 786]], COL.rockTop],
    [[[404, 834], [430, 868], [384, 900], [340, 880], [350, 846]], COL.rockSide],
    [[[384, 900], [444, 936], [396, 972], [338, 952], [348, 914]], COL.rockLit],
    [[[396, 972], [428, 1016], [380, 1070], [334, 1036], [344, 992]], COL.rockMid],
  ].map(([f, c]) => `<path d="${poly(f)}" fill="${c}"/>`).join("");
  const top = `<path d="${poly([[-80, 792], [150, 790], [260, 784], [330, 782], [366, 770], [412, 784], [446, 812], [420, 810], [372, 794], [330, 800], [260, 800], [150, 806], [-80, 810]])}" fill="${COL.rockTop}"/>`;
  const tufts = [[96, 792], [300, 788], [360, 776]].map(([x, y]) => `<path d="M${x - 12} ${y}L${x - 5} ${y - 24}L${x} ${y}L${x + 7} ${y - 30}L${x + 13} ${y}Z" fill="${COL.grass}"/>`).join("");
  const cracks = `<path d="M316 806L332 852L310 890L326 934" stroke="${COL.rockSide}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M196 814L210 866L188 908M84 828L100 874L82 918" stroke="${COL.rockSide}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".8"/>
    <path d="M20 880L120 872L210 884M120 940L230 930L320 944" stroke="${COL.rockSide}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".6"/>`;
  // loose rocks tumble off the lip: the edge, read at a glance
  const stones = [[484, 862, 17], [506, 922, 12], [478, 978, 9]]
    .map(([x, y, r], i) => {
      const pts = [[-r, -r * 0.4], [-r * 0.3, -r], [r * 0.9, -r * 0.6], [r, r * 0.5], [-r * 0.2, r]].map(([a, b]) => [Math.round(x + a), Math.round(y + b)]);
      return `<path d="M${x + 1} ${y - r * 3.4}V${y - r * 1.5}" stroke="${COL.far}" stroke-width="5" stroke-linecap="round"/><path d="${poly(pts)}" fill="${i % 2 ? COL.rockMid : COL.rock}"/>`;
    })
    .join("");
  return mist + k.sym("cliff-edge", 1, `<path d="${poly(wall)}" fill="${COL.rock}"/>${facets}${top}${cracks}${tufts}${stones}`);
}

function staffAndBundle(k) {
  const [ax, ay] = J.staffA;
  const [bx, by] = J.staffB;
  const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  const L = Math.hypot(bx - ax, by - ay);
  const staff = `<g transform="translate(${ax} ${ay}) rotate(${ang.toFixed(2)})"><rect x="0" y="-8" width="${L.toFixed(1)}" height="16" rx="8" fill="${COL.staff}"/><rect x="${(L - 20).toFixed(1)}" y="-10" width="12" height="20" rx="5" fill="${k.C.gold}"/></g>`;
  const pouch = `<g transform="translate(${bx + 6} ${by + 12})">
      <path d="M0 -6C-4 10 -6 22 -5 34" stroke="${k.C.gold}" stroke-width="4" stroke-linecap="round" fill="none"/>
      <g transform="translate(-5 34)">
        <path d="M-14 4C-44 14 -44 62 0 64C44 62 44 14 14 4Z" fill="${k.C.coral}"/>
        <path d="M-16 6Q-8 -8 0 -2Q8 -8 16 6Q8 1 0 4Q-8 1 -16 6Z" fill="#E8566D"/>
        <circle cx="0" cy="36" r="13" fill="none" stroke="${k.C.gold}" stroke-width="4"/>
        <path d="${k.sparklePath(0, 36, 8)}" fill="${k.C.gold}"/>
      </g>
    </g>`;
  return { staff: k.sym("bundle-staff", 1, staff), pouch: k.sym("bundle-staff", 1, pouch) };
}

function roseSymbol(k) {
  const [x, y] = J.rose;
  return k.sym("white-rose", 2, `
    <path d="M${x - 2} ${y + 24}C${x - 6} ${y + 52} ${x - 14} ${y + 60} ${x - 14} ${y + 64}" stroke="${k.C.green}" stroke-width="6" stroke-linecap="round" fill="none"/>
    ${k.leaf(x - 8, y + 46, 34, -35, { wide: 0.38 })}${k.leaf(x - 6, y + 38, 28, 28, { wide: 0.38 })}
    ${k.whiteRose(x, y, 36, 10)}`);
}

// ---------------------------------------------------------------- stage 2: the flat study (human + dog)
function humanFool(k) {
  const tunic = "#2B3A55";
  const legCol = "#EADFC2";
  const hd = [J.neck[0] + 8, J.neck[1] - 52];
  const legs = `
    ${humanLimb(J.hipL, J.ankleL, 20, 14, legCol)}${boot({ at: J.ankleL, rot: 0, flip: true })}
    ${k.sym("lifted-foot", 1, `${humanLimb(J.hipR, J.kneeR, 20, 17, legCol)}${humanLimb(J.kneeR, J.ankleR, 17, 13, legCol)}${boot({ at: J.ankleR, rot: 26 })}`)}`;
  const body = `<path d="${smooth([[238, 424], [290, 414], [346, 424], [364, 520], [380, 588], [286, 604], [212, 590], [226, 520]])}" fill="${tunic}"/>
    ${[[262, 478], [318, 470], [294, 530], [338, 556]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#E8833A"/>`).join("")}`;
  const arms = `${humanLimb(J.shL, J.pawL, 16, 12, tunic)}<circle cx="${J.pawL[0]}" cy="${J.pawL[1]}" r="13" fill="${HUMAN.skin}"/>
    ${humanLimb(J.shR, J.pawR, 16, 12, tunic)}<circle cx="${J.pawR[0]}" cy="${J.pawR[1]}" r="13" fill="${HUMAN.skin}"/>`;
  const head = humanHead({ at: hd, r: 34, tilt: J.tilt, cap: `<path d="M${hd[0] - 34} ${hd[1] - 8}C${hd[0] - 30} ${hd[1] - 52} ${hd[0] + 30} ${hd[1] - 52} ${hd[0] + 34} ${hd[1] - 8}Z" fill="#3E7B66"/><path d="M${hd[0] + 8} ${hd[1] - 40}C${hd[0] + 26} ${hd[1] - 70} ${hd[0] + 52} ${hd[1] - 64} ${hd[0] + 60} ${hd[1] - 60}C${hd[0] + 44} ${hd[1] - 54} ${hd[0] + 30} ${hd[1] - 40} ${hd[0] + 14} ${hd[1] - 32}Z" fill="${k.C.coral}"/>` });
  const dog = k.sym("companion", 2, `
    <ellipse cx="132" cy="758" rx="52" ry="28" fill="#FFFFFF" transform="rotate(-18 132 758)"/>
    <circle cx="176" cy="722" r="26" fill="#FFFFFF"/><path d="M164 704L156 676L182 696Z" fill="#E7E1F2"/>
    <path d="M94 750C70 744 64 724 74 712C82 726 94 730 104 734Z" fill="#FFFFFF"/>
    <path d="M150 772L146 790M112 774L108 790" stroke="#FFFFFF" stroke-width="13" stroke-linecap="round"/>
    <path d="M190 738L214 700" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round"/>
    <circle cx="184" cy="718" r="3.2" fill="${k.C.night2}"/>`);
  return { legs, body, arms, head, dog };
}

export function stage2(k) {
  const { staff, pouch } = staffAndBundle(k);
  const hf = humanFool(k);
  const body = `${sky(k)}${sun(k)}${peaks(k)}${voidAndCliff(k)}
    ${hf.legs}${hf.body}${staff}${hf.arms}${hf.head}${pouch}${roseSymbol(k)}${hf.dog}`;
  return { title: "0 바보 · 2단계 단순화 (The Fool, simplified study)", desc: "1909 바보 카드의 구도를 평면 도형으로 단순화한 습작. 절벽 끝으로 내딛는 인물, 어깨 위 막대와 보따리, 흰 장미, 발치의 개, 해, 설산.", defs: "", body };
}

// ---------------------------------------------------------------- stage 3: the cat and the rabbit act it
export function stage3(k) {
  const { staff, pouch } = staffAndBundle(k);
  const { part } = k;
  // cat: boots, long legs, short cape over a cream torso, the head tilted up toward the sun
  const legL = `${furLimb(J.hipL, J.ankleL, 22, 16)}${boot({ at: J.ankleL, flip: true, s: 1.1 })}`;
  const legR = k.sym("lifted-foot", 1, `${furLimb(J.hipR, J.kneeR, 22, 19)}${furLimb(J.kneeR, J.ankleR, 19, 15)}${boot({ at: J.ankleR, rot: 26, s: 1.1 })}`);
  const torso = catTorso({ neck: J.neck, hip: J.hip, wS: 132, wW: 122, wH: 130 });
  const cape = catCape({ neck: J.neck, s: 1.22 });
  const flow = `<path d="${smooth([[226, 436], [186, 480], [118, 530], [78, 604], [138, 590], [206, 640], [268, 596], [276, 480]])}" fill="url(#sl-cape)"/>
    <path d="${k.starPath(148, 566, 10)}" fill="url(#sl-gold)"/><path d="${k.starPath(204, 520, 8)}" fill="url(#sl-gold)"/><path d="${k.starPath(120, 600, 6)}" fill="url(#sl-gold)"/>`;
  const armL = k.sym("actor", 1, `${furLimb(J.shL, J.pawL, 18, 14)}${catPaw(J.pawL, 1.15)}`);
  const armR = k.sym("actor", 1, `${furLimb(J.shR, J.pawR, 18, 14)}${catPaw(J.pawR, 1.15, -8)}`);
  const feather = `<g transform="rotate(-7 150 104)">
      <path d="M108 96C100 70 78 50 48 44C56 66 74 88 108 96Z" fill="${k.C.coral}"/>
      <path d="M108 96C92 76 74 60 48 44" stroke="${k.C.goldLight}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      <circle cx="107" cy="96" r="4" fill="url(#sl-gold)"/></g>`;
  const head = k.sym("actor", 1, catHead({ neck: J.neck, s: 1, tilt: J.tilt, expr: "wink", hatExtras: feather }));
  const tail = catTail({ at: [338, 620], s: 1.05, rot: -22 });
  const cat = k.sym("actor", 1, `${tail}${flow}${legL}${legR}${torso}${cape}`);

  // rabbit: the little dog. Hops at the cat's heel, front paw up toward the boot
  const RS = 0.8;
  const rn = [140, 690];
  const rh = [128, 758];
  const rabbit = k.sym("companion", 2, `
    ${rabbitFoot({ at: [98, 782], rot: -6, s: 0.8 })}${rabbitFoot({ at: [160, 784], rot: 4, s: 0.8, flip: true })}
    ${furLimb([104, 740], [98, 780], 11, 10, { fill: "url(#sl-rabbit-fur)" })}${furLimb([150, 742], [158, 782], 11, 10, { fill: "url(#sl-rabbit-fur)" })}
    ${rabbitTorso({ neck: rn, hip: rh, s: RS, wS: 84, wW: 78, wH: 84 })}
    ${furLimb([102, 706], [74, 740], 10, 9, { fill: "url(#sl-cardigan)" })}${rabbitPaw([72, 742], 0.8)}
    ${furLimb([170, 704], [210, 664], 10, 9, { fill: "url(#sl-cardigan)" })}${rabbitPaw([213, 660], 0.8)}
    ${rabbitHead({ neck: rn, s: RS, tilt: 14, expr: "happy" })}`);

  const body = `${sky(k)}${sun(k)}${peaks(k)}${voidAndCliff(k)}
    ${cat}${staff}${armL}${head}${armR}${pouch}${roseSymbol(k)}${rabbit}`;
  return { title: "0 바보 · 3단계 캐릭터화 (The Fool)", desc: "점성술사 고양이가 장화를 신고 절벽 끝으로 한 발 내딛는다. 고개를 들어 해를 보고, 어깨 위 막대 끝에 복주머니 보따리, 손에 흰 장미. 사서 토끼가 강아지처럼 발치에서 뛰어오른다.", defs: "", body };
}
