// The Starlog card back -> svg/back.svg.   Built so that it is IDENTICAL after a 180 degree turn (reversed cards must
// not reveal their orientation): everything on the upper half is drawn once and repeated rotated about the centre.
// Motifs: the logo star (5 points, so one up and one down), crescent moons, the eight-pointed star of the Star card.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bundleParts } from "./bundle-parts.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

export async function buildBack({ bundle = false } = {}) {
  if (bundle) await bundleParts();
  const k = await import(pathToFileURL(path.join(HERE, "lib", "kit.mjs")).href);
  const { C, rng, r2, sparklePath, starPath, star8, INSET } = k;
  const cx = 300;
  const cy = 520;
  const half = (inner) => `${inner}<g transform="rotate(180 ${cx} ${cy})">${inner}</g>`;

  // upper-half art: drawn once, repeated by half()
  const rand = rng(77);
  const dust = Array.from({ length: 26 }, () => {
    const x = 78 + rand() * 444;
    const y = 80 + rand() * 360;
    return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(1.8 + rand() * 2.2)}" fill="${C.goldLight}" opacity="${r2(0.45 + rand() * 0.4)}"/>`;
  }).join("");
  const sparks = [[104, 392, 17], [496, 392, 17], [84, 214, 12], [516, 214, 12], [186, 168, 9], [414, 168, 9]]
    .map(([x, y, r]) => `<path d="${sparklePath(x, y, r)}" fill="${C.goldLight}"/>`)
    .join("");
  // crescent opening upward: a bowl of light under the logo star
  const crescent = (x, y, R) => `<path d="M${x - R} ${y}A${R} ${R} 0 0 0 ${x + R} ${y}A${R * 1.28} ${R * 1.28} 0 0 1 ${x - R} ${y}Z" fill="${C.gold}"/>`;
  const upper = `
    ${dust}${sparks}
    <path d="${starPath(cx, 150, 50)}" fill="${C.goldLight}" stroke="${C.goldLight}" stroke-width="6" stroke-linejoin="round"/>
    ${crescent(cx, 262, 62)}
    <path d="${sparklePath(78, 78, 14)}" fill="${C.gold}"/>`;

  const medallion = `
    <circle cx="${cx}" cy="${cy}" r="196" fill="${C.navy}"/>
    <circle cx="${cx}" cy="${cy}" r="196" fill="none" stroke="${C.gold}" stroke-width="6"/>
    <circle cx="${cx}" cy="${cy}" r="176" fill="none" stroke="${C.goldLight}" stroke-opacity=".55" stroke-width="2.4"/>
    ${Array.from({ length: 24 }, (_, i) => {
      const a = (i * 15 * Math.PI) / 180;
      return `<circle cx="${r2(cx + 160 * Math.cos(a))}" cy="${r2(cy + 160 * Math.sin(a))}" r="${i % 2 ? 3.4 : 5.4}" fill="${C.goldLight}"/>`;
    }).join("")}
    <path d="${star8(cx, cy, 126)}" fill="${C.gold}"/>
    <path d="${star8(cx, cy, 70, { rot: 22.5, diag: 1, inner: 0.5 })}" fill="${C.goldLight}"/>
    <circle cx="${cx}" cy="${cy}" r="22" fill="${C.navy}"/>`;

  const body = `
    ${k.bg(C.night2)}
    <rect x="${INSET + 24}" y="${INSET + 24}" width="${600 - 2 * INSET - 48}" height="${1040 - 2 * INSET - 48}" rx="30" fill="${C.navyDeep}"/>
    ${half(upper)}
    ${medallion}
    <g id="frame">
      <rect x="${INSET}" y="${INSET}" width="${600 - 2 * INSET}" height="${1040 - 2 * INSET}" rx="24" fill="none" stroke="${C.night2}" stroke-width="11"/>
      <rect x="${INSET}" y="${INSET}" width="${600 - 2 * INSET}" height="${1040 - 2 * INSET}" rx="24" fill="none" stroke="${C.gold}" stroke-width="5"/>
      <rect x="${INSET + 13}" y="${INSET + 13}" width="${600 - 2 * INSET - 26}" height="${1040 - 2 * INSET - 26}" rx="14" fill="none" stroke="${C.goldLight}" stroke-opacity=".5" stroke-width="2"/>
    </g>`;
  const svg = k.svgDoc({
    title: "스타로그 카드 뒷면",
    desc: "밤하늘색 바탕에 금색 팔각 별과 메달리온, 위아래로 로고 별과 초승달. 180도 돌려도 똑같은 점대칭이라 역방향 카드가 방향을 드러내지 않는다.",
    defs: "",
    body,
  });
  await mkdir(path.join(ROOT, "svg"), { recursive: true });
  await writeFile(path.join(ROOT, "svg", "back.svg"), svg, "utf8");
  return svg;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  await buildBack();
  console.log("svg/back.svg");
}
