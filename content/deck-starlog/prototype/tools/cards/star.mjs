// XVII THE STAR (별): the librarian rabbit kneels at the pond and pours two jugs, one into the water and
// one onto the land (five streams); one big eight-pointed star and seven small ones; a bird in the tree;
// the astrologer cat watches the star from the far hill.
export default function star(k) {
  const { part, render, h, Parts: P, place, capsule, leaf, tuft, star8, sparklePath, starPath, rng, frame, svgDoc, r2 } = k;
  const rand = rng(41);

  const defs = `
  <linearGradient id="sk-s-sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0D0A26"/><stop offset=".16" stop-color="#18135C"/><stop offset=".34" stop-color="#2C2A8C"/>
    <stop offset=".5" stop-color="#4C63C8"/><stop offset=".62" stop-color="#8FB0EC"/><stop offset=".7" stop-color="#C6D9F8"/>
  </linearGradient>
  <radialGradient id="sk-s-halo" cx="300" cy="222" r="260" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FFF3C4" stop-opacity=".95"/><stop offset=".3" stop-color="#FFE29A" stop-opacity=".5"/>
    <stop offset="1" stop-color="#FFE29A" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="sk-s-bigstar" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFF6CC"/><stop offset=".5" stop-color="#FFE17A"/><stop offset="1" stop-color="#F2B73C"/>
  </linearGradient>
  <radialGradient id="sk-s-sglow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#E6E0FF" stop-opacity=".55"/><stop offset=".5" stop-color="#CFC6F6" stop-opacity=".2"/><stop offset="1" stop-color="#CFC6F6" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="sk-s-smallstar" cx="50%" cy="45%" r="60%">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#F2EEFF"/><stop offset="1" stop-color="#CFC6F2"/>
  </radialGradient>
  <linearGradient id="sk-s-water" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8EB4F2"/><stop offset=".35" stop-color="#4A6CCC"/><stop offset="1" stop-color="#1E2C84"/>
  </linearGradient>
  <linearGradient id="sk-s-fall" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#BFD8FF" stop-opacity=".95"/><stop offset=".5" stop-color="#FFFFFF"/><stop offset="1" stop-color="#9FC0F5" stop-opacity=".95"/>
  </linearGradient>
  <linearGradient id="sk-s-grass" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#6FD9A6"/><stop offset=".5" stop-color="#3AA58C"/><stop offset="1" stop-color="#1F6674"/>
  </linearGradient>
  <linearGradient id="sk-s-hill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#58C49A"/><stop offset="1" stop-color="#2A7F86"/>
  </linearGradient>
  <linearGradient id="sk-s-mtn" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#6256B8"/><stop offset="1" stop-color="#9C8DE0"/>
  </linearGradient>
  <radialGradient id="sk-s-jug" cx="36%" cy="30%" r="80%">
    <stop offset="0" stop-color="#FFD9A0"/><stop offset=".5" stop-color="#EE9A62"/><stop offset="1" stop-color="#B1523A"/>
  </radialGradient>
  <linearGradient id="sk-s-trunk" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#7A5A98"/><stop offset="1" stop-color="#4A3772"/>
  </linearGradient>
  <radialGradient id="sk-s-crown" cx="40%" cy="30%" r="75%">
    <stop offset="0" stop-color="#8FE3B4"/><stop offset=".6" stop-color="#3FA58F"/><stop offset="1" stop-color="#23687A"/>
  </radialGradient>
  `;

  // ---------------------------------------------------------------- sky and stars
  const smalls = [
    [84, 150, 36, 8], [128, 292, 32, 0], [74, 424, 30, 12], [520, 146, 36, -6], [508, 276, 33, 10], [452, 398, 30, 0], [208, 392, 27, 6],
  ];
  const dust = Array.from({ length: 30 }, () => {
    const x = 36 + rand() * 528;
    const y = 104 + rand() * 520;
    return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(1 + rand() * 1.4)}" fill="#FFF6D2" opacity="${r2(0.35 + rand() * 0.45)}"/>`;
  }).join("");
  const sky = `
  <rect width="600" height="1040" fill="url(#sk-s-sky)"/>
  ${dust}
  <circle cx="300" cy="222" r="260" fill="url(#sk-s-halo)"/>
  ${smalls.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r * 2.1}" fill="url(#sk-s-sglow)"/>`).join("")}
  ${smalls.map(([x, y, r, rot]) => `<path d="${star8(x, y, r, { rot })}" fill="url(#sk-s-smallstar)" stroke="#B9AEEA" stroke-width="1.8" stroke-linejoin="round"/>`).join("")}
  <path d="${star8(300, 222, 118, { rot: 0 })}" fill="url(#sk-s-bigstar)" stroke="#E0A63A" stroke-width="3" stroke-linejoin="round"/>
  <path d="${star8(300, 222, 62, { rot: 22.5, diag: 1, inner: 0.5 })}" fill="#FFF6CC" opacity=".7"/>
  <path d="M286 142L296 190" stroke="#fff" stroke-opacity=".75" stroke-width="5" stroke-linecap="round"/>
  `;

  // ---------------------------------------------------------------- land and water
  const land = `
  <path d="M-20 664C20 618 66 588 106 600C150 612 180 640 230 656Z" fill="url(#sk-s-mtn)"/>
  <path d="M-20 700C60 650 150 650 250 676C330 660 420 600 500 590C560 584 610 604 620 620V800H-20Z" fill="url(#sk-s-hill)"/>
  <path d="M-20 700C60 650 150 650 250 676" stroke="#C7F7DB" stroke-opacity=".5" stroke-width="3" fill="none"/>
  <path d="M500 590C560 584 610 604 620 620" stroke="#C7F7DB" stroke-opacity=".5" stroke-width="3" fill="none"/>
  <path d="M-20 744C120 728 250 740 340 770C420 740 520 720 620 730V1040H-20Z" fill="url(#sk-s-grass)"/>
  <path d="M-20 744C120 728 250 740 340 770C420 740 520 720 620 730" stroke="#D7FFE6" stroke-opacity=".5" stroke-width="3" fill="none"/>
  `;
  const POND = "M-20 792C60 770 170 770 250 786C310 796 346 820 340 858C334 900 292 930 232 944H-20Z";
  const pond = `
  <clipPath id="sk-s-pond-clip"><path d="${POND}"/></clipPath>
  <path d="${POND}" fill="url(#sk-s-water)"/>
  <g clip-path="url(#sk-s-pond-clip)">
    <path d="M-20 800C80 784 190 786 280 800" stroke="#fff" stroke-opacity=".55" stroke-width="4" stroke-linecap="round" fill="none"/>
    <ellipse cx="150" cy="890" rx="22" ry="40" fill="#FFE9B0" opacity=".18" filter="url(#sl-soft)"/>
    <path d="${sparklePath(150, 896, 26)}" fill="#FFF3C4" opacity=".55"/><path d="${sparklePath(60, 862, 9)}" fill="#fff" opacity=".6"/><path d="${sparklePath(236, 908, 10)}" fill="#fff" opacity=".6"/><path d="${sparklePath(98, 920, 7)}" fill="#fff" opacity=".5"/>
    <path d="M300 800C330 830 332 870 310 905" stroke="#BFD8FF" stroke-opacity=".5" stroke-width="5" stroke-linecap="round" fill="none" filter="url(#sl-blur)"/>
  </g>
  <path d="M250 786C310 796 346 820 340 858C334 900 292 930 232 944" stroke="#E9FFE9" stroke-opacity=".7" stroke-width="4.5" stroke-linecap="round" fill="none"/>
  <path d="M-20 792C60 770 170 770 250 786" stroke="#0F1B66" stroke-opacity=".5" stroke-width="3" fill="none"/>
  `;
  const ripple = (cx, cy, base = 22) =>
    [1, 1.9, 2.9, 4.1].map((m, i) => `<ellipse cx="${cx}" cy="${cy}" rx="${r2(base * m)}" ry="${r2(base * m * 0.3)}" fill="none" stroke="#EAF3FF" stroke-opacity="${r2(0.8 - i * 0.18)}" stroke-width="${r2(3.4 - i * 0.4)}"/>`).join("");

  // five streams from the jug that pours onto the land: they fork, wind down the bank and widen toward the viewer
  const streams = (ox, oy) => {
    const rel = (pts) => pts.map(([dx, dy]) => [ox + dx, oy + dy]);
    const defsS = [
      [[[0, 0], [-26, 20], [-56, 34], [-92, 60], [-120, 92], [-136, 128]], 6, 22],
      [[[0, 0], [4, 30], [-4, 60], [6, 92], [14, 128]], 6, 22],
      [[[0, 0], [26, 20], [58, 30], [86, 54], [112, 84], [128, 120]], 6, 22],
      [[[0, 0], [34, 0], [68, -6], [104, 2], [138, 14], [172, 10]], 6, 14],
      [[[0, 0], [-30, 6], [-56, 16], [-84, 12], [-110, 2], [-136, 6]], 6, 14],
    ];
    return defsS
      .map(([pts, w0, w1]) => {
        const q = rel(pts);
        return `<path d="${k.ribbon(q, w0 + 4, w1 + 5)}" fill="#3A60C8"/><path d="${k.ribbon(q, w0, w1)}" fill="#7FA6EE"/><path d="${k.ribbon(q, 2, w1 * 0.3, { lift: -w1 * 0.12 })}" fill="#E4F0FF"/>`;
      })
      .join("") + `<ellipse cx="${ox}" cy="${oy + 2}" rx="20" ry="7" fill="#9FC0F5"/><ellipse cx="${ox}" cy="${oy + 1}" rx="13" ry="4.4" fill="#E4F0FF"/>`;
  };

  // little flowers on the bank
  const flowers = Array.from({ length: 16 }, (_, i) => {
    const x = 20 + rand() * 560;
    const y = 748 + rand() * 180;
    if ((x < 350 && y > 786 && y < 944) && (x > -20)) return ""; // pond
    const c = ["#FFFFFF", "#F9A8C0", "#FFE9B0"][i % 3];
    return `<g transform="translate(${r2(x)} ${r2(y)})"><path d="M0 0V9" stroke="#1F6674" stroke-width="2" stroke-linecap="round"/><circle cy="-2" r="4.2" fill="${c}"/><circle cy="-2" r="1.6" fill="#F3B63F"/></g>`;
  }).join("");

  // ---------------------------------------------------------------- tree + bird on the right hill
  const tree = `
  <g>
    <path d="M512 596C514 576 514 560 510 540L526 540C524 560 526 580 530 598Z" fill="url(#sk-s-trunk)"/>
    <g>
      <circle cx="486" cy="520" r="34" fill="url(#sk-s-crown)"/><circle cx="530" cy="504" r="44" fill="url(#sk-s-crown)"/>
      <circle cx="568" cy="528" r="32" fill="url(#sk-s-crown)"/><circle cx="520" cy="540" r="34" fill="url(#sk-s-crown)"/>
      <ellipse cx="520" cy="486" rx="26" ry="12" transform="rotate(-18 520 486)" fill="#fff" opacity=".28" filter="url(#sl-blush)"/>
    </g>
    <g transform="translate(540 462) scale(.9)">
      <path d="M-20 4C-12 -8 8 -10 18 -2C22 2 22 8 16 9C6 10 -10 12 -20 4Z" fill="#F7E7F4"/>
      <path d="M-18 4C-26 -2 -30 -10 -32 -18C-24 -14 -18 -8 -12 -4Z" fill="#E96A82"/>
      <circle cx="16" cy="-4" r="8" fill="#F7E7F4"/><path d="M22 -4L36 0L22 2Z" fill="#E9A94A"/><circle cx="18" cy="-6" r="1.8" fill="#2A2350"/>
      <path d="M-2 -6C4 -22 14 -22 20 -14C14 -10 6 -6 -2 -6Z" fill="#E96A82" opacity=".85"/>
      <path d="M-2 10L-4 20M6 10L8 20" stroke="#E9A94A" stroke-width="2" stroke-linecap="round"/>
    </g>
  </g>`;

  // ---------------------------------------------------------------- the small cat on the far left hill
  const catSmall = (() => {
    const tailM = render(h(P.CatTail, { tip: h(P.TailStar) }));
    const bodyM = `<path d="M100 286C96 246 116 216 150 216C184 216 204 246 200 286Z" fill="url(#sl-cat-fur)"/>`;
    const m = `${tailM}${bodyM}${part("Cape")}${part("CatFeet")}${part("CatPaw", { x: 131, y: 259 })}${part("CatPaw", { x: 169, y: 259 })}${part("CatEars")}${part("CatHead", { expression: "surprise" })}${part("AstrologerHat")}`;
    return `<ellipse cx="92" cy="664" rx="46" ry="6" fill="#0D0A26" opacity=".35" filter="url(#sl-blur)"/>` + place(`<g transform="rotate(-6 150 218)">${m}</g>`, { x: 92, y: 664, s: 0.5, cy: 285 });
  })();

  // ---------------------------------------------------------------- the rabbit
  const R = { x: 300, y: 818, s: 1.3 };
  const rab = (m) => place(m, { ...R, cy: 288 });
  const jug = (cx, cy, rot, s = 1, flip = false) => `
  <g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${flip ? -s : s} ${s})">
    <path d="M-8 -28C-8 -40 -12 -46 -15 -50H15C12 -46 8 -40 8 -28Z" fill="url(#sk-s-jug)"/>
    <path d="M30 -18C50 -22 54 8 34 16" stroke="url(#sk-s-jug)" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M0 -30C-30 -30 -38 -4 -34 14C-30 34 -14 40 0 40C14 40 30 34 34 14C38 -4 30 -30 0 -30Z" fill="url(#sk-s-jug)"/>
    <ellipse cx="0" cy="-51" rx="17.5" ry="5.6" fill="#FFD9A0"/><ellipse cx="0" cy="-51" rx="12.6" ry="3.4" fill="#4A2216"/>
    <path d="M-27 -6C-18 0 18 0 27 -6" stroke="#FFE9B0" stroke-width="4.4" stroke-linecap="round" fill="none"/>
    <path d="${starPath(0, 17, 10)}" fill="url(#sl-gold)"/>
    <ellipse cx="-17" cy="-4" rx="5" ry="11" transform="rotate(20 -17 -4)" fill="#fff" opacity=".4"/>
  </g>`;

  const rabBody = `
    <path d="M98 288C94 248 114 218 150 218C186 218 206 248 202 288Z" fill="url(#sl-cardigan)"/>
    <path d="M150 232V288" stroke="#8C76D0" stroke-width="1.5"/>
    <circle cx="150" cy="243" r="3.2" fill="url(#sl-gold)"/><circle cx="150" cy="253" r="3.2" fill="url(#sl-gold)"/>
    <path d="M150 222C140 220 126 223 121 232C126 243 142 243 150 232Z" fill="#FFFDF8"/>
    <path d="M150 222C160 220 174 223 179 232C174 243 158 243 150 232Z" fill="#F4F0FA"/>`;
  // kneeling: one big foot forward on the water's edge, one round knee on the grass
  const rabLegs = `
    <ellipse cx="226" cy="292" rx="22" ry="9" transform="rotate(14 226 292)" fill="url(#sl-rabbit-fur)"/>
    <ellipse cx="190" cy="278" rx="27" ry="19" fill="url(#sl-rabbit-fur)"/>
    <path d="M168 270C176 262 200 262 212 270" stroke="#CFC6DE" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".8"/>
    <ellipse cx="102" cy="293" rx="25" ry="10.5" transform="rotate(-8 102 293)" fill="url(#sl-rabbit-fur)"/>
    <path d="M86 291v5M96 289v5M106 288v5" stroke="#C9BFD9" stroke-width="1.4" stroke-linecap="round"/>`;
  const LEAN = -10; // the rabbit bends over the pond, pivoting on the kneeling (right) knee
  const SL = [107, 258]; // shoulders after the lean (rabbit box coords)
  const SR = [178, 245];
  const PL = [58, 270]; // paws: low over the pond, high over the land
  const PR = [236, 246];
  const sleeveL = `<path d="${capsule(SL, PL, 12.5, 10)}" fill="url(#sl-cardigan)"/>`;
  const sleeveR = `<path d="${capsule(SR, PR, 12.5, 10)}" fill="url(#sl-cardigan)"/>`;
  const pawsOnJugs = part("RabbitPaw", { x: PL[0] + 2, y: PL[1] - 6 }) + part("RabbitPaw", { x: PR[0] - 2, y: PR[1] - 6 });
  const rabbit = `
    <g transform="rotate(${LEAN} 190 290)">
      ${rabLegs}
      ${rabBody}
      ${part("Pencil")}
      ${part("RabbitEars")}
      <g transform="rotate(-3 150 222)">
        ${part("RabbitHead", { expression: "focus" })}
        ${part("Bow")}
        ${part("Glasses")}
      </g>
    </g>`;
  // card-space positions of the paws, the jugs they hold and the jug mouths
  const toCard = ([bx, by]) => [R.x + R.s * (bx - 150), R.y + R.s * (by - 288)];
  const pL = toCard(PL);
  const pR = toCard(PR);
  const JS = 1.0;
  const jL = [pL[0] - 16, pL[1] - 20];
  const jR = [pR[0] + 16, pR[1] - 20];
  const mouth = (c, rot) => {
    const a = (rot * Math.PI) / 180;
    return [c[0] + JS * 51 * Math.sin(a), c[1] - JS * 51 * Math.cos(a)];
  };
  const mL = mouth(jL, -128);
  const mR = mouth(jR, 128);
  const jugL = jug(r2(jL[0]), r2(jL[1]), -128, JS);
  const jugR = jug(r2(jR[0]), r2(jR[1]), 128, JS, true);
  const fall = (m, ty) => {
    const x = r2(m[0]);
    const y = r2(m[1]);
    return `<path d="M${x - 7} ${y}C${x - 9} ${r2(y + (ty - y) * 0.5)} ${x - 6} ${ty - 16} ${x - 8} ${ty}H${x + 8}C${x + 6} ${ty - 16} ${x + 9} ${r2(y + (ty - y) * 0.5)} ${x + 7} ${y}Z" fill="url(#sk-s-fall)"/>
    <path d="M${x - 2} ${y + 6}V${ty - 8}" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>`;
  };
  const waterL = fall(mL, 852);
  const waterR = fall(mR, 834);
  const foot = toCard([104, 308]);

  const shadow = `<ellipse cx="300" cy="826" rx="104" ry="11" fill="#0D0A26" opacity=".34" filter="url(#sl-soft)"/>`;
  const sparkles = Array.from({ length: 10 }, () => `<path d="${sparklePath(r2(60 + rand() * 480), r2(700 + rand() * 220), r2(3 + rand() * 4))}" fill="#FFF6D2" opacity=".8"/>`).join("");

  const body_ = `
  ${sky}
  ${land}
  ${tree}
  ${catSmall}
  ${pond}
  ${ripple(r2(mL[0]), 856, 20)}
  ${ripple(r2(foot[0]), r2(foot[1] + 8), 15)}
  ${streams(mR[0], 834)}
  ${flowers}
  ${shadow}
  ${rab(rabbit)}
  ${rab(sleeveL)}
  ${rab(sleeveR)}
  ${waterL}${waterR}
  ${jugL}${jugR}
  ${rab(pawsOnJugs)}
  <ellipse cx="${r2(mR[0])}" cy="836" rx="22" ry="6" fill="#EAF3FF" opacity=".8"/>
  ${sparkles}
  ${frame({ numeral: "XVII", name: "별" })}
  `;

  return svgDoc({
    title: "스타로그 카드 XVII 별 (The Star)",
    desc: "사서 토끼가 연못가에 무릎을 꿇고 두 항아리의 물을 하나는 연못에, 하나는 땅에 붓는다. 하늘에는 큰 별 하나와 작은 별 일곱 개, 나무 위의 새, 먼 언덕에서 별을 올려다보는 점성술사 고양이.",
    defs,
    body: body_,
  });
}
