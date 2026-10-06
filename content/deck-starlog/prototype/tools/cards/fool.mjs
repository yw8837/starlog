// 0 THE FOOL (바보): the astrologer cat steps along a cliff edge at dawn, face turned up to the sun,
// a lucky-pouch bundle on a staff, a white rose in the other paw; the librarian rabbit hops up at its
// heels like the little dog of the 1909 card.
export default function fool(k) {
  const { part, render, h, Parts: P, place, capsule, cloud, leaf, tuft, whiteRose, sparklePath, starPath, rng, frame, svgDoc, r2 } = k;
  const rand = rng(17);

  const defs = `
  <linearGradient id="sk-f-sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#15114A"/><stop offset=".2" stop-color="#2E2A7E"/><stop offset=".4" stop-color="#5648B0"/>
    <stop offset=".56" stop-color="#8A70C8"/><stop offset=".66" stop-color="#DDA2BE"/><stop offset=".73" stop-color="#F8CBA6"/>
    <stop offset=".8" stop-color="#FCE3B2"/><stop offset=".9" stop-color="#EBD3EE"/><stop offset="1" stop-color="#B9A8EC"/>
  </linearGradient>
  <radialGradient id="sk-f-glow" cx="478" cy="168" r="470" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FFF3C8" stop-opacity=".98"/><stop offset=".22" stop-color="#FFE29A" stop-opacity=".6"/>
    <stop offset=".6" stop-color="#FFC98A" stop-opacity=".2"/><stop offset="1" stop-color="#FFC98A" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="sk-f-sun" cx="40%" cy="38%" r="70%">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#FFF4CC"/><stop offset="1" stop-color="#FFD468"/>
  </radialGradient>
  <linearGradient id="sk-f-ray" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#FFE9B0" stop-opacity=".95"/><stop offset="1" stop-color="#FFE9B0" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="sk-f-moon" x1="1" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#EDE6FF"/><stop offset="1" stop-color="#C9BFF0"/>
  </linearGradient>
  <linearGradient id="sk-f-mtn" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#7E73CC"/><stop offset=".55" stop-color="#A592DA"/><stop offset="1" stop-color="#E2B9E0"/>
  </linearGradient>
  <linearGradient id="sk-f-mtn2" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#5C52B0"/><stop offset=".6" stop-color="#8878D0"/><stop offset="1" stop-color="#C9A2DA"/>
  </linearGradient>
  <linearGradient id="sk-f-snow" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#E3DFFA"/><stop offset=".6" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFF6E6"/>
  </linearGradient>
  <linearGradient id="sk-f-stone" x1="0" y1="0" x2="1" y2="0.35">
    <stop offset="0" stop-color="#25205F"/><stop offset=".5" stop-color="#3F3A9A"/><stop offset="1" stop-color="#7467CC"/>
  </linearGradient>
  <linearGradient id="sk-f-stone-face" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#34308A"/><stop offset="1" stop-color="#17133F"/>
  </linearGradient>
  <linearGradient id="sk-f-grass" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#2F9A86"/><stop offset=".6" stop-color="#58C49A"/><stop offset="1" stop-color="#B7EBB0"/>
  </linearGradient>
  <linearGradient id="sk-f-staff" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#F0DCA8"/><stop offset=".5" stop-color="#C9A45E"/><stop offset="1" stop-color="#8E6C32"/>
  </linearGradient>
  <linearGradient id="sk-f-feather" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#C93A55"/><stop offset=".6" stop-color="#F0647A"/><stop offset="1" stop-color="#FFA3A8"/>
  </linearGradient>
  `;

  // ---------------------------------------------------------------- sky
  const rays = Array.from({ length: 24 }, (_, i) => {
    const long = i % 2 === 0;
    const len = long ? 122 : 86;
    return `<path transform="rotate(${i * 15})" d="M74 -7L${74 + len} 0L74 7Z" fill="url(#sk-f-ray)"/>`;
  }).join("");

  const sparkles = Array.from({ length: 16 }, () => {
    const x = 50 + rand() * 330;
    const y = 120 + rand() * 330;
    const r = 4 + rand() * 6;
    return `<path d="${sparklePath(r2(x), r2(y), r2(r))}" fill="#FFE9B0" opacity="${r2(0.55 + rand() * 0.4)}"/>`;
  }).join("");

  const peak = (id, ax, ay, lx, rx, by, fill, snowDepth) => {
    const wl = ax - lx;
    const wr = rx - ax;
    const d = `M${lx} ${by}C${r2(lx + wl * 0.4)} ${r2(by - (by - ay) * 0.45)} ${r2(ax - wl * 0.18)} ${r2(ay + (by - ay) * 0.2)} ${ax} ${ay}C${r2(ax + wr * 0.18)} ${r2(ay + (by - ay) * 0.2)} ${r2(rx - wr * 0.4)} ${r2(by - (by - ay) * 0.45)} ${rx} ${by}Z`;
    const sy = ay + snowDepth;
    const zig = `M${ax - 150} ${ay - 20}H${ax + 150}V${sy}L${r2(ax + wr * 0.4)} ${sy - 22}L${r2(ax + wr * 0.24)} ${sy + 8}L${ax + 6} ${sy - 26}L${r2(ax - wl * 0.1)} ${sy + 12}L${r2(ax - wl * 0.3)} ${sy - 18}L${r2(ax - wl * 0.46)} ${sy + 6}L${ax - 150} ${sy - 8}Z`;
    return `<clipPath id="${id}"><path d="${d}"/></clipPath>
      <path d="${d}" fill="${fill}"/>
      <g clip-path="url(#${id})"><path d="${zig}" fill="url(#sk-f-snow)"/>
      <path d="M${ax} ${ay}L${r2(ax + wr * 0.5)} ${by}H${rx}V${ay}Z" fill="#FFE9B0" opacity=".16"/></g>`;
  };

  // a pale crescent, the moon rabbit's, fading in the dawn; its bright edge faces the sun
  const moon = `
  <g transform="translate(120 214) rotate(24)">
    <circle r="54" fill="#E9E2FF" opacity=".18" filter="url(#sl-soft)"/>
    <path d="M0 -36A36 36 0 1 1 0 36A50 50 0 0 0 0 -36Z" fill="url(#sk-f-moon)"/>
    <path d="M-4 -33A33 33 0 0 1 22 -8" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round" fill="none" transform="scale(-1 1)"/>
  </g>`;
  const glints = [[64, 372, 9], [238, 138, 8], [300, 286, 7], [176, 480, 6]]
    .map(([x, y, r]) => `<path d="${starPath(x, y, r)}" fill="url(#sl-gold)" opacity=".9"/>`)
    .join("");

  const sky = `
  <rect width="600" height="1040" fill="url(#sk-f-sky)"/>
  <rect width="600" height="1040" fill="url(#sk-f-glow)"/>
  ${moon}
  ${sparkles}
  ${glints}
  <g transform="translate(478 168)"><g opacity=".62">${rays}</g></g>
  <circle cx="478" cy="168" r="96" fill="#FFF3C8" opacity=".28" filter="url(#sl-soft)"/>
  <circle cx="478" cy="168" r="66" fill="#FFF6D6" opacity=".5"/>
  <circle cx="478" cy="168" r="58" fill="url(#sk-f-sun)"/>
  <path d="M444 146A40 40 0 0 1 480 128" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".7"/>
  `;

  const mountains = `
  ${peak("sk-f-c1", 62, 612, -70, 214, 760, "url(#sk-f-mtn)", 62)}
  ${peak("sk-f-c2", 196, 664, 96, 312, 760, "url(#sk-f-mtn)", 46)}
  ${peak("sk-f-c3", 452, 548, 248, 660, 780, "url(#sk-f-mtn2)", 92)}
  ${peak("sk-f-c4", 566, 640, 470, 690, 780, "url(#sk-f-mtn)", 50)}
  <ellipse cx="280" cy="770" rx="420" ry="36" fill="#FCE6BE" opacity=".85" filter="url(#sl-soft)"/>
  <ellipse cx="470" cy="752" rx="190" ry="26" fill="#FFF3DA" opacity=".8" filter="url(#sl-soft)"/>
  <ellipse cx="90" cy="748" rx="150" ry="22" fill="#F9D6C4" opacity=".7" filter="url(#sl-soft)"/>
  `;

  // ---------------------------------------------------------------- ledge
  const LEDGE = "M-20 792C60 780 150 784 250 786C330 788 392 786 420 794C442 800 448 816 432 824C410 834 372 838 340 850C300 864 272 890 226 908C170 930 90 938 -20 948Z";
  const ledge = `
  <clipPath id="sk-f-ledge-clip"><path d="${LEDGE}"/></clipPath>
  <path d="${LEDGE}" fill="url(#sk-f-stone)"/>
  <g clip-path="url(#sk-f-ledge-clip)">
    <path d="M-20 880C80 866 200 872 330 850L460 830V960H-20Z" fill="url(#sk-f-stone-face)" opacity=".7"/>
    <path d="M30 846C110 838 190 842 270 832M70 884C150 874 240 876 320 862M10 918C100 906 180 908 240 896" stroke="#15113F" stroke-opacity=".5" stroke-width="3.2" stroke-linecap="round" fill="none"/>
    <path d="M300 814L312 832L304 846M214 842L222 862M120 826L128 846" stroke="#15113F" stroke-opacity=".45" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M432 824C410 834 372 838 340 850" stroke="#FFE9B0" stroke-width="7" stroke-linecap="round" fill="none" opacity=".6" filter="url(#sl-blur)"/>
    <path d="M420 794C442 800 448 816 432 824" stroke="#FFF0C4" stroke-width="7" stroke-linecap="round" fill="none" opacity=".7" filter="url(#sl-blur)"/>
  </g>
  <path d="M-20 792C60 780 150 784 250 786C330 788 392 786 420 794C442 800 448 816 432 824C424 827 414 827 404 829Q380 816 356 827Q330 812 304 825Q276 810 250 823Q220 808 192 823Q160 808 130 823Q90 808 60 823Q30 812 -20 826Z" fill="url(#sk-f-grass)"/>
  <path d="M-20 790C60 778 150 782 250 784C330 786 392 784 420 792" stroke="#E7FFD0" stroke-width="3" stroke-linecap="round" fill="none" opacity=".55"/>
  <g clip-path="url(#sk-f-ledge-clip)" fill="#7A6DD2" opacity=".42">
    <ellipse cx="86" cy="858" rx="46" ry="12" transform="rotate(-3 86 858)"/><ellipse cx="236" cy="850" rx="52" ry="11" transform="rotate(-4 236 850)"/>
    <ellipse cx="372" cy="838" rx="34" ry="8" transform="rotate(-10 372 838)"/><ellipse cx="150" cy="906" rx="48" ry="10" transform="rotate(-6 150 906)"/>
  </g>
  <g transform="translate(404 828) rotate(14)">${tuft(0, 0, 0.8)}</g><g transform="translate(424 822) rotate(40)">${tuft(0, 0, 0.7)}</g>
  ${tuft(60, 798, 0.9)}${tuft(150, 794, 0.7)}${tuft(398, 800, 0.85)}${tuft(20, 802, 0.7)}
  ${[ [92, 800], [196, 796], [352, 792], [408, 806] ].map(([x, y]) => `<g transform="translate(${x} ${y})"><circle r="6" fill="#fff"/><circle r="2.6" fill="#F3B63F"/></g>`).join("")}
  `;


  const pebbles = [[452, 870, 13, 0], [474, 914, 10, 1], [440, 944, 7, 2]]
    .map(([x, y, r, i]) => `<path d="M${x + 1} ${y - r * 2.6 - 14}V${y - r - 5}M${x - 7} ${y - r * 2 - 4}V${y - r - 8}" stroke="#6C62C4" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/><g transform="translate(${x} ${y}) rotate(${i * 34})"><path d="M${-r} -2C${-r} ${-r * 0.95} ${r * 0.7} ${-r * 1.05} ${r} -2C${r * 1.05} ${r * 0.85} ${-r * 0.4} ${r} ${-r} -2Z" fill="#5B52B0"/><path d="M${-r * 0.55} ${-r * 0.35}Q0 ${-r * 0.85} ${r * 0.55} ${-r * 0.35}" stroke="#E9E2FF" stroke-opacity=".7" stroke-width="2.6" stroke-linecap="round" fill="none"/></g>`)
    .join("");
  const mist = `
  ${cloud(490, 866, 220, { opacity: 0.97 })}
  ${cloud(562, 812, 130, { opacity: 0.92 })}
  ${cloud(418, 906, 140, { opacity: 0.85 })}
  `;

  // ---------------------------------------------------------------- cat
  const C = { x: 332, y: 808, s: 1.5 };
  const cat = (m) => place(m, { ...C, cy: 285 });
  const tail = render(h(P.CatTail, { tip: h(P.TailStar) }));
  const body = `<path d="M100 286C96 246 116 216 150 216C184 216 204 246 200 286Z" fill="url(#sl-cat-fur)"/><ellipse cx="150" cy="262" rx="20" ry="22" fill="#FFFDF8" opacity=".6" filter="url(#sl-blur)"/>`;
  const toes = (x, y) => `<path d="M${x - 4} ${y - 2}v4.5M${x + 4} ${y - 2}v4.5" stroke="#CDB495" stroke-width="1.4" stroke-linecap="round"/>`;
  const feet = `
    <g><ellipse cx="122" cy="283" rx="15" ry="8.5" fill="url(#sl-cat-fur)"/>${toes(122, 283)}</g>
    <g transform="rotate(-12 188 276)"><ellipse cx="188" cy="276" rx="15" ry="8.5" fill="url(#sl-cat-fur)"/>${toes(188, 276)}</g>`;
  // arms: staff paw low on the viewer's left, rose paw lifted out to the right
  const armStaff = `<path d="${capsule([118, 242], [90, 240], 13, 11)}" fill="url(#sl-cat-fur)"/>${part("CatPaw", { x: 90, y: 240 })}`;
  const armRose = `<path d="${capsule([184, 240], [258, 188], 13, 10.5)}" fill="url(#sl-cat-fur)"/>${part("CatPaw", { x: 259, y: 187 })}`;
  const feather = `
    <g transform="rotate(-7 150 104)">
      <path d="M108 96C100 70 78 50 48 44C56 66 74 88 108 96Z" fill="url(#sk-f-feather)"/>
      <path d="M108 96C92 76 74 60 48 44" stroke="#FFE9B0" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      <path d="M95 74L104 70M84 66L92 60M72 58L78 52M92 82L82 78M82 72L72 68" stroke="#fff" stroke-opacity=".5" stroke-width="1.2" stroke-linecap="round"/>
      <circle cx="107" cy="96" r="3.6" fill="url(#sl-gold)"/>
    </g>`;
  const headGroup = `<g transform="rotate(9 150 218)">${part("CatEars")}${part("CatHead", { expression: "wink" })}${part("AstrologerHat")}${feather}</g>`;

  // staff over the shoulder + lucky-pouch bundle (card coordinates)
  const SA = [226, 752];
  const SB = [506, 420];
  const ang = (Math.atan2(SB[1] - SA[1], SB[0] - SA[0]) * 180) / Math.PI;
  const slen = Math.hypot(SB[0] - SA[0], SB[1] - SA[1]);
  const staff = `
    <g transform="translate(${SA[0]} ${SA[1]}) rotate(${r2(ang)})">
      <rect x="0" y="-7" width="${r2(slen)}" height="14" rx="7" fill="url(#sk-f-staff)"/>
      <rect x="0" y="-5" width="${r2(slen)}" height="3.4" rx="1.7" fill="#fff" opacity=".35"/>
      <rect x="${r2(slen - 22)}" y="-8.5" width="9" height="17" rx="4" fill="url(#sl-gold)"/>
    </g>`;
  const bundle = `
    <g transform="translate(${SB[0] + 4} ${SB[1] + 6})">
      <path d="M-2 -4C-8 8 -10 18 -8 28" stroke="url(#sl-gold)" stroke-width="3" stroke-linecap="round" fill="none"/>
      <g transform="translate(-8 28)">
        <ellipse cx="2" cy="50" rx="30" ry="6" fill="#0D0A26" opacity=".0"/>
        <path d="M-10 2C-34 10 -34 46 0 48C34 46 34 10 10 2Z" fill="url(#sl-pouch)"/>
        <path d="M-12 4Q-6 -6 0 -1Q6 -6 12 4Q6 0 0 3Q-6 0 -12 4Z" fill="#E86478"/>
        <circle cx="0" cy="27" r="9" fill="none" stroke="url(#sl-gold)" stroke-width="2.4"/>
        <path d="${sparklePath(0, 27, 6.4)}" fill="url(#sl-gold)"/>
        <ellipse cx="-14" cy="20" rx="3.6" ry="8" transform="rotate(20 -14 20)" fill="#fff" opacity=".35"/>
      </g>
    </g>`;
  const roseP = [498, 590];
  const rose = `
    <path d="M${roseP[0] - 2} ${roseP[1] + 16}C${roseP[0] - 4} ${roseP[1] + 34} ${roseP[0] - 12} ${roseP[1] + 44} ${roseP[0] - 18} ${roseP[1] + 52}" stroke="#2F9A86" stroke-width="4.4" stroke-linecap="round" fill="none"/>
    ${leaf(roseP[0] - 8, roseP[1] + 38, 26, -28, { wide: 0.36 })}${leaf(roseP[0] - 6, roseP[1] + 30, 22, 30, { wide: 0.36 })}
    <circle cx="${roseP[0]}" cy="${roseP[1]}" r="32" fill="#fff" opacity=".35" filter="url(#sl-glow)"/>
    ${whiteRose(roseP[0], roseP[1], 25, 12)}`;

  const catShadow = `<ellipse cx="332" cy="812" rx="100" ry="12" fill="#0D0A26" opacity=".38" filter="url(#sl-soft)"/>`;

  // ---------------------------------------------------------------- rabbit
  const R = { x: 118, y: 846, s: 0.98 };
  const rab = (m) => place(m, { ...R, cy: 288, rot: 8 });
  const rabBody = `
    <path d="M98 288C94 248 114 218 150 218C186 218 206 248 202 288Z" fill="url(#sl-cardigan)"/>
    <path d="M150 232V288" stroke="#8C76D0" stroke-width="1.5"/>
    <circle cx="150" cy="243" r="3.2" fill="url(#sl-gold)"/><circle cx="150" cy="253" r="3.2" fill="url(#sl-gold)"/>
    <path d="M150 222C140 220 126 223 121 232C126 243 142 243 150 232Z" fill="#FFFDF8"/>
    <path d="M150 222C160 220 174 223 179 232C174 243 158 243 150 232Z" fill="#F4F0FA"/>`;
  const rabArms = `
    <path d="${capsule([186, 242], [236, 204], 12, 9.5)}" fill="url(#sl-cardigan)"/>
    <path d="${capsule([114, 244], [74, 262], 12, 9.5)}" fill="url(#sl-cardigan)"/>
    ${part("RabbitPaw", { x: 238, y: 202 })}${part("RabbitPaw", { x: 71, y: 264 })}`;
  const rabbit = `
    ${part("RabbitFeet")}
    ${rabBody}
    ${part("Pencil")}
    ${part("RabbitEars")}
    ${part("RabbitHead", { expression: "happy" })}
    ${part("Bow")}
    ${part("Glasses")}
    ${rabArms}`;
  const rabShadow = `<ellipse cx="122" cy="852" rx="62" ry="8" fill="#0D0A26" opacity=".34" filter="url(#sl-soft)"/>`;

  // gold dust trailing the lifted paw
  const dust = Array.from({ length: 9 }, (_, i) => {
    const x = 340 + i * 14 + rand() * 12;
    const y = 840 - i * 6 - rand() * 18;
    return `<path d="${sparklePath(r2(x), r2(y), r2(3 + rand() * 4))}" fill="#FFE9B0" opacity=".85"/>`;
  }).join("");

  const body_ = `
  ${sky}
  ${mountains}
  ${mist}
  ${pebbles}
  ${ledge}
  ${catShadow}
  ${rabShadow}
  ${cat(tail)}
  ${cat(body)}
  ${cat(part("Cape"))}
  ${cat(feet)}
  ${staff}
  ${cat(armStaff)}
  ${bundle}
  ${cat(armRose)}
  ${rose}
  ${cat(headGroup)}
  ${rab(rabbit)}
  ${dust}
  ${frame({ numeral: "0", name: "바보" })}
  `;

  return svgDoc({
    title: "스타로그 카드 0 바보 (The Fool)",
    desc: "점성술사 고양이가 새벽 절벽 끝을 걷는다. 해를 올려다보며 막대 끝 복주머니 보따리와 흰 장미를 들었고, 사서 토끼가 강아지처럼 발치에서 뛰어오른다.",
    defs,
    body: body_,
  });
}
