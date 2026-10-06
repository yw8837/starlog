// Comparison sheets (needs render/ first):
//   comparison.png        each Starlog card next to its 1909 scan, cropped exactly like the app does (600:1040, cover)
//   legibility-90px.png   the fan size check: 90 px wide as the app shows them, a 3x pixel zoom, reversed, and a mock fan
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sharp } from "./lib/browser.mjs";
import { CARDS } from "./build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const RENDER = path.join(ROOT, "render");
const SCANS = "D:/Money/apps/saju-tarot/apps/web/public/cards";
const TMP = path.join(HERE, ".build", "cmp");
await mkdir(TMP, { recursive: true });

const url = (p) => `file:///${p.replace(/\\/g, "/")}`;
const META = {
  "major-00-fool": { num: "0", ko: "바보", en: "The Fool" },
  "major-01-magician": { num: "I", ko: "마법사", en: "The Magician" },
  "major-17-star": { num: "XVII", ko: "별", en: "The Star" },
};

const FONT = `font-family: "Noto Sans KR", "Malgun Gothic", sans-serif;`;
const SERIF = `font-family: "Noto Serif KR", "Batang", serif;`;

// -------------------------------------------------------------------- comparison.png
function comparisonHtml() {
  const CW = 400;
  const groups = CARDS.map((id) => {
    const m = META[id];
    return `
    <section class="grp">
      <h2><span class="n">${m.num}</span> ${m.ko} <small>${m.en}</small></h2>
      <div class="pair">
        <figure><div class="card"><img src="${url(path.join(RENDER, `${id}@3x.webp`))}"></div><figcaption>스타로그 카드<br><em>프로토타입</em></figcaption></figure>
        <figure><div class="card"><img src="${url(`${SCANS}/${id}.webp`)}"></div><figcaption>클래식<br><em>RWS 1909 스캔 (현재 앱)</em></figcaption></figure>
      </div>
    </section>`;
  }).join("");
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{background:radial-gradient(1400px 700px at 50% -10%,#2e2a78 0%,#15113a 55%,#0d0a26 100%);color:#f1ecff;${FONT}padding:48px 56px 52px;width:max-content}
  header{display:flex;align-items:baseline;gap:18px;margin-bottom:30px}
  header h1{${SERIF}font-size:30px;font-weight:700;color:#f3dca1;letter-spacing:.04em}
  header p{font-size:15px;color:#bdb3e6}
  .wrap{display:flex;gap:44px}
  .grp h2{${SERIF}font-size:24px;font-weight:700;color:#f3dca1;margin-bottom:14px;letter-spacing:.06em}
  .grp h2 .n{display:inline-block;min-width:44px;margin-right:6px;color:#e9c46f}
  .grp h2 small{font-size:14px;color:#9d93d0;letter-spacing:.04em;font-weight:400;margin-left:6px}
  .pair{display:flex;gap:18px}
  figure{width:${CW}px}
  .card{width:${CW}px;aspect-ratio:600/1040;border-radius:${Math.round(CW * 0.067)}px;overflow:hidden;background:#efe6d2;
        box-shadow:0 0 0 1px rgba(243,220,161,.55),0 14px 30px rgba(5,3,15,.55)}
  .card img{display:block;width:100%;height:100%;object-fit:cover}
  figcaption{margin-top:14px;font-size:16px;font-weight:700;color:#f1ecff;line-height:1.45;text-align:center}
  figcaption em{font-style:normal;font-weight:400;font-size:13px;color:#a79ddb}
  </style><body>
  <header><h1>스타로그 카드 vs 클래식</h1><p>같은 600:1040 상자, 앱과 똑같이 object-fit: cover로 자른 모습</p></header>
  <div class="wrap">${groups}</div></body></html>`;
}

// -------------------------------------------------------------------- legibility-90px.png
async function zoomTiles() {
  // true 90 px wide pixels (as on a DPR 1 screen), magnified 3x with nearest-neighbour; the reversed Starlog too
  const W = 90;
  const H = Math.round((W * 1040) / 600);
  const out = {};
  for (const id of CARDS) {
    const star = await sharp(path.join(RENDER, `${id}@3x.png`)).resize(W, H, { kernel: "lanczos3" }).png().toBuffer();
    const scan = await sharp(`${SCANS}/${id}.webp`).resize(W, H, { fit: "cover", kernel: "lanczos3" }).png().toBuffer();
    const rev = await sharp(star).rotate(180).png().toBuffer();
    for (const [k, buf] of [["star", star], ["scan", scan], ["rev", rev]]) {
      const f = path.join(TMP, `${id}-${k}-z.png`);
      await sharp(buf).resize(W * 3, H * 3, { kernel: "nearest" }).png().toFile(f);
      out[`${id}-${k}`] = f;
    }
  }
  return out;
}

function legibilityHtml(z) {
  const real = CARDS.map((id) => {
    const m = META[id];
    return `<div class="pr"><div class="c"><img class="sm" srcset="${url(path.join(RENDER, `${id}-sm.webp`))} 240w, ${url(path.join(RENDER, `${id}.webp`))} 600w" sizes="90px" width="90"></div>
      <div class="c"><img class="sm" src="${url(`${SCANS}/${id}-sm.webp`)}" srcset="${url(`${SCANS}/${id}-sm.webp`)} 240w, ${url(`${SCANS}/${id}.webp`)} 600w" sizes="90px" width="90"></div></div>`;
  }).join("");
  const zoom = CARDS.map((id) => `<div class="pr"><img src="${url(z[`${id}-star`])}"><img src="${url(z[`${id}-scan`])}"></div>`).join("");
  const rev = CARDS.map((id) => `<img src="${url(z[`${id}-rev`])}">`).join("");
  const fan = CARDS.map((id, i) => `<div class="f" style="--r:${(i - 1) * 11}deg;--x:${i * 52}px"><img src="${url(path.join(RENDER, `${id}-sm.webp`))}" width="90"></div>`).join("");
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{background:#0d0a26;color:#f1ecff;${FONT}padding:34px 40px 40px;width:max-content}
  h1{${SERIF}font-size:24px;color:#f3dca1;margin-bottom:6px}
  p.s{font-size:14px;color:#a79ddb;margin-bottom:22px}
  h3{font-size:14px;font-weight:700;color:#e9c46f;margin:26px 0 10px;letter-spacing:.02em}
  .row{display:flex;gap:26px;align-items:flex-start}
  .pr{display:flex;gap:8px}
  .c img,.sm{display:block;width:90px;border-radius:7px;box-shadow:0 0 0 1px rgba(243,220,161,.55),0 6px 12px rgba(5,3,15,.5);background:#efe6d2}
  .zoomrow .pr img{width:270px;image-rendering:pixelated;border-radius:0}
  .revrow img{width:270px;image-rendering:pixelated}
  .fanbox{position:relative;width:420px;height:210px;margin-top:6px}
  .f{position:absolute;left:var(--x);top:20px;transform:rotate(var(--r));transform-origin:50% 100%}
  .f img{display:block;border-radius:7px;box-shadow:0 0 0 1px rgba(243,220,161,.55),0 8px 16px rgba(5,3,15,.6)}
  </style><body>
  <h1>작은 크기 가독성 (앱 부채꼴 폭 90px)</h1>
  <p class="s">왼쪽이 스타로그, 오른쪽이 클래식 스캔. 첫 줄은 DPR 2 화면에서 srcset(240w)을 쓴 실제 모습.</p>
  <h3>① 실제 크기 90px × 3장 (스타로그 | 스캔)</h3><div class="row">${real}</div>
  <h3>② 90px 픽셀 그대로 3배 확대 (DPR 1 화면에서 보이는 정보량)</h3><div class="row zoomrow">${zoom}</div>
  <h3>③ 역방향(180° 회전) 스타로그 3배 확대: 번호와 이름 판이 위아래로 뒤집힘</h3><div class="row revrow">${rev}</div>
  <h3>④ 부채꼴 목업 (겹쳐 놓은 모습)</h3><div class="fanbox">${fan}</div>
  </body></html>`;
}

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

await writeFile(path.join(TMP, "comparison.html"), comparisonHtml());
await page.goto(url(path.join(TMP, "comparison.html")));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(ROOT, "comparison.png"), fullPage: true });

const z = await zoomTiles();
const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
const page2 = await ctx2.newPage();
await writeFile(path.join(TMP, "legibility.html"), legibilityHtml(z));
await page2.goto(url(path.join(TMP, "legibility.html")));
await page2.evaluate(() => document.fonts.ready);
await page2.waitForTimeout(500);
await page2.screenshot({ path: path.join(ROOT, "legibility-90px.png"), fullPage: true });

await browser.close();
console.log("comparison.png, legibility-90px.png");
