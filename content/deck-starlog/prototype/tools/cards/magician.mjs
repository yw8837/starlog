// I THE MAGICIAN (마법사): the astrologer cat holds a wand to the sky and points a paw at the earth,
// the lemniscate over its hat, the four tools (cup, pentacle, sword, wand) on the table, roses and lilies.
export default function magician(k) {
  const { part, render, h, Parts: P, place, capsule, leaf, rose, lily, sparklePath, starPath, rng, frame, svgDoc, r2 } = k;
  const rand = rng(23);

  const defs = `
  <linearGradient id="sk-m-sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#110D39"/><stop offset=".3" stop-color="#241E6B"/>
    <stop offset=".62" stop-color="#43359A"/><stop offset="1" stop-color="#20195E"/>
  </linearGradient>
  <radialGradient id="sk-m-glow" cx="372" cy="520" r="470" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FFF3C4" stop-opacity="1"/><stop offset=".22" stop-color="#FFDD92" stop-opacity=".82"/>
    <stop offset=".5" stop-color="#F0B25A" stop-opacity=".36"/><stop offset="1" stop-color="#F0B25A" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="sk-m-cloth-top" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#A793EC"/><stop offset="1" stop-color="#6A55BE"/>
  </linearGradient>
  <linearGradient id="sk-m-cloth" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4C41A8"/><stop offset=".5" stop-color="#2A2477"/><stop offset="1" stop-color="#17134A"/>
  </linearGradient>
  <linearGradient id="sk-m-blade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#D3CBF2"/><stop offset="1" stop-color="#8F86CC"/>
  </linearGradient>
  <linearGradient id="sk-m-wood" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#F0DCA8"/><stop offset=".5" stop-color="#C9A45E"/><stop offset="1" stop-color="#8E6C32"/>
  </linearGradient>
  <linearGradient id="sk-m-wand" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#EEE8FF"/><stop offset="1" stop-color="#B3A8DE"/>
  </linearGradient>
  <linearGradient id="sk-m-inf" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FFF3C4"/><stop offset=".5" stop-color="#F3CE74"/><stop offset="1" stop-color="#D9A33E"/>
  </linearGradient>
  <radialGradient id="sk-m-bush" cx="50%" cy="100%" r="80%">
    <stop offset="0" stop-color="#5BBF98"/><stop offset=".6" stop-color="#2E8A7E"/><stop offset="1" stop-color="#1A5A6C"/>
  </radialGradient>
  `;

  // ---------------------------------------------------------------- background
  const stars = Array.from({ length: 26 }, () => {
    const x = 40 + rand() * 520;
    const y = 110 + rand() * 560;
    const big = rand() > 0.82;
    return big
      ? `<path d="${sparklePath(r2(x), r2(y), r2(6 + rand() * 4))}" fill="#FFE9B0" opacity=".9"/>`
      : `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(1.2 + rand() * 1.6)}" fill="#FFE9B0" opacity="${r2(0.4 + rand() * 0.5)}"/>`;
  }).join("");

  const aura = `
  <rect width="600" height="1040" fill="url(#sk-m-sky)"/>
  <rect width="600" height="1040" fill="url(#sk-m-glow)"/>
  <g fill="none" stroke="#FFE9B0">
    <circle cx="372" cy="560" r="262" stroke-opacity=".22" stroke-width="3"/>
    <circle cx="372" cy="560" r="302" stroke-opacity=".12" stroke-width="2" stroke-dasharray="3 13" stroke-linecap="round"/>
  </g>
  ${stars}`;

  // roses hanging in from both top corners, as on the 1909 card
  const garland = `
  <g>
    <path d="M-12 84C60 46 132 68 160 126C176 160 168 192 148 222" stroke="#2E8A7E" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M612 76C540 40 470 60 442 116C426 150 436 188 458 214" stroke="#2E8A7E" stroke-width="7" stroke-linecap="round" fill="none"/>
    ${[
      [14, 78, 20, 6], [44, 66, 24, -40], [84, 62, 20, 12], [118, 84, 22, 36], [150, 124, 20, 70], [166, 158, 20, 96], [158, 196, 18, 110],
      [586, 72, 20, 174], [556, 56, 24, 200], [514, 52, 20, 168], [482, 72, 22, 150], [452, 110, 20, 110], [436, 146, 20, 82], [448, 186, 18, 70],
    ].map(([x, y, l, a]) => leaf(x, y, l + 10, a, { wide: 0.38 })).join("")}
    ${rose(34, 100, 25, 20)}${rose(100, 66, 21, -10)}${rose(150, 142, 22, 30)}${rose(150, 214, 17, 0)}
    ${rose(566, 94, 25, -30)}${rose(498, 60, 21, 10)}${rose(446, 126, 22, -20)}${rose(462, 208, 17, 0)}
  </g>`;

  // ---------------------------------------------------------------- the four tools on the table
  const cup = `
  <g transform="translate(98 742)">
    <ellipse cx="0" cy="3" rx="34" ry="7" fill="#0D0A26" opacity=".38" filter="url(#sl-blur)"/>
    <path d="M-27 -3C-27 -9 -14 -12 0 -12C14 -12 27 -9 27 -3C27 1 14 4 0 4C-14 4 -27 1 -27 -3Z" fill="url(#sl-gold)"/>
    <path d="M-7 -11C-6 -34 -9 -52 -13 -70H13C9 -52 6 -34 7 -11Z" fill="url(#sl-gold)"/>
    <ellipse cx="0" cy="-38" rx="11.5" ry="4.4" fill="#B98A2E"/>
    <path d="M-36 -122C-38 -90 -23 -70 0 -66C23 -70 38 -90 36 -122Z" fill="url(#sl-gold)"/>
    <ellipse cx="0" cy="-122" rx="36" ry="9" fill="#FFF1C4"/>
    <ellipse cx="0" cy="-122" rx="30.5" ry="6" fill="#5A3FB0"/>
    <path d="M-24 -108C-26 -94 -20 -82 -9 -75" stroke="#fff" stroke-opacity=".6" stroke-width="4.4" stroke-linecap="round" fill="none"/>
    <path d="${sparklePath(0, -96, 8)}" fill="#7A2D58" opacity=".55"/>
    <path d="${sparklePath(0, -96, 8)}" fill="#FFF1C4" opacity=".0"/>
  </g>`;

  const pentacle = `
  <g transform="translate(184 694)">
    <ellipse cx="0" cy="46" rx="32" ry="6" fill="#0D0A26" opacity=".34" filter="url(#sl-blur)"/>
    <circle r="42" fill="url(#sl-gold)"/>
    <circle r="35" fill="#D6A23C"/>
    <circle r="33" fill="none" stroke="#FFF1C4" stroke-width="2.2" opacity=".75"/>
    <path d="${starPath(0, 1, 25, 0.4)}" fill="#FFF1C4" stroke="#8A5E1C" stroke-width="2.4" stroke-linejoin="round"/>
    <ellipse cx="-17" cy="-27" rx="13" ry="5" transform="rotate(-40 -17 -27)" fill="#fff" opacity=".55"/>
  </g>`;

  const sword = `
  <g transform="translate(214 735) rotate(-3)">
    <ellipse cx="52" cy="9" rx="62" ry="5" fill="#0D0A26" opacity=".34" filter="url(#sl-blur)"/>
    <path d="M30 -6H108L132 0L108 6H30Z" fill="url(#sk-m-blade)"/>
    <path d="M32 -2.2H122" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/>
    <rect x="14" y="-6" width="18" height="12" rx="3" fill="#5A3FB0"/>
    <rect x="26" y="-17" width="9" height="34" rx="4.5" fill="url(#sl-gold)"/>
    <circle cx="8" cy="0" r="8" fill="url(#sl-gold)"/>
    <circle cx="6" cy="-2.4" r="2.4" fill="#fff" opacity=".8"/>
  </g>`;

  const woodWand = `
  <g transform="translate(46 764) rotate(-1.2)">
    <ellipse cx="124" cy="8" rx="132" ry="4.5" fill="#0D0A26" opacity=".3" filter="url(#sl-blur)"/>
    <rect x="0" y="-6" width="250" height="12" rx="6" fill="url(#sk-m-wood)"/>
    <rect x="6" y="-4" width="238" height="3" rx="1.5" fill="#fff" opacity=".35"/>
    <rect x="0" y="-7" width="14" height="14" rx="5" fill="url(#sl-gold)"/>
    <rect x="236" y="-7" width="14" height="14" rx="5" fill="url(#sl-gold)"/>
  </g>`;

  const table = `
  <g>
    <path d="M14 776L300 776L322 804V872H-6Z" fill="#0D0A26" opacity=".0"/>
    <path d="M-10 744L318 740L326 772L-14 778Z" fill="url(#sk-m-cloth-top)"/>
    <path d="M-10 744L318 740" stroke="#FFF1C4" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    <path d="M-14 778L326 772V900C250 912 150 912 60 902L-14 896Z" fill="url(#sk-m-cloth)"/>
    <path d="M-14 784L326 778" stroke="url(#sl-gold)" stroke-width="5"/>
    <g fill="url(#sl-gold)" opacity=".92">
      ${[30, 110, 190, 270].map((x, i) => `<path d="${starPath(x, 826 + (i % 2) * 8, 11)}"/>`).join("")}
      ${[70, 150, 230].map((x) => `<path d="${sparklePath(x, 850, 6)}"/>`).join("")}
    </g>
    <path d="M-14 888C60 900 150 902 250 898L326 890" stroke="url(#sl-gold)" stroke-width="3.4" stroke-dasharray="2 9" stroke-linecap="round" fill="none"/>
  </g>`;

  // ---------------------------------------------------------------- the cat
  const C = { x: 378, y: 850, s: 1.68 };
  const cat = (m) => place(m, { ...C, cy: 285 });
  const tail = render(h(P.CatTail, { tip: h(P.TailStar) }));
  const body = `<path d="M100 286C96 246 116 216 150 216C184 216 204 246 200 286Z" fill="url(#sl-cat-fur)"/><ellipse cx="150" cy="262" rx="20" ry="22" fill="#FFFDF8" opacity=".6" filter="url(#sl-blur)"/>`;
  const cuff = (x, y, rot) => `<rect x="-13.5" y="-3.6" width="27" height="7.2" rx="3.6" transform="translate(${x} ${y}) rotate(${rot})" fill="url(#sl-gold)"/>`;
  const armUp = `<path d="${capsule([114, 240], [42, 100], 13.5, 10.5)}" fill="url(#sl-cat-fur)"/>${cuff(56, 127, -27)}`;
  const pawUp = part("CatPaw", { x: 42, y: 99 });
  // pointing arm: outward and down, a soft shadow lifts it off the cream tail behind it
  const armDownPath = capsule([188, 242], [226, 280], 13.5, 10.5);
  const armDown = `<path d="${armDownPath}" fill="#4A3F7A" opacity=".34" transform="translate(3 4)" filter="url(#sl-blur)"/><path d="${armDownPath}" fill="url(#sl-cat-fur)"/>${cuff(214, 268, 135)}`;
  const pawDown = `
    <path d="${capsule([230, 288], [240, 313], 7.6, 5.6)}" fill="#4A3F7A" opacity=".3" transform="translate(2 3)" filter="url(#sl-blur)"/>
    ${part("CatPaw", { x: 228, y: 283 })}
    <path d="${capsule([230, 287], [240, 314], 7.4, 5.4)}" fill="url(#sl-cat-fur)"/>
    <path d="M224 286L226 291" stroke="#CDB495" stroke-width="1.4" stroke-linecap="round"/>
    <ellipse cx="240.4" cy="315" rx="3.4" ry="2.4" fill="#F4A3B7" opacity=".9"/>
    <circle cx="241" cy="322" r="14" fill="#FFE9B0" opacity=".5" filter="url(#sl-glow)"/>
    <path d="${sparklePath(241, 322, 9)}" fill="#FFF6D2"/>`;
  const headGroup = `${part("CatEars")}${part("CatHead", { expression: "idle" })}${part("AstrologerHat")}`;

  // wand raised in the left paw (card coordinates, so it can stay perfectly upright)
  const wx = C.x + C.s * (42 - 150);
  const wy = C.y + C.s * (99 - 285);
  const wand = `
  <g transform="translate(${r2(wx + 3)} ${r2(wy + 6)}) rotate(5)">
    <rect x="-6.6" y="-196" width="13.2" height="226" rx="6.6" fill="url(#sk-m-wand)"/>
    <rect x="-9" y="-206" width="18" height="17" rx="6.5" fill="url(#sl-gold)"/>
    <rect x="-9" y="-70" width="18" height="9" rx="4" fill="url(#sl-gold)"/>
    <rect x="-9" y="14" width="18" height="15" rx="5.5" fill="url(#sl-gold)"/>
    <path d="M-2.4 -186V8" stroke="#fff" stroke-opacity=".9" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="0" cy="-228" r="26" fill="#FFE9B0" opacity=".6" filter="url(#sl-glow)"/>
    <path d="${sparklePath(0, -230, 16)}" fill="#FFF6D2"/>
  </g>`;

  // lemniscate over the hat
  const inf = `
  <g transform="translate(386 236)">
    <path d="M-62 0C-62 -40 -20 -40 0 0C20 40 62 40 62 0C62 -40 20 -40 0 0C-20 40 -62 40 -62 0Z" fill="none" stroke="#FFE9B0" stroke-width="22" stroke-linejoin="round" opacity=".5" filter="url(#sl-soft)"/>
    <path d="M-62 0C-62 -40 -20 -40 0 0C20 40 62 40 62 0C62 -40 20 -40 0 0C-20 40 -62 40 -62 0Z" fill="none" stroke="url(#sk-m-inf)" stroke-width="12" stroke-linejoin="round"/>
    <path d="M-58 -10C-52 -28 -30 -30 -16 -12" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="${sparklePath(-70, -26, 8)}" fill="#FFF6D2"/><path d="${sparklePath(72, 22, 7)}" fill="#FFF6D2"/>
  </g>`;

  // trickle of gold from the pointing paw
  const fx = C.x + C.s * (241 - 150);
  const fy = C.y + C.s * (325 - 285);
  const trickle = Array.from({ length: 3 }, (_, i) => `<path d="${sparklePath(r2(fx + (rand() - 0.5) * 12 + i * 2), r2(fy + 6 + i * 10), r2(3 + rand() * 3))}" fill="#FFE9B0" opacity="${r2(0.95 - i * 0.1)}"/>`).join("");

  // flower bed: roses and lilies in front of the table legs and the cat's feet
  const bed = (() => {
    const out = [];
    out.push(`<ellipse cx="300" cy="930" rx="360" ry="70" fill="url(#sk-m-bush)"/>`);
    const leaves = [];
    for (let i = 0; i < 34; i++) {
      const x = 10 + i * 17 + rand() * 8;
      const y = 872 + rand() * 54;
      leaves.push(leaf(x, y, 34 + rand() * 20, -150 + rand() * 120, { wide: 0.36 }));
    }
    out.push(leaves.join(""));
    const flowers = [
      ["rose", 40, 888, 22], ["lily", 96, 872, 24], ["rose", 150, 900, 21], ["lily", 214, 884, 22], ["rose", 268, 904, 23],
      ["lily", 322, 890, 24], ["rose", 392, 902, 22], ["lily", 452, 896, 23], ["rose", 512, 910, 24], ["lily", 566, 900, 22], ["rose", 346, 870, 17], ["rose", 482, 908, 16],
    ];
    for (const [t, x, y, r] of flowers) out.push(t === "rose" ? rose(x, y, r, rand() * 60) : lily(x, y, r, rand() * 40 - 20));
    return out.join("");
  })();

  const shadow = `<ellipse cx="380" cy="856" rx="110" ry="12" fill="#0D0A26" opacity=".4" filter="url(#sl-soft)"/>`;

  const body_ = `
  ${aura}
  ${garland}
  ${shadow}
  ${cat(`<g transform="rotate(-14 194 282)">${tail}</g>`)}
  ${cat(armUp)}
  ${cat(body)}
  ${cat(part("Cape"))}
  ${cat(part("CatFeet"))}
  ${cat(armDown)}
  ${cat(headGroup)}
  ${wand}
  ${cat(pawUp)}
  ${inf}
  ${table}
  ${pentacle}
  ${cup}
  ${sword}
  ${woodWand}
  ${bed}
  ${cat(pawDown)}
  ${trickle}
  ${frame({ numeral: "I", name: "마법사" })}
  `;

  return svgDoc({
    title: "스타로그 카드 I 마법사 (The Magician)",
    desc: "점성술사 고양이가 한 손에 지팡이를 높이 들고 다른 손으로 땅을 가리킨다. 머리 위에 무한대 표시, 탁자 위에 컵·펜타클·칼·지팡이, 아래에는 붉은 장미와 흰 백합.",
    defs,
    body: body_,
  });
}
